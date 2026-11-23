# Installed native browser smoke, November 22, 2026

The installed SDK production fixture ran on a MacBookPro18,1 with Apple
Silicon and macOS 26.6.2. The four original npm archives were rehashed after
the browser checks. Each archive was version `0.3.0-alpha.22`.

- `@breditor/browser` ·
  `570a0521a3421773abb72d113542f13253c03dc23199f44c67354556a08aa7ca`
- `@breditor/experimental-rich-content` ·
  `2769a821f1dac5396c8166663885aa9d6f1288c9bde686b6f8eeee52805258f5`
- `@breditor/collaboration` ·
  `2d29ace4a63afa0a7bf5298411ed98a14c629be21933a37a12bf5456cb90990a`
- `@breditor/editor` ·
  `ff50188718a1587bc21fda0e0700a2f4de61085ae00d083cf569789d29c713dd`

## Safari 26.6.2

A local Safari tab opened the installed vanilla editor. System clipboard paste
updated an image caption containing an emoji. Command-Z restored the original
caption, and Command-Shift-Z restored the edit. Saving the session and reloading
restored the edited caption with Undo available. A second paste after reload
updated the caption, and Command-Z restored the saved caption.

The checks used the Safari window, its keyboard shortcuts, and the editor's
visible accessibility state. Safari WebDriver reported that Remote Automation
was disabled. The manual pass covered paste and the visible session state.

## Google Chrome 157.0.8103.80

The installed shared lifecycle and typing-history specs passed twice, for 42
cases. They exercised mount and retirement, duplicate writers, quota failure,
durable reload, and selective history. Three further rounds used the Chrome
clipboard and keyboard copy and paste. Each copy and paste event was trusted,
and each paste produced one history step with byte-exact document Undo and Redo.

## Remaining browser qualification

The Safari pass covered the local editor and a save/reload. The historical
intermittent startup rejection needs a reproduced cause and repair or a reviewed
supported-environment policy. The exact RC still needs integrated browser and
physical input qualification.
See [WebKit fault containment and recovery](../WEBKIT_FAULT_RECOVERY.md).
