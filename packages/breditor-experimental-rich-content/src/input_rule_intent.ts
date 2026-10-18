// Browser routing metadata only. Rust recognizes every shortcut and owns every edit.
import type {RichCoreEditor,RichDocumentSelection,RichInputRuleOutcome,RichSelection} from "./core.js";

export type MarkdownInputCore=Pick<RichCoreEditor,"supportsMarkdownInputRules"|"supportsMarkdownInputRouting"|"insertPlainTextWithMarkdownRules"|"insertTypingTextWithMarkdownRules">;
export interface MarkdownInputIntent {readonly text:string;readonly namespace:string;readonly clockMs?:string}
export interface MarkdownInputSource {readonly revision:string;readonly selection:Extract<RichSelection,{kind:"text"}>}

/** Validate the complete pack before mounting or mutating the host. */
export function requireMarkdownInputRules(pack:unknown,core:MarkdownInputCore):boolean {
 if(!validateMarkdownInputPolicy(pack))return false;
 if(core.supportsMarkdownInputRules?.()!==true||core.supportsMarkdownInputRouting?.()!==true||typeof core.insertPlainTextWithMarkdownRules!=="function"||typeof core.insertTypingTextWithMarkdownRules!=="function")throw Error("Use complete matching native Markdown input rules and browser routing");
 return true;
}

/** Startup rejects unknown policies before acquiring durable storage or native ownership. */
export function validateMarkdownInputPolicy(pack:unknown):boolean {
 if(pack===undefined)return false;
 if(pack!=="markdown-v1")throw new TypeError("Expected inputRules markdown-v1 or omission");
 return true;
}

/** Eligibility is not Markdown matching: multi-character replacement paths stay ordinary. */
export function isPlainInputScalar(text:string):boolean{return text.length===1||text.length===2&&[...text].length===1;}

/** Capture the intended caret and exactly the one allowed selection-sync publication. */
export function captureMarkdownInputSource(revision:string,selection:RichDocumentSelection|null,willSync:boolean):MarkdownInputSource|null {
 if(selection?.kind!=="text"||selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset)return null;
 return Object.freeze({revision:(BigInt(revision)+(willSync?1n:0n)).toString(),selection:Object.freeze({kind:"text" as const,anchor:Object.freeze({...selection.anchor}),focus:Object.freeze({...selection.focus})})});
}

/** A selection callback, pending-format change or other publication cannot retarget input. */
export function checkMarkdownInputSource(view:{revision:string;selection:RichDocumentSelection|null},source:MarkdownInputSource):void {
 const selection=view.selection,expected=source.selection;
 if(view.revision!==source.revision||selection?.kind!=="text"||selection.anchor.block!==expected.anchor.block||selection.anchor.offset!==expected.anchor.offset||selection.anchor.affinity!==expected.anchor.affinity||selection.focus.block!==expected.focus.block||selection.focus.offset!==expected.focus.offset||selection.focus.affinity!==expected.focus.affinity)throw Error("Markdown input was cancelled because its source caret or publication changed");
}

/** One exclusive native call returns before rendering or application callbacks. */
export function publishMarkdownInput(core:MarkdownInputCore,intent:MarkdownInputIntent,revision:string):RichInputRuleOutcome {
 requireMarkdownInputRules("markdown-v1",core);
 return intent.clockMs===undefined?core.insertPlainTextWithMarkdownRules!(intent.text,intent.namespace,revision):core.insertTypingTextWithMarkdownRules!(intent.text,intent.clockMs,intent.namespace,revision);
}
