# Task Walker 1.1.0

PowerToys Window Walkerを参考にした、Windows 11 x64向けの実ウィンドウ切替アプリです。開いているトップレベルウィンドウを検索・並び替え・前面化・終了できます。

## 起動

配布版は `release/Task-Walker-1.1.0-portable.exe` をダブルクリックします。一般ユーザー権限で起動するため、通常はUAC確認なしで利用できます。インストールは不要です。

- `Alt+W`: Task Walkerの表示／非表示
- `Enter`: 選択したウィンドウへ切り替え
- `Ctrl+Enter`: 選択したウィンドウへ終了要求（未保存確認は対象アプリが表示）
- `Ctrl+,`: 設定を表示
- `Alt`を400ms以内に2回: 現在アクティブなタイトルをカーソル付近に2秒表示
- `Alt+C`: 現在アクティブなウィンドウ名をクリップボードへコピー

ショートカットと、アプリ種別・最近使用・ウィンドウ名それぞれの昇順／降順は設定に保存されます。

Task Walkerを開く直前に表示していたウィンドウは、一覧の青い線と「表示中」ラベルで識別できます。表示時はその行が初期選択され、上下キーですぐ移動できます。

## 開発

```powershell
npm.cmd install
npm.cmd run dev
```

ブラウザープレビューだけは確認用モックを表示します。Electronで起動すると必ず実ウィンドウを使用し、表示中だけ1秒間隔で更新します。

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run smoke
npm.cmd run dist
```

設定はElectronのユーザーデータ領域へ保存します。列挙したタイトル、パス、履歴は保存・送信しません。管理者権限で動くウィンドウは一覧に表示されますが、Windowsの権限分離により切替・終了が拒否される場合があります。未署名アプリのためSmartScreen警告が表示される場合があります。

## 配布物

- `release/Task-Walker-1.1.0-portable.exe`
- SHA-256: `5FB45A73854E12397E19D36901A30570267AC94B05322FEFC18FBBF3166EE132`
