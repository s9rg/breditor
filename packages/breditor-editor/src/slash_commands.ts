/** Borrow a local SDK editor as a slash-command host. The editor and its history stay owned elsewhere. */
import {mountRichSlashCommands,type RichCommand,type RichCommandOutcome,type RichSearchHost,type RichSlashCommandHost,type RichSlashCommandOptions,type RichSlashCommands} from "@breditor/experimental-rich-content";
import type {RichEditorView,RichSelectionPolicy} from "@breditor/experimental-rich-content";

/** Satisfied by `LocalEditor` and `LocalDocumentEditor`. */
export interface SlashCommandEditor {
 readonly surface:HTMLElement;
 search():RichSearchHost;
 view():RichEditorView<RichSelectionPolicy>;
 execute(command:RichCommand,focus?:boolean,revision?:string):RichCommandOutcome|"queued";
 focus():void;
}
export function slashCommandHost(editor:SlashCommandEditor):RichSlashCommandHost {
 const search=editor.search();
 return Object.freeze({surface:editor.surface,searchState:()=>search.searchState(),subscribeSearch:(listener:()=>void)=>search.subscribeSearch(listener),view:()=>editor.view(),execute:(command:RichCommand,focus?:boolean,revision?:string)=>editor.execute(command,focus,revision),focus:()=>editor.focus()});
}
/** Mount opt-in slash commands over a local editor. Dispose before disposing the editor's host. */
export function mountSlashCommands(editor:SlashCommandEditor,options:RichSlashCommandOptions):RichSlashCommands {
 return mountRichSlashCommands(slashCommandHost(editor),options);
}
