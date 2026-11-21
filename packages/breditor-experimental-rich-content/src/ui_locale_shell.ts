/**
 * Chrome strings of the opt-in editor shell (menu bar, keyboard shortcut help, empty-line block menu;
 * docs/EDITOR_SHELL.md). Kept in a separate block so the original catalog keys stay byte-identical.
 * `ui_locale.ts` merges these keys into `RichUiStrings`; they are validated and overridden like any other key.
 */
export interface RichShellUiStrings {
 readonly menuBarLabel:string;readonly menuEdit:string;readonly menuInsert:string;readonly menuFormat:string;readonly menuTable:string;
 readonly menuTools:string;readonly menuHelp:string;readonly menuKeyboardShortcuts:string;
 readonly floatingMenuLabel:string;
 readonly shortcutHelpTitle:string;readonly shortcutHelpIntro:string;readonly shortcutHelpClose:string;readonly shortcutHelpOr:string;readonly shortcutHelpEmpty:string;
 readonly shortcutGroupHistory:string;readonly shortcutGroupFormatting:string;readonly shortcutGroupBlocks:string;
 readonly shortcutGroupNavigation:string;readonly shortcutGroupCommands:string;readonly shortcutGroupInterface:string;
 readonly shortcutUndo:string;readonly shortcutRedo:string;readonly shortcutBold:string;readonly shortcutItalic:string;readonly shortcutUnderline:string;readonly shortcutStrike:string;
 readonly shortcutSelectAll:string;readonly shortcutHardBreak:string;readonly shortcutExitCode:string;
 readonly shortcutAlignLeft:string;readonly shortcutAlignCenter:string;readonly shortcutAlignRight:string;readonly shortcutAlignJustify:string;
 readonly shortcutFlowBefore:string;readonly shortcutFlowAfter:string;
 readonly shortcutFocusToolbar:string;readonly shortcutFocusBlockMenu:string;readonly shortcutContextMenu:string;readonly shortcutFocusMenuBar:string;
 readonly shortcutOpenHelp:string;readonly shortcutLeaveUi:string;readonly shortcutMoveBlockUp:string;readonly shortcutMoveBlockDown:string;
 readonly keyControl:string;readonly keyCommand:string;readonly keyAlt:string;readonly keyOption:string;readonly keyShift:string;
}
/** English defaults of the editor shell chrome. */
export const richShellUiStringsEn:Readonly<RichShellUiStrings>=Object.freeze({
 menuBarLabel:"Editor menu",menuEdit:"Edit",menuInsert:"Insert",menuFormat:"Format",menuTable:"Table",
 menuTools:"Tools",menuHelp:"Help",menuKeyboardShortcuts:"Keyboard shortcuts",
 floatingMenuLabel:"Insert block",
 shortcutHelpTitle:"Keyboard shortcuts",shortcutHelpIntro:"Shortcuts active in this editor.",shortcutHelpClose:"Close",shortcutHelpOr:"or",shortcutHelpEmpty:"No keyboard shortcuts are active.",
 shortcutGroupHistory:"History",shortcutGroupFormatting:"Text formatting",shortcutGroupBlocks:"Blocks",
 shortcutGroupNavigation:"Navigation and selection",shortcutGroupCommands:"Commands",shortcutGroupInterface:"Editor interface",
 shortcutUndo:"Undo",shortcutRedo:"Redo",shortcutBold:"Bold",shortcutItalic:"Italic",shortcutUnderline:"Underline",shortcutStrike:"Strikethrough",
 shortcutSelectAll:"Select all",shortcutHardBreak:"Line break within the block",shortcutExitCode:"Leave the code block",
 shortcutAlignLeft:"Align left",shortcutAlignCenter:"Align center",shortcutAlignRight:"Align right",shortcutAlignJustify:"Justify",
 shortcutFlowBefore:"Move before the adjacent object",shortcutFlowAfter:"Move after the adjacent object",
 shortcutFocusToolbar:"Move focus to the floating toolbar",shortcutFocusBlockMenu:"Move focus to the empty-line block menu",shortcutContextMenu:"Open the context menu",shortcutFocusMenuBar:"Move focus to the menu bar",
 shortcutOpenHelp:"Show keyboard shortcuts",shortcutLeaveUi:"Close a menu or dialog and return to the text",shortcutMoveBlockUp:"Move the block up",shortcutMoveBlockDown:"Move the block down",
 keyControl:"Ctrl",keyCommand:"Command",keyAlt:"Alt",keyOption:"Option",keyShift:"Shift",
});
export const richShellUiParameters:Readonly<Partial<Record<keyof RichShellUiStrings,readonly string[]>>>={};
