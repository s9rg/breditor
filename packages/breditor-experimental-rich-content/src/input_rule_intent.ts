// Browser routing metadata only. Rust recognizes every shortcut and owns every edit.
import type {RichCoreEditor,RichDocumentSelection,RichInputRuleId,RichInputRuleOutcome,RichSelection,RichTypographyOptions} from "./core.js";

export type MarkdownInputCore=Pick<RichCoreEditor,"supportsMarkdownInputRules"|"supportsMarkdownInputRouting"|"insertPlainTextWithMarkdownRules"|"insertTypingTextWithMarkdownRules"|"supportsInputRuleSets"|"insertPlainTextWithInputRules"|"insertTypingTextWithInputRules"|"supportsTypographyInputRules">;
export interface MarkdownInputIntent {readonly text:string;readonly namespace:string;readonly clockMs?:string;readonly rules?:readonly RichInputRuleId[];readonly typography?:RichTypographyOptions}
export interface MarkdownInputSource {readonly revision:string;readonly selection:Extract<RichSelection,{kind:"text"}>}
/** `typography-v1` with an explicit rule selection and/or quote style. */
export type RichTypographyRuleOption={readonly rule:"typography-v1"}&RichTypographyOptions;
/** One policy id (or configured typography entry), or a nonempty duplicate-free list of them. */
export type RichInputRulesOption=RichInputRuleId|RichTypographyRuleOption|readonly (RichInputRuleId|RichTypographyRuleOption)[];

const RULE_IDS=["markdown-v1","autolink-v1","typography-v1"] as const;
/** Native `typography-v1` rules by group, mirrored for startup validation; Rust validates again. */
export const TYPOGRAPHY_RULE_GROUPS:Readonly<Record<string,readonly string[]>>=Object.freeze({
 typography:Object.freeze(["ellipsis","enDash","emDash"]),
 quotes:Object.freeze(["quotesPrimary","quotesSecondary"]),
 symbols:Object.freeze(["copyright","registeredTrademark","trademark"]),
 mathematical:Object.freeze(["oneHalf","oneThird","twoThirds","oneQuarter","threeQuarters","lessThanOrEqual","greaterThanOrEqual","notEqual","arrowLeft","arrowRight"]),
 misc:Object.freeze(["servicemark","plusMinus","laquo","raquo","superscriptTwo","superscriptThree"]),
});
/** Groups selected when `include` is omitted (every group except `misc`). */
export const TYPOGRAPHY_DEFAULT_GROUPS:readonly string[]=Object.freeze(["typography","quotes","symbols","mathematical"]);
const QUOTE_PRESETS:readonly string[]=["english","german","french","swiss","polish"];
const ruleId=(entry:unknown):unknown=>typeof entry==="object"&&entry!==null&&!Array.isArray(entry)?(entry as {rule?:unknown}).rule:entry;
const fail=():never=>{throw new TypeError("Expected inputRules markdown-v1, autolink-v1, typography-v1 (optionally {rule:\"typography-v1\",include,exclude,quotes}), a list of them, or omission");};
const knownName=(name:unknown)=>typeof name==="string"&&(Object.hasOwn(TYPOGRAPHY_RULE_GROUPS,name)||Object.values(TYPOGRAPHY_RULE_GROUPS).some(group=>group.includes(name)));
function typographyNames(value:unknown):readonly string[]|undefined {
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>64||!value.every(knownName)||new Set(value).size!==value.length)fail();
 return Object.freeze([...value as string[]]);
}
const expand=(names:readonly string[])=>new Set(names.flatMap(name=>TYPOGRAPHY_RULE_GROUPS[name]??[name]));
const quoteScalar=(value:unknown)=>typeof value==="string"&&[...value].length===1&&!/[\u0000-\u007f\s\p{Cc}�﻿]/u.test(value);
/** Validate one configured typography entry into a frozen native request. */
function typographyOptions(entry:Record<string,unknown>):RichTypographyOptions {
 if(Object.keys(entry).some(key=>!["rule","include","exclude","quotes"].includes(key)))fail();
 const include=typographyNames(entry["include"]),exclude=typographyNames(entry["exclude"])??[];
 const removed=expand(exclude);if(![...expand(include??TYPOGRAPHY_DEFAULT_GROUPS)].some(rule=>!removed.has(rule)))fail();
 const quotes=entry["quotes"];let frozen:RichTypographyOptions["quotes"];
 if(typeof quotes==="string"){if(!QUOTE_PRESETS.includes(quotes))fail();frozen=quotes as RichTypographyOptions["quotes"];}
 else if(quotes!==undefined){
  const q=quotes as {double?:unknown;single?:unknown;space?:unknown};
  if(typeof q!=="object"||q===null||Array.isArray(q)||Object.keys(q).some(key=>!["double","single","space"].includes(key))||![q.double,q.single].every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(quoteScalar))||q.space!==undefined&&q.space!=="nbsp"&&q.space!=="narrow-nbsp")fail();
  const pair=(value:unknown)=>Object.freeze([...value as string[]]) as unknown as readonly [string,string];
  frozen=Object.freeze({double:pair(q.double),single:pair(q.single),...(q.space!==undefined?{space:q.space as "nbsp"|"narrow-nbsp"}:{})});
 }
 return Object.freeze({...(include?{include}:{}),...(exclude.length?{exclude}:{}),...(frozen!==undefined?{quotes:frozen}:{})});
}

/**
 * Canonical selected rule ids in a fixed order, or null on omission.
 * Unknown, empty or duplicate selections and invalid typography entries throw before any host state changes.
 */
export function inputRuleSelection(pack:unknown):readonly RichInputRuleId[]|null {
 if(pack===undefined)return null;
 const entries:readonly unknown[]=Array.isArray(pack)?pack:[pack];
 const ids=entries.map(ruleId);
 if(!entries.length||entries.length>3||!ids.every(id=>(RULE_IDS as readonly unknown[]).includes(id))||new Set(ids).size!==ids.length)fail();
 for(const entry of entries)if(typeof entry==="object"){if(ruleId(entry)!=="typography-v1")fail();typographyOptions(entry as Record<string,unknown>);}
 return Object.freeze(RULE_IDS.filter(id=>ids.includes(id)));
}
/** The validated `typography-v1` configuration, or null when typography is unconfigured (defaults) or not selected. */
export function inputRuleTypography(pack:unknown):RichTypographyOptions|null {
 if(inputRuleSelection(pack)===null)return null;
 const entry=(Array.isArray(pack)?pack:[pack]).find(e=>typeof e==="object"&&e!==null);
 return entry?typographyOptions(entry as Record<string,unknown>):null;
}
/** Whether a selection needs the version1 rule-set calls rather than the original Markdown pair. */
export function needsInputRuleSets(rules:readonly RichInputRuleId[]|null|undefined):boolean{return !!rules&&(rules.includes("autolink-v1")||rules.includes("typography-v1"));}

/** Validate the complete pack before mounting or mutating the host. */
export function requireMarkdownInputRules(pack:unknown,core:MarkdownInputCore):boolean {
 return requireInputRules(pack,core)!==null;
}
/** Validate the selection and its complete native capability; returns the canonical ids. */
export function requireInputRules(pack:unknown,core:MarkdownInputCore):readonly RichInputRuleId[]|null {
 const rules=inputRuleSelection(pack);if(!rules)return null;
 if(core.supportsMarkdownInputRules?.()!==true||core.supportsMarkdownInputRouting?.()!==true||typeof core.insertPlainTextWithMarkdownRules!=="function"||typeof core.insertTypingTextWithMarkdownRules!=="function")throw Error("Use complete matching native Markdown input rules and browser routing");
 if(needsInputRuleSets(rules)&&(core.supportsInputRuleSets?.()!==true||typeof core.insertPlainTextWithInputRules!=="function"||typeof core.insertTypingTextWithInputRules!=="function"))throw Error("Use complete matching native input rule sets for autolink-v1 and typography-v1");
 if(rules.includes("typography-v1")&&core.supportsTypographyInputRules?.()!==true)throw Error("Use complete matching native typography-v1 input rules");
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
 * A configured typography request is passed only when present, so default calls stay unchanged.
 */
export function publishMarkdownInput(core:MarkdownInputCore,intent:MarkdownInputIntent,revision:string):RichInputRuleOutcome {
 const rules=intent.rules??["markdown-v1"];requireInputRules(rules,core);
 if(needsInputRuleSets(rules)){
  const t=intent.typography,plain=core.insertPlainTextWithInputRules!.bind(core),typing=core.insertTypingTextWithInputRules!.bind(core);
  if(intent.clockMs===undefined)return t?plain(intent.text,rules,intent.namespace,revision,t):plain(intent.text,rules,intent.namespace,revision);
  return t?typing(intent.text,intent.clockMs,rules,intent.namespace,revision,t):typing(intent.text,intent.clockMs,rules,intent.namespace,revision);
 }
 return intent.clockMs===undefined?core.insertPlainTextWithMarkdownRules!(intent.text,intent.namespace,revision):core.insertTypingTextWithMarkdownRules!(intent.text,intent.clockMs,intent.namespace,revision);
}
