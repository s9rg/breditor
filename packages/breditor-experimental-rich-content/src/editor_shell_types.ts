/** Opt-in editor shell presentations (docs/EDITOR_SHELL.md). They borrow admitted controls; none holds document state. */
import type {RichContextUiOptions,RichSelectionToolbar,RichSelectionToolbarOptions} from "./context_ui_types.js";
import type {RichShortcutEntry,RichShortcutPlatform} from "./shortcut_registry.js";
/** One top-level menu: a stable id, an optional label (catalog label for the standard ids) and admitted control ids. */
export interface RichMenuBarMenu {readonly id:string;readonly label?:string;readonly controls:readonly string[]}
export interface RichMenuBarOptions {
 /** Explicit menus, in order. Every control id must be admitted; a control may appear in one menu only. Omitted uses
  * `richMenuBarDefaults` filtered to the admitted controls, dropping empty menus. */
 menus?:readonly RichMenuBarMenu[];
 /** Element outside editable content that receives the menu bar (inserted first). Defaults to the editor root. */
 container?:HTMLElement;
 label?:string;
 /** Chord that moves focus to the menu bar from anywhere in the editor root (default `Alt+F9`; `null` disables). */
 focusShortcut?:string|null;
 /** Hide controls whose Rust-derived state is disabled (default false: shown with `aria-disabled`, skipped by arrows). */
 hideDisabled?:boolean;
 /** Adds a Help menu item that opens this dialog. */
 help?:RichShortcutHelp;
 onError?:(error:unknown)=>void;
}
export interface RichMenuBarState {
 readonly open:string|null;readonly disposed:boolean;
 readonly menus:readonly {readonly id:string;readonly label:string;readonly controls:readonly string[]}[];
}
export interface RichMenuBar {
 readonly element:HTMLElement;
 state():RichMenuBarState;
 /** Move focus to the menu bar (the last focused top-level item). False when disposed or the editor closed. */
 focus():boolean;
 /** Open one menu and focus its first enabled item. */
 open(id:string):boolean;
 /** Close the open menu; `returnFocus` (default false) moves focus back to the editor. */
 close(returnFocus?:boolean):void;
 dispose():void;
}
export interface RichShortcutHelpOptions {
 /** Chord that opens the dialog from anywhere in the editor root (default `Alt+0`; `null` disables). */
 shortcut?:string|null;
 /** Key display: `apple` shows ⌘/⌥/⇧, `other` Ctrl/Alt/Shift. Default `auto` reads `navigator` for presentation only. */
 platform?:"auto"|RichShortcutPlatform;
 /** Element that receives the fixed-position dialog. Defaults to the editor root. */
 container?:HTMLElement;
 label?:string;
 onError?:(error:unknown)=>void;
}
export interface RichShortcutHelpState {readonly open:boolean;readonly disposed:boolean;readonly platform:RichShortcutPlatform;readonly shortcut:string|null}
export interface RichShortcutHelp {
 readonly element:HTMLElement;
 state():RichShortcutHelpState;
 /** The entries the dialog renders now: the coordinator's chords followed by mounted presentations. */
 entries():readonly RichShortcutEntry[];
 /** Open the modal dialog and move focus into it. False when disposed or the editor closed. */
 open():boolean;
 /** Close and return focus to the element focused before opening (the editor when that is gone). */
 close():void;
 dispose():void;
}
export interface RichFloatingMenuOptions extends RichContextUiOptions {
 /** Hide controls whose Rust-derived state is disabled (default true). */
 hideDisabled?:boolean;
}
export interface RichFloatingMenuState {readonly visible:boolean;readonly disposed:boolean;readonly controls:readonly string[]}
export interface RichFloatingMenu {
 readonly element:HTMLElement;
 state():RichFloatingMenuState;
 /** Move focus to the first enabled control (also Alt+F10 in the editor while visible). False when hidden. */
 focus():boolean;
 /** Hide until the editor publishes another revision. */
 dismiss():void;
 refresh():void;
 dispose():void;
}
export interface RichBalloonBlockLayoutOptions {
 selectionToolbar?:RichSelectionToolbarOptions|false;
 floatingMenu?:RichFloatingMenuOptions|false;
 help?:RichShortcutHelpOptions|false;
 /** Hide the coordinator's fixed toolbar while the layout is mounted (default true). Controls stay admitted. */
 hideToolbar?:boolean;
}
export interface RichBalloonBlockLayout {
 readonly selectionToolbar:RichSelectionToolbar|null;readonly floatingMenu:RichFloatingMenu|null;readonly help:RichShortcutHelp|null;
 dispose():void;
}
