/** Borrow a local SDK editor as a slash-command host. The editor and its history stay owned elsewhere. */
import {mountRichSlashCommands,type RichCommand,type RichCommandOutcome,type RichSearchHost,type RichSlashCommandHost,type RichSlashCommandOptions,type RichSlashCommands,type RichUiLocale} from "@breditor/experimental-rich-content";
import type {RichEditorView,RichSelectionPolicy} from "@breditor/experimental-rich-content";

/** Satisfied by `LocalEditor` and `LocalDocumentEditor`. */
export interface SlashCommandEditor {
 readonly surface:HTMLElement;
 /** Optional: when present the menu uses the editor's chrome catalog and direction. */
 uiLocale?():RichUiLocale;
 search():RichSearchHost;
 view():RichEditorView<RichSelectionPolicy>;
 execute(command:RichCommand,focus?:boolean,revision?:string):RichCommandOutcome|"queued";
 focus():void;
 /** Optional: when it returns true, an allowlisted item runs as one native `replaceTriggerThen` (one Undo step). */
 supportsTriggerComposite?():boolean;
}
export function slashCommandHost(editor:SlashCommandEditor):RichSlashCommandHost {
 const search=editor.search();
 return Object.freeze({surface:editor.surface,searchState:()=>search.searchState(),subscribeSearch:(listener:()=>void)=>search.subscribeSearch(listener),view:()=>editor.view(),execute:(command:RichCommand,focus?:boolean,revision?:string)=>editor.execute(command,focus,revision),focus:()=>editor.focus(),...(editor.uiLocale?{uiLocale:()=>editor.uiLocale!()}:{}),...(editor.supportsTriggerComposite?{supportsTriggerComposite:()=>editor.supportsTriggerComposite!()}:{})});
}
/** Mount opt-in slash commands over a local editor. Dispose before disposing the editor's host. */
export function mountSlashCommands(editor:SlashCommandEditor,options:RichSlashCommandOptions):RichSlashCommands {
 return mountRichSlashCommands(slashCommandHost(editor),options);
}
