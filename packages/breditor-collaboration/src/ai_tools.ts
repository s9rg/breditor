/**
 * Opt-in AI rewrite and language-check tools over a shared editor (docs/AI_AND_LANGUAGE_TOOLS.md, "Shared editors").
 * The same provider contract as local editors: the host supplies the provider; nothing here performs I/O or logs.
 * Text is read from the shared owner's admitted document JSON; Accept is one guarded native plain-text range
 * replacement (one explicit history group) submitted with the exact current revision. A rewrite review is bound to
 * its target region only (`aiStaleScope:"target"`), so peer edits elsewhere never block it.
 */
import {mountRichAiTools,mountRichLanguageCheck,type RichAiToolsHost,type RichAiToolsOptions,type RichAiTools,type RichLanguageCheck,type RichLanguageCheckOptions,type RichCommandOutcome,type RichDocumentSelection,type RichUiLocale} from "@breditor/experimental-rich-content";
import type {RichSelection} from "./types.js";

type TextRange=Extract<RichSelection,{kind:"text"}>;
/** Structural shape satisfied by `SharedDomEditor` (both selection policies). The editor stays owned elsewhere. */
export interface SharedAiEditorPort {
 readonly surface:HTMLElement;
 searchState():{readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean};
 subscribeSearch(listener:()=>void):()=>void;
 view():{readonly revision:string;readonly documentJson:string;readonly selection:RichDocumentSelection|null;readonly rangeEditing?:string|undefined;readonly readOnly?:boolean|undefined};
 replacePlainTextRange(selection:TextRange,text:string,focus?:boolean,revision?:string):void;
 select(selection:RichSelection|null,focus?:boolean,revision?:string):void;
 focus():void;
 uiLocale?():RichUiLocale;
}
/** An SDK shared session (or any owner) that lends its AI port. */
export interface SharedAiToolsSession {aiTools():RichAiToolsHost}
export type SharedAiToolsSource=SharedAiEditorPort|SharedAiToolsSession;

/** Adapt a shared DOM editor to the AI tools port. Formatted (Markdown/HTML) rewrite output is not offered. */
export function sharedAiToolsHost(editor:SharedAiEditorPort):RichAiToolsHost {
 for(const name of ["searchState","subscribeSearch","view","replacePlainTextRange","select","focus"] as const)if(typeof editor?.[name]!=="function")throw new TypeError("Expected a shared DOM editor");
 const applied=(before:string):RichCommandOutcome|"queued"=>{const state=editor.searchState();if(state.busy||state.composing)return "queued";return editor.view().documentJson===before?"unchanged":"content";};
 return Object.freeze({
  surface:editor.surface,
  aiStaleScope:"target" as const,
  aiState:()=>{const s=editor.searchState();return Object.freeze({revision:s.revision,closed:s.closed,busy:s.busy,composing:s.composing,readOnly:s.readOnly});},
  subscribeAi:(listener:()=>void)=>editor.subscribeSearch(listener),
  aiView:()=>{const v=editor.view();return Object.freeze({revision:v.revision,documentJson:v.documentJson,selection:v.selection,rangeEditing:v.rangeEditing,readOnly:v.readOnly});},
  replaceAiText:(selection:TextRange,text:string,revision:string,focus:boolean)=>{const before=editor.view().documentJson;editor.replacePlainTextRange(selection,text,focus,revision);return applied(before);},
  pasteAiTransfer:()=>{throw Error("Formatted rewrite output is not offered for shared editors");},
  selectAiRange:(selection:TextRange,revision:string)=>{editor.select(selection,false,revision);return "selection" as const;},
  focus:()=>editor.focus(),
  ...(typeof editor.uiLocale==="function"?{uiLocale:()=>editor.uiLocale!()}:{}),
 });
}
function port(source:SharedAiToolsSource):RichAiToolsHost {
 if(source&&typeof (source as SharedAiToolsSession).aiTools==="function"){const host=(source as SharedAiToolsSession).aiTools();if(host.aiStaleScope!=="target")throw new TypeError("Expected a shared AI tools port");return host;}
 return sharedAiToolsHost(source as SharedAiEditorPort);
}
/** Mount the rewrite review panel for a shared editor in `root` (outside the editing surface). Plain-text output only. */
export function mountSharedAiTools(root:HTMLElement,source:SharedAiToolsSource,options:RichAiToolsOptions={}):RichAiTools {
 if(options?.interchange!==undefined)throw new TypeError("Formatted rewrite output is not offered for shared editors; omit interchange");
 return mountRichAiTools(root,port(source),options);
}
/** Mount the spelling/grammar review for a shared editor in `root` (outside the editing surface). */
export function mountSharedLanguageCheck(root:HTMLElement,source:SharedAiToolsSource,options:RichLanguageCheckOptions={}):RichLanguageCheck {
 return mountRichLanguageCheck(root,port(source),options);
}
