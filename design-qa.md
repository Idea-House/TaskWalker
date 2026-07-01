# Task Walker 1.1.0 Design QA

- Source visual truth: `C:\Users\weng\AppData\Local\Temp\codex-clipboard-2ded01ce-1d15-47f7-9e6d-f7b1dfe4245d.png`
- Dark implementation: `D:\04_Study\02_試験室\07_WindowWalker\task-walker-v110-active-dark.png`
- Light implementation: `D:\04_Study\02_試験室\07_WindowWalker\task-walker-v110-active-light.png`
- Full-view comparison: `D:\04_Study\02_試験室\07_WindowWalker\design-comparison-v110-active.png`
- Viewport/state: 944×502, empty query, application-type ascending, active row initially selected
- Focused evidence: the active row is readable at full resolution; its 3px accent line, 10px status label, native icon, title and process metadata are all visible in the comparison.

## Findings

No actionable P0, P1, or P2 findings remain.

- Fonts and typography: Segoe UI Variable hierarchy is unchanged; the compact 10px「表示中」label is legible without competing with the title.
- Spacing and layout rhythm: the 44px row height and existing title/process alignment are preserved. The status pill occupies unused trailing space.
- Colors and visual tokens: the Fluent accent color clearly separates active state from the neutral selected background in dark and light themes.
- Image quality and asset fidelity: native application icons and the Excel icon correction remain sharp and unchanged.
- Copy and content:「表示中」is short, specific and also included in the option's accessible name.
- Interaction and accessibility: active and selected states remain independent; the active row is initially selected and scrolls into view, while subsequent keyboard/mouse selection is preserved during refresh.

## Intentional deviation

- The source reference has no active-window marker. The accent line and status label are the requested 1.1.0 addition and use existing Fluent tokens.

## Patches since 1.0.2

- Added native tracking of the last valid external foreground HWND and `isActive` list state.
- Added one-time active-row initial selection and nearest scrolling per overlay opening.
- Added persistent active-row visuals and screen-reader labeling without altering the preload API.

## Verification

- 14 UI/unit tests passed.
- Native self-test passed with exactly one active row, correct HWND and exit code 0.
- TypeScript, Vite, icon generation and C# compilation passed.
- Dark/light browser captures and the side-by-side comparison show no actionable layout drift.
- Portable x64 build completed as `Task-Walker-1.1.0-portable.exe` with `asInvoker` retained.
- SHA-256: `5FB45A73854E12397E19D36901A30570267AC94B05322FEFC18FBBF3166EE132`.

final result: passed
