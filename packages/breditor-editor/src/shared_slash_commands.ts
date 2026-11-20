/**
 * Borrow a shared SDK session as a slash-command host. The session, its history and its native
 * owner stay owned elsewhere. Execution is one guarded shared batch (one Undo step). Shared rich
 * V4 sessions also take an `@` mention menu (`mountMentions`, shared_mentions.ts).
 */
import {mountSharedSlashCommands,createSharedSlashCommands,standardSharedSlashPicks,type SharedSlashCommandHost,type SharedSlashCommandOptions,type SharedSlashCommands,type SharedSlashProvider,type SharedDispatch,type SharedToolbarControl,type SharedSelectionPolicy,type SharedEditorView,type RichSearchHost} from "@breditor/collaboration";
import type {RichUiLocale} from "@breditor/experimental-rich-content";

/** Satisfied by `SharedEditorSession` and `SharedDocumentEditorSession`. */
export interface SharedSlashCommandEditor<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly surface:HTMLElement;
 search():Pick<RichSearchHost,"searchState"|"subscribeSearch">;
 view():SharedEditorView<P>;
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
 focus():void;
 uiLocale?():RichUiLocale;
 /** Optional: the mounted toolbar; required only when `items` is omitted. */
 toolbarControls?():readonly SharedToolbarControl<P>[];
}
/** `items` defaults to the standard shared catalog built from the session's own toolbar controls. */
export type SharedSlashCommandsOptions=Omit<SharedSlashCommandOptions,"items">&{items?:SharedSlashProvider};
export function sharedSlashCommandHost<P extends SharedSelectionPolicy>(editor:SharedSlashCommandEditor<P>):SharedSlashCommandHost {
 const search=editor.search();
 return Object.freeze({surface:editor.surface,searchState:()=>search.searchState(),subscribeSearch:(listener:()=>void)=>search.subscribeSearch(listener),view:()=>editor.view() as SharedEditorView<SharedSelectionPolicy>,execute:(request:SharedDispatch,focus?:boolean,revision?:string)=>editor.execute(request,focus,revision),focus:()=>editor.focus(),...(editor.uiLocale?{uiLocale:()=>editor.uiLocale!()}:{})});
}
/** Standard shared items for a session: its own toolbar controls, relabelled through its UI catalog. */
export function sharedSlashCommands<P extends SharedSelectionPolicy>(editor:Pick<SharedSlashCommandEditor<P>,"toolbarControls"|"uiLocale">):SharedSlashProvider {
 if(!editor.toolbarControls)throw Error("Pass slash-command items, or an editor that exposes toolbarControls()");
 return createSharedSlashCommands(editor.toolbarControls(),standardSharedSlashPicks,editor.uiLocale?.());
}
/** Mount opt-in slash commands over a shared session. Dispose before closing the session. */
export function mountSlashCommands<P extends SharedSelectionPolicy>(editor:SharedSlashCommandEditor<P>,options:SharedSlashCommandsOptions={}):SharedSlashCommands {
 return mountSharedSlashCommands(sharedSlashCommandHost(editor),{...options,items:options.items??sharedSlashCommands(editor)});
}
