using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class Program
{
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int WM_CLOSE = 0x0010;
    private const int LLKHF_INJECTED = 0x10;
    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_NOACTIVATE = 0x08000000L;
    private const uint GA_ROOTOWNER = 3;
    private const int DWMWA_CLOAKED = 14;
    private const int SW_RESTORE = 9;
    private const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    private const uint WINEVENT_OUTOFCONTEXT = 0;
    private const int DoubleTapMilliseconds = 400;

    private static readonly object OutputLock = new object();
    private static readonly object ActivityLock = new object();
    private static readonly Dictionary<IntPtr, long> Activity = new Dictionary<IntPtr, long>();
    private static readonly LowLevelKeyboardProc HookCallback = KeyboardHook;
    private static readonly WinEventDelegate ForegroundCallback = ForegroundChanged;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 };
    private static IntPtr hookHandle;
    private static IntPtr foregroundHook;
    private static long activitySequence;
    private static IntPtr activeWindow;
    private static int hostProcessId;
    private static bool selfTest;
    private static bool altDown;
    private static bool modifiedDuringAlt;
    private static bool controlDown;
    private static bool shiftDown;
    private static bool windowsDown;
    private static long lastAltTapTicks;

    [STAThread]
    private static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        int.TryParse(Environment.GetEnvironmentVariable("TASK_WALKER_HOST_PID"), out hostProcessId);
        selfTest = Array.IndexOf(args, "--self-test") >= 0;

        if (selfTest)
        {
            EmitLine("READY");
            long baseline = Stopwatch.Frequency;
            bool firstTap = IsDoubleTap(baseline);
            bool secondTap = IsDoubleTap(baseline + Stopwatch.Frequency / 4);
            EmitLine(!firstTap && secondTap ? "LOGIC_OK" : "LOGIC_ERROR");
            EmitTitle("Task Walker Native Hook");
            InputLoop();
            return 0;
        }

        using (Process process = Process.GetCurrentProcess())
        using (ProcessModule module = process.MainModule)
        {
            hookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, HookCallback, GetModuleHandle(module.ModuleName), 0);
        }
        foregroundHook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, ForegroundCallback, 0, 0, WINEVENT_OUTOFCONTEXT);

        if (hookHandle == IntPtr.Zero || foregroundHook == IntPtr.Zero)
        {
            Console.Error.WriteLine("HOOK_ERROR:" + Marshal.GetLastWin32Error());
            return 2;
        }

        SeedActivity();
        RememberForegroundWindow(GetForegroundWindow());
        Thread inputThread = new Thread(InputLoop) { IsBackground = true, Name = "TaskWalkerNativeInput" };
        inputThread.Start();
        EmitLine("READY");

        MSG message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref message);
            DispatchMessage(ref message);
        }

        UnhookWindowsHookEx(hookHandle);
        UnhookWinEvent(foregroundHook);
        return 0;
    }

    private static void InputLoop()
    {
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            string[] parts = line.Split('|');
            if (parts.Length < 2) continue;
            string command = parts[0];
            string requestId = parts[1];
            try
            {
                if (command == "LIST")
                    EmitResponse(new NativeResponse { type = "response", id = requestId, ok = true, windows = selfTest ? SelfTestWindows() : EnumerateWindows() });
                else if (command == "ACTIVATE" && parts.Length >= 3)
                    EmitResponse(ActivateWindow(requestId, ParseHandle(parts[2])));
                else if (command == "CLOSE" && parts.Length >= 3)
                    EmitResponse(CloseWindow(requestId, ParseHandle(parts[2])));
                else
                    EmitResponse(Failure(requestId, "invalid-request"));
            }
            catch (Exception error)
            {
                EmitResponse(new NativeResponse { type = "response", id = requestId, ok = false, error = "native-error", message = error.Message });
            }
        }
    }

    private static List<WindowRecord> SelfTestWindows()
    {
        string executablePath = Environment.GetEnvironmentVariable("TASK_WALKER_ICON_TEST_PATH") ?? "";
        return new List<WindowRecord> {
            new WindowRecord {
                id = "1001", hwnd = "1001", pid = 1234, title = "Task Walker Native Test",
                appName = "Native Test", processName = "NativeTest.exe", executablePath = executablePath,
                minimized = false, lastActive = 1, isActive = true
            }
        };
    }

    private static List<WindowRecord> EnumerateWindows()
    {
        List<WindowRecord> windows = new List<WindowRecord>();
        IntPtr activeSnapshot = activeWindow;
        int zOrder = 0;
        EnumWindows(delegate(IntPtr window, IntPtr state)
        {
            try
            {
                WindowRecord record = ReadWindow(window, zOrder++);
                if (record != null) record.isActive = window == activeSnapshot;
                if (record != null) windows.Add(record);
            }
            catch { }
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    private static WindowRecord ReadWindow(IntPtr window, int zOrder)
    {
        if (!IsWindowVisible(window) || GetAncestor(window, GA_ROOTOWNER) != window) return null;
        long exStyle = GetWindowLongPtr(window, GWL_EXSTYLE).ToInt64();
        if ((exStyle & WS_EX_TOOLWINDOW) != 0 || (exStyle & WS_EX_NOACTIVATE) != 0) return null;
        int cloaked;
        if (DwmGetWindowAttribute(window, DWMWA_CLOAKED, out cloaked, sizeof(int)) == 0 && cloaked != 0) return null;

        string title = ReadTitle(window).Trim();
        if (title.Length == 0) return null;

        uint rawPid;
        GetWindowThreadProcessId(window, out rawPid);
        int pid = unchecked((int)rawPid);
        if (pid == 0 || pid == Process.GetCurrentProcess().Id || pid == hostProcessId) return null;

        Process process = ResolveProcess(window, pid);
        string processName = Safe(delegate { return process.ProcessName + ".exe"; }, "Unknown.exe");
        string executablePath = Safe(delegate { return process.MainModule.FileName; }, "");
        string appName = Safe(delegate
        {
            FileVersionInfo info = process.MainModule.FileVersionInfo;
            return FirstValue(info.FileDescription, info.ProductName, Path.GetFileNameWithoutExtension(processName));
        }, Path.GetFileNameWithoutExtension(processName));

        long active;
        lock (ActivityLock)
        {
            if (!Activity.TryGetValue(window, out active))
            {
                active = Math.Max(1, 100000 - zOrder);
                Activity[window] = active;
            }
        }

        string handle = window.ToInt64().ToString("X");
        return new WindowRecord {
            id = handle, hwnd = handle, pid = process.Id, title = title, appName = appName,
            processName = processName, executablePath = executablePath,
            minimized = IsIconic(window), lastActive = active
        };
    }

    private static Process ResolveProcess(IntPtr window, int pid)
    {
        Process process = Process.GetProcessById(pid);
        if (!String.Equals(process.ProcessName, "ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)) return process;
        int childPid = 0;
        EnumChildWindows(window, delegate(IntPtr child, IntPtr state)
        {
            uint raw;
            GetWindowThreadProcessId(child, out raw);
            if (raw != 0 && raw != pid) { childPid = unchecked((int)raw); return false; }
            return true;
        }, IntPtr.Zero);
        return childPid > 0 ? Process.GetProcessById(childPid) : process;
    }

    private static NativeResponse ActivateWindow(string requestId, IntPtr window)
    {
        if (selfTest) return Success(requestId);
        if (!IsWindow(window)) return Failure(requestId, "window-not-found");
        if (IsIconic(window)) ShowWindowAsync(window, SW_RESTORE);

        IntPtr foreground = GetForegroundWindow();
        uint currentThread = GetCurrentThreadId();
        uint ignoredProcessId;
        uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out ignoredProcessId);
        uint targetThread = GetWindowThreadProcessId(window, out ignoredProcessId);
        bool attachedForeground = false;
        bool attachedTarget = false;

        try
        {
            if (foregroundThread != 0 && foregroundThread != currentThread)
                attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
            if (targetThread != 0 && targetThread != currentThread && targetThread != foregroundThread)
                attachedTarget = AttachThreadInput(currentThread, targetThread, true);

            BringWindowToTop(window);
            if (!SetForegroundWindow(window)) return Failure(requestId, "activation-failed");
            return Success(requestId);
        }
        finally
        {
            if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
            if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
        }
    }

    private static NativeResponse CloseWindow(string requestId, IntPtr window)
    {
        if (selfTest) return Success(requestId);
        if (!IsWindow(window)) return Failure(requestId, "window-not-found");
        if (!PostMessage(window, WM_CLOSE, IntPtr.Zero, IntPtr.Zero))
        {
            int code = Marshal.GetLastWin32Error();
            return Failure(requestId, code == 5 ? "access-denied" : "native-error");
        }
        return Success(requestId);
    }

    private static void SeedActivity()
    {
        int rank = 100000;
        EnumWindows(delegate(IntPtr window, IntPtr state) { lock (ActivityLock) Activity[window] = rank--; return true; }, IntPtr.Zero);
        activitySequence = 100001;
    }

    private static void ForegroundChanged(IntPtr hook, uint eventType, IntPtr window, int objectId, int childId, uint thread, uint time)
    {
        if (window == IntPtr.Zero) return;
        lock (ActivityLock) Activity[window] = ++activitySequence;
        RememberForegroundWindow(window);
    }

    private static void RememberForegroundWindow(IntPtr window)
    {
        if (window == IntPtr.Zero || !IsWindowVisible(window) || GetAncestor(window, GA_ROOTOWNER) != window) return;
        long exStyle = GetWindowLongPtr(window, GWL_EXSTYLE).ToInt64();
        if ((exStyle & WS_EX_TOOLWINDOW) != 0 || (exStyle & WS_EX_NOACTIVATE) != 0) return;
        int cloaked;
        if (DwmGetWindowAttribute(window, DWMWA_CLOAKED, out cloaked, sizeof(int)) == 0 && cloaked != 0) return;
        if (String.IsNullOrWhiteSpace(ReadTitle(window))) return;
        uint rawPid;
        GetWindowThreadProcessId(window, out rawPid);
        int pid = unchecked((int)rawPid);
        if (pid == 0 || pid == Process.GetCurrentProcess().Id || pid == hostProcessId) return;
        activeWindow = window;
    }

    private static IntPtr KeyboardHook(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0)
        {
            KBDLLHOOKSTRUCT input = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(data, typeof(KBDLLHOOKSTRUCT));
            if ((input.flags & LLKHF_INJECTED) == 0)
            {
                int kind = message.ToInt32();
                bool down = kind == WM_KEYDOWN || kind == WM_SYSKEYDOWN;
                bool up = kind == WM_KEYUP || kind == WM_SYSKEYUP;
                int key = unchecked((int)input.vkCode);
                bool isAlt = key == 0x12 || key == 0xA4 || key == 0xA5;
                UpdateModifierState(key, down, up);
                if (down)
                {
                    if (isAlt && !altDown) { altDown = true; modifiedDuringAlt = controlDown || shiftDown || windowsDown; }
                    else if (altDown && !isAlt) modifiedDuringAlt = true;
                }
                else if (up && isAlt && altDown)
                {
                    if (!modifiedDuringAlt) RegisterAltTap();
                    altDown = false; modifiedDuringAlt = false;
                }
            }
        }
        return CallNextHookEx(hookHandle, code, message, data);
    }

    private static void UpdateModifierState(int key, bool down, bool up)
    {
        if (!down && !up) return;
        bool value = down;
        if (key == 0x11 || key == 0xA2 || key == 0xA3) controlDown = value;
        if (key == 0x10 || key == 0xA0 || key == 0xA1) shiftDown = value;
        if (key == 0x5B || key == 0x5C) windowsDown = value;
    }

    private static void RegisterAltTap() { if (IsDoubleTap(Stopwatch.GetTimestamp())) EmitTitle(ReadTitle(GetForegroundWindow())); }
    private static bool IsDoubleTap(long now)
    {
        double elapsed = lastAltTapTicks == 0 ? double.MaxValue : (now - lastAltTapTicks) * 1000.0 / Stopwatch.Frequency;
        if (elapsed <= DoubleTapMilliseconds) { lastAltTapTicks = 0; return true; }
        lastAltTapTicks = now; return false;
    }

    private static string ReadTitle(IntPtr window)
    {
        if (window == IntPtr.Zero) return "";
        StringBuilder title = new StringBuilder(Math.Max(GetWindowTextLength(window) + 1, 2));
        GetWindowText(window, title, title.Capacity);
        return title.ToString();
    }

    private static void EmitTitle(string title) { EmitLine("TITLE_BASE64:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(title ?? ""))); }
    private static void EmitResponse(NativeResponse response) { EmitLine("RESPONSE_BASE64:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(Json.Serialize(response)))); }
    private static void EmitLine(string line) { lock (OutputLock) { Console.WriteLine(line); Console.Out.Flush(); } }
    private static NativeResponse Success(string id) { return new NativeResponse { type = "response", id = id, ok = true }; }
    private static NativeResponse Failure(string id, string error) { return new NativeResponse { type = "response", id = id, ok = false, error = error }; }
    private static IntPtr ParseHandle(string value) { long parsed; return long.TryParse(value, System.Globalization.NumberStyles.HexNumber, null, out parsed) ? new IntPtr(parsed) : IntPtr.Zero; }
    private static string FirstValue(params string[] values) { foreach (string value in values) if (!String.IsNullOrWhiteSpace(value)) return value.Trim(); return "Unknown"; }
    private static T Safe<T>(Func<T> action, T fallback) { try { return action(); } catch { return fallback; } }

    private sealed class WindowRecord
    {
        public string id { get; set; }
        public string hwnd { get; set; }
        public int pid { get; set; }
        public string title { get; set; }
        public string appName { get; set; }
        public string processName { get; set; }
        public string executablePath { get; set; }
        public bool minimized { get; set; }
        public long lastActive { get; set; }
        public bool isActive { get; set; }
    }
    private sealed class NativeResponse
    {
        public string type { get; set; }
        public string id { get; set; }
        public bool ok { get; set; }
        public string error { get; set; }
        public string message { get; set; }
        public List<WindowRecord> windows { get; set; }
    }

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr state);
    private delegate IntPtr LowLevelKeyboardProc(int code, IntPtr message, IntPtr data);
    private delegate void WinEventDelegate(IntPtr hook, uint eventType, IntPtr window, int objectId, int childId, uint thread, uint time);
    [StructLayout(LayoutKind.Sequential)] private struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode; public int flags; public uint time; public IntPtr extraInfo; }
    [StructLayout(LayoutKind.Sequential)] private struct MSG { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public POINT point; }
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int x, y; }

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int maximum);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", SetLastError = true)] private static extern bool AttachThreadInput(uint sourceThreadId, uint targetThreadId, bool attach);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PostMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int hookId, LowLevelKeyboardProc callback, IntPtr module, uint threadId);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] private static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventDelegate callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)] private static extern IntPtr GetModuleHandle(string moduleName);
    [DllImport("user32.dll")] private static extern int GetMessage(out MSG message, IntPtr window, uint minimum, uint maximum);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG message);
}
