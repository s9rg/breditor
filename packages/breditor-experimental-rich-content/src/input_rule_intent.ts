// Browser routing metadata only. Rust recognizes every shortcut and owns every edit.
import type {RichCoreEditor,RichDocumentSelection,RichInputRuleId,RichInputRuleOutcome,RichSelection} from "./core.js";

export type MarkdownInputCore=Pick<RichCoreEditor,"supportsMarkdownInputRules"|"supportsMarkdownInputRouting"|"insertPlainTextWithMarkdownRules"|"insertTypingTextWithMarkdownRules"|"supportsInputRuleSets"|"insertPlainTextWithInputRules"|"insertTypingTextWithInputRules">;
export interface MarkdownInputIntent {readonly text:string;readonly namespace:string;readonly clockMs?:string;readonly rules?:readonly RichInputRuleId[]}
export interface MarkdownInputSource {readonly revision:string;readonly selection:Extract<RichSelection,{kind:"text"}>}
/** One policy id, or a nonempty duplicate-free list of them. */
export type RichInputRulesOption=RichInputRuleId|readonly RichInputRuleId[];

/**
 * Canonical selected rule ids in a fixed order, or null on omission.
 * Unknown, empty or duplicate selections throw before any host state changes.
 */
export function inputRuleSelection(pack:unknown):readonly RichInputRuleId[]|null {
 if(pack===undefined)return null;
 const ids:readonly unknown[]=Array.isArray(pack)?pack:[pack];
 const known=(id:unknown):id is RichInputRuleId=>id==="markdown-v1"||id==="autolink-v1";
 if(!ids.length||ids.length>2||!ids.every(known)||new Set(ids).size!==ids.length)throw new TypeError("Expected inputRules markdown-v1, autolink-v1, a list of them, or omission");
 return Object.freeze((["markdown-v1","autolink-v1"] as const).filter(id=>ids.includes(id)));
}
/** Whether a selection needs the version1 rule-set calls rather than the original Markdown pair. */
export function needsInputRuleSets(rules:readonly RichInputRuleId[]|null|undefined):boolean{return !!rules&&rules.includes("autolink-v1");}

/** Validate the complete pack before mounting or mutating the host. */
export function requireMarkdownInputRules(pack:unknown,core:MarkdownInputCore):boolean {
 return requireInputRules(pack,core)!==null;
}
/** Validate the selection and its complete native capability; returns the canonical ids. */
export function requireInputRules(pack:unknown,core:MarkdownInputCore):readonly RichInputRuleId[]|null {
 const rules=inputRuleSelection(pack);if(!rules)return null;
 if(core.supportsMarkdownInputRules?.()!==true||core.supportsMarkdownInputRouting?.()!==true||typeof core.insertPlainTextWithMarkdownRules!=="function"||typeof core.insertTypingTextWithMarkdownRules!=="function")throw Error("Use complete matching native Markdown input rules and browser routing");
 if(needsInputRuleSets(rules)&&(core.supportsInputRuleSets?.()!==true||typeof core.insertPlainTextWithInputRules!=="function"||typeof core.insertTypingTextWithInputRules!=="function"))throw Error("Use complete matching native input rule sets for autolink-v1");
 return rules;
}

/** Startup rejects unknown policies before acquiring durable storage or native ownership. */
export function validateMarkdownInputPolicy(pack:unknown):boolean {
 return inputRuleSelection(pack)!==null;
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

/**
 * One exclusive native call returns before rendering or application callbacks.
 * A Markdown-only intent keeps the original pair, so older routing runtimes are unchanged.
 */
export function publishMarkdownInput(core:MarkdownInputCore,intent:MarkdownInputIntent,revision:string):RichInputRuleOutcome {
 const rules=intent.rules??["markdown-v1"];requireInputRules(rules,core);
 if(needsInputRuleSets(rules))return intent.clockMs===undefined?core.insertPlainTextWithInputRules!(intent.text,rules,intent.namespace,revision):core.insertTypingTextWithInputRules!(intent.text,intent.clockMs,rules,intent.namespace,revision);
 return intent.clockMs===undefined?core.insertPlainTextWithMarkdownRules!(intent.text,intent.namespace,revision):core.insertTypingTextWithMarkdownRules!(intent.text,intent.clockMs,intent.namespace,revision);
}
