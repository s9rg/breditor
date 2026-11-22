/**
 * Opt-in editor chrome localization. A catalog only changes presentation strings and the `dir`/`lang` of
 * chrome elements (toolbars, status lines, menus, popups and announcements). It never touches the editing
 * surface or document content: content direction stays with each block's own layout direction (or the
 * host page), and nothing here is serialized, published or sent to the Rust owner.
 */
import {richUiPanelStringsEn,richUiPanelParameters,richUiNoticeCodes,type RichUiPanelStrings,type RichUiNoticeCode} from "./ui_locale_panels.js";
export {richUiPanelStringsEn,richUiNoticeCodes,type RichUiPanelStrings,type RichUiNoticeCode} from "./ui_locale_panels.js";
// AI and language-tool chrome strings live in a separate block (ui_locale_ai.ts) merged below.
import {richAiUiStringsEn,richAiUiParameters,type RichAiUiStrings} from "./ui_locale_ai.js";
export type {RichAiUiStrings} from "./ui_locale_ai.js";
// Editing-aid chrome strings (show blocks, invisible characters) live in ui_locale_editing_aids.ts.
import {richEditingAidsUiStringsEn,richEditingAidsUiParameters,type RichEditingAidsUiStrings} from "./ui_locale_editing_aids.js";
export type {RichEditingAidsUiStrings} from "./ui_locale_editing_aids.js";
// Editor shell chrome (menu bar, shortcut help, empty-line block menu) lives in ui_locale_shell.ts.
import {richShellUiStringsEn,richShellUiParameters,type RichShellUiStrings} from "./ui_locale_shell.js";
export type {RichShellUiStrings} from "./ui_locale_shell.js";
// Formatting-productivity chrome (special characters, format painter) lives in ui_locale_productivity.ts.
import {richProductivityUiStringsEn,richProductivityUiParameters,type RichProductivityUiStrings} from "./ui_locale_productivity.js";
export type {RichProductivityUiStrings} from "./ui_locale_productivity.js";
/** Every built-in chrome string. Templates use `{name}` placeholders only; there are no plural or select forms. */
export interface RichUiStrings extends RichUiPanelStrings, RichAiUiStrings, RichEditingAidsUiStrings, RichShellUiStrings, RichProductivityUiStrings {
 readonly richEditorLabel:string;readonly richToolbarLabel:string;
 readonly richStatusReadOnly:string;readonly richStatusEditable:string;readonly richStatusOutcome:string;readonly richStatusReadOnlyOutcome:string;
 readonly richOperationFailed:string;
 readonly sharedEditorLabel:string;readonly sharedToolbarLabel:string;
 readonly sharedStatusReadOnly:string;readonly sharedStatus:string;readonly sharedStatusReadOnlyLive:string;
 readonly inputRuleRefused:string;readonly pasteLoss:string;
 readonly controlApply:string;readonly controlPanel:string;readonly controlMixedHint:string;
 readonly fieldChoose:string;readonly fieldMixed:string;readonly fieldMixedChoose:string;
 readonly selectionToolbarLabel:string;readonly contextMenuLabel:string;
 readonly slashLabel:string;readonly slashLoading:string;readonly slashCountOne:string;readonly slashCount:string;readonly slashEmpty:string;
 readonly slashUnavailable:string;readonly slashInapplicable:string;
 readonly mentionLabel:string;readonly mentionLoading:string;readonly mentionCountOne:string;readonly mentionCount:string;readonly mentionEmpty:string;
 readonly columnResizeLabel:string;readonly columnResizeValue:string;readonly columnResizePreview:string;readonly columnResizeBadge:string;
 readonly blockDragLabel:string;readonly blockDragHelp:string;readonly blockDragDragging:string;readonly blockDragMoved:string;
 readonly blockDragUnchanged:string;readonly blockDragCancelled:string;readonly blockDragNoTargets:string;
 readonly blockDragPickedUp:string;readonly blockDragPosition:string;
 readonly blockDragReadOnly:string;readonly blockDragUnknownBlock:string;readonly blockDragNotMovable:string;readonly blockDragInvalidTarget:string;
 readonly blockDragCyclic:string;readonly blockDragCrossContainer:string;readonly blockDragGrammar:string;readonly blockDragEmptiesSource:string;
 readonly blockDragItemLead:string;readonly blockDragBoundary:string;readonly blockDragNative:string;
 // Image resize handles (image_resize.ts).
 readonly imageResizeLabel:string;readonly imageResizeValue:string;readonly imageResizeOriginal:string;readonly imageResizePreview:string;readonly imageResizeBadge:string;
 // Rich V4 page breaks and the opt-in print preview (page_break.ts, print.ts).
 readonly pageBreakLabel:string;readonly printPreviewLabel:string;
 // Opt-in scrollable table viewports (render.ts `scrollableTables`).
 readonly tableScrollRegion:string;readonly tableScrollLeft:string;readonly tableScrollRight:string;
}
export type RichUiStringKey=keyof RichUiStrings;
/** English defaults. Formatting these with no catalog reproduces the original output byte for byte. */
export const richUiStringsEn:Readonly<RichUiStrings>=Object.freeze({
 richEditorLabel:"Rich text editor",richToolbarLabel:"Rich text formatting",
 richStatusReadOnly:"Read-only · revision {revision}",richStatusEditable:"Editable · revision {revision}",
 richStatusOutcome:"{outcome} · revision {revision}",richStatusReadOnlyOutcome:"Read-only · {outcome} · revision {revision}",
 richOperationFailed:"Rich editor operation failed",
 sharedEditorLabel:"Shared rich text editor",sharedToolbarLabel:"Shared rich text controls",
 sharedStatusReadOnly:"Read-only · shared revision {revision}",
 sharedStatus:"Shared revision {revision} · {undo} undo · {pending} pending remote",
 sharedStatusReadOnlyLive:"Read-only · Shared revision {revision} · {undo} undo · {pending} pending remote",
 inputRuleRefused:"Typed text was kept; the Markdown shortcut was refused.",
 pasteLoss:"Pasted text into {target}; formatting loss: {losses}.",
 controlApply:"Apply {label}",controlPanel:"{label} formatting",controlMixedHint:"Mixed values: applying replaces this complete format.",
 fieldChoose:"Choose…",fieldMixed:"Mixed",fieldMixedChoose:"Mixed — choose…",
 selectionToolbarLabel:"Selection formatting",contextMenuLabel:"Editor actions",
 slashLabel:"Commands",slashLoading:"Loading commands…",slashCountOne:"1 command available",slashCount:"{count} commands available",slashEmpty:"No matching commands",
 slashUnavailable:"{label} is not available here",slashInapplicable:"{label} is no longer applicable; only the typed trigger was removed",
 mentionLabel:"Mentions",mentionLoading:"Loading suggestions…",mentionCountOne:"1 suggestion available",mentionCount:"{count} suggestions available",mentionEmpty:"No matching suggestions",
 columnResizeLabel:"Resize column {index} of {count}",columnResizeValue:"{width} pixels",columnResizePreview:"{width} pixels (preview)",columnResizeBadge:"{width}px",
 blockDragLabel:"Move block",
 blockDragHelp:"Drag to move. Or press Enter to pick up, arrow keys to choose a position, Enter to drop, Escape to cancel. Alt+Shift+Up or Down moves one step.",
 blockDragDragging:"Dragging block.",blockDragMoved:"Block moved.",blockDragUnchanged:"Block left in place.",blockDragCancelled:"Move cancelled.",
 blockDragNoTargets:"No other position accepts this block.",blockDragPickedUp:"Picked up block. {count} positions available.",blockDragPosition:"Position {index} of {count}.",
 blockDragReadOnly:"The document is read-only.",blockDragUnknownBlock:"That block no longer exists.",blockDragNotMovable:"This block cannot be moved.",
 blockDragInvalidTarget:"Blocks cannot be dropped there.",blockDragCyclic:"A block cannot be moved inside itself.",
 blockDragCrossContainer:"Blocks can only be reordered within their container.",blockDragGrammar:"That container does not accept this block.",
 blockDragEmptiesSource:"Moving the last block would leave its container empty.",blockDragItemLead:"A list or task item must start with a text line.",
 blockDragBoundary:"The block is already at the edge of its container.",blockDragNative:"The editor refused the move.",
 // Panels, notices and interchange status lines: see ui_locale_panels.ts.
 ...richUiPanelStringsEn,
 // Image resize handles (image_resize.ts).
 imageResizeLabel:"Resize image {index} of {count}",imageResizeValue:"{width} by {height} pixels",imageResizeOriginal:"{width} by {height} pixels (original size)",
 imageResizePreview:"{width} by {height} pixels (preview)",imageResizeBadge:"{width} × {height}",
 // Rich V4 page breaks and the opt-in print preview (page_break.ts, print.ts).
 pageBreakLabel:"Page break",printPreviewLabel:"Print preview: page boundaries are approximate",
 // Opt-in scrollable table viewports (render.ts `scrollableTables`).
 tableScrollRegion:"Table {number}",tableScrollLeft:"Scroll table {number} left",tableScrollRight:"Scroll table {number} right",
 // AI and language tools (separate block).
 ...richAiUiStringsEn,
 // Editing aids (separate block).
 ...richEditingAidsUiStringsEn,
 ...richShellUiStringsEn,
 // Formatting-productivity tools (separate block).
 ...richProductivityUiStringsEn,
});
/** Placeholders each template may use. Anything else in braces is rejected. */
const parameters:Readonly<Partial<Record<RichUiStringKey,readonly string[]>>>={
 richStatusReadOnly:["revision"],richStatusEditable:["revision"],richStatusOutcome:["outcome","revision"],richStatusReadOnlyOutcome:["outcome","revision"],
 sharedStatusReadOnly:["revision"],sharedStatus:["revision","undo","pending"],sharedStatusReadOnlyLive:["revision","undo","pending"],
 pasteLoss:["target","losses"],controlApply:["label"],controlPanel:["label"],slashCount:["count"],mentionCount:["count"],slashUnavailable:["label"],slashInapplicable:["label"],
 columnResizeLabel:["index","count"],columnResizeValue:["width"],columnResizePreview:["width"],columnResizeBadge:["width"],
 blockDragPickedUp:["count"],blockDragPosition:["index","count"],
 tableScrollRegion:["number"],tableScrollLeft:["number"],tableScrollRight:["number"],
 ...richUiPanelParameters,
 // Image resize handles (image_resize.ts).
 imageResizeLabel:["index","count"],imageResizeValue:["width","height"],imageResizeOriginal:["width","height"],imageResizePreview:["width","height"],imageResizeBadge:["width","height"],
 // AI and language tools (separate block).
 ...richAiUiParameters,
 // Editing aids (separate block).
 ...richEditingAidsUiParameters,
 ...richShellUiParameters,
 // Formatting-productivity tools (separate block).
 ...richProductivityUiParameters,
};
/** Ids of `standardRichSlashPicks`; other provider items carry their own labels. */
export type RichStandardSlashItemId="paragraph"|"heading-1"|"heading-2"|"heading-3"|"bullet-list"|"numbered-list"|"task-list"|"blockquote"|"code-block"|"horizontal-rule"|"table"|"details"|"page-break";
const slashIds:ReadonlySet<string>=new Set(["paragraph","heading-1","heading-2","heading-3","bullet-list","numbered-list","task-list","blockquote","code-block","horizontal-rule","table","details","page-break"]);
export interface RichUiFieldStrings {
 readonly label?:string;readonly placeholder?:string;
 /** Select option labels keyed by the option's existing value. */
 readonly options?:Readonly<Record<string,string>>;
}
/** Presentation for one admitted toolbar control, keyed by its stable control id. */
export interface RichUiControlStrings {
 readonly label?:string;readonly mixedHint?:string;
 /** Only for controls with `fields`; keyed by field id. */
 readonly fields?:Readonly<Record<string,RichUiFieldStrings>>;
}
export interface RichUiSlashItemStrings {readonly label?:string;readonly description?:string;readonly keywords?:readonly string[]}
export type RichUiDirection="ltr"|"rtl";
export interface RichUiOptions {
 /** BCP 47 language of the chrome (for example "ar"). Set as `lang` on chrome elements only. */
 readonly lang?:string;
 /** Chrome direction. Mirrors toolbars, menus and popups; never the editing surface or blocks. */
 readonly direction?:RichUiDirection;
 /** Partial override of `richUiStringsEn`. Unknown keys are rejected. */
 readonly strings?:Partial<RichUiStrings>;
 /**
  * Toolbar control presentation by stable control id. Ids the mounted toolbar does not admit are inert, so one
  * catalog can serve several toolbar profiles; fields and options of an admitted control are checked exactly.
  */
 readonly controls?:Readonly<Record<string,RichUiControlStrings>>;
 /** Standard slash-command item presentation by item id. */
 readonly slashItems?:Readonly<Partial<Record<RichStandardSlashItemId,RichUiSlashItemStrings>>>;
 /** End-user labels for interchange notice codes shown in status lines. Unlabelled codes display as the code. */
 readonly notices?:Readonly<Partial<Record<RichUiNoticeCode,string>>>;
 /**
  * End-user messages for stable refusal codes (`breditor_rich.read_only`, relay codes such as `permission_denied`)
  * when a status line would otherwise show the developer `Error.message`. Keys are lowercase dotted codes.
  */
 readonly refusals?:Readonly<Record<string,string>>;
 /**
  * Special-character picker names: `categories` by category id and `characters` by the character itself
  * (for example `{"€":"Euro"}`). Entries for characters or categories a picker does not show are inert.
  */
 readonly specialCharacters?:Readonly<{categories?:Readonly<Record<string,string>>;characters?:Readonly<Record<string,string>>}>;
}
type Values=Readonly<Record<string,string|number>>;
interface Presentation {readonly id:string;readonly label:string;readonly type?:"text"|"number";readonly mixedHint?:string;readonly fields?:readonly {readonly id:string;readonly label:string;readonly placeholder?:string;readonly options?:readonly {readonly value:string;readonly label:string}[]}[]}
/** A validated, frozen catalog. Obtain one with `resolveRichUi`; editors expose theirs through `uiLocale()`. */
export interface RichUiLocale {
 readonly lang:string|null;readonly direction:RichUiDirection|null;readonly strings:Readonly<RichUiStrings>;
 /** Format one template. Values are inserted verbatim in a single pass. */
 text(key:RichUiStringKey,values?:Values):string;
 /** Copy a toolbar control presentation with catalog labels applied; unchanged when the catalog has no entry. */
 control<T extends Presentation>(control:T):T;
 slashItem<T extends {readonly id:string;readonly label:string;readonly description?:string;readonly keywords?:readonly string[]}>(item:T):T;
 /** Set `dir`/`lang` on one chrome element when the catalog names them. Never call this on editable content. */
 applyChrome(element:HTMLElement):void;
 /** Reject entries for an admitted control whose field or option it does not have. Entries for absent controls are inert. */
 checkControls(controls:readonly Presentation[]):void;
 /**
  * End-user text for a failure shown in a status line: a catalog-keyed panel refusal, else a `refusals` entry for
  * the error's stable `code` (or a message that is itself a code), else the error's English developer message,
  * else `otherwise` for non-Error values. Never changes the thrown error.
  */
 describe(error:unknown,otherwise:string):string;
 /** End-user label for an interchange notice code; the code itself when the catalog has none. */
 notice(code:string):string;
 /** Catalog name of a special-character category (by id) or character (by the character), else `fallback`. */
 specialCharacterLabel?(kind:"category"|"character",key:string,fallback:string):string;
}
const MAX_TEXT=512,MAX_ENTRIES=256;
const lang=/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,7}$/;
const record=(value:unknown,what:string,limit=MAX_ENTRIES):Readonly<Record<string,unknown>>=>{
 if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new TypeError(`Expected ${what} to be a plain object`);
 const keys=Object.keys(value);if(keys.length>limit)throw new RangeError(`Too many ${what} entries`);return value as Record<string,unknown>;
};
const only=(value:Readonly<Record<string,unknown>>,allowed:readonly string[],what:string):void=>{for(const key of Object.keys(value))if(!allowed.includes(key))throw new TypeError(`Unknown ${what} key ${JSON.stringify(key)}`);};
const plain=(value:unknown,what:string):string=>{
 if(typeof value!=="string"||!value.trim()||value.length>MAX_TEXT)throw new TypeError(`Expected ${what} to be a nonempty string of at most ${MAX_TEXT} characters`);
 if(/[\u0000-\u0008\u000B-\u001F\u007F]/.test(value))throw new TypeError(`Expected ${what} without control characters`);
 return value;
};
const template=(key:RichUiStringKey,value:unknown):string=>{
 const text=plain(value,`UI string ${key}`),allowed=parameters[key]??[];
 const stripped=text.replace(/\{([A-Za-z]+)\}/g,(_match,name:string)=>{if(!allowed.includes(name))throw new TypeError(`UI string ${key} uses unknown placeholder {${name}}`);return "";});
 if(/[{}]/.test(stripped))throw new TypeError(`UI string ${key} has an unmatched brace; only {name} placeholders are supported`);
 return text;
};
const format=(text:string,values:Values|undefined):string=>values?text.replace(/\{([A-Za-z]+)\}/g,(match,name:string)=>Object.prototype.hasOwnProperty.call(values,name)?String(values[name]):match):text;
const freezeField=(value:unknown,where:string):RichUiFieldStrings=>{
 const field=record(value,where);only(field,["label","placeholder","options"],where);
 const options=field["options"]===undefined?undefined:record(field["options"],`${where}.options`);
 return Object.freeze({...(field["label"]!==undefined?{label:plain(field["label"],`${where}.label`)}:{}),...(field["placeholder"]!==undefined?{placeholder:plain(field["placeholder"],`${where}.placeholder`)}:{}),
  ...(options?{options:Object.freeze(Object.fromEntries(Object.entries(options).map(([option,label])=>[option,plain(label,`${where}.options.${option}`)])))}:{})});
};
const freezeControl=(id:string,value:unknown):RichUiControlStrings=>{
 if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id))throw new TypeError(`Expected a toolbar control id, not ${JSON.stringify(id)}`);
 const where=`UI control ${JSON.stringify(id)}`,control=record(value,where);only(control,["label","mixedHint","fields"],where);
 const fields=control["fields"]===undefined?undefined:record(control["fields"],`${where}.fields`);
 return Object.freeze({...(control["label"]!==undefined?{label:plain(control["label"],`${where}.label`)}:{}),...(control["mixedHint"]!==undefined?{mixedHint:plain(control["mixedHint"],`${where}.mixedHint`)}:{}),
  ...(fields?{fields:Object.freeze(Object.fromEntries(Object.entries(fields).map(([field,entry])=>[field,freezeField(entry,`${where}.fields.${field}`)])))}:{})});
};
const freezeSlash=(id:string,value:unknown):RichUiSlashItemStrings=>{
 if(!slashIds.has(id))throw new TypeError(`Unknown standard slash-command item ${JSON.stringify(id)}`);
 const where=`UI slash item ${id}`,item=record(value,where);only(item,["label","description","keywords"],where);
 const keywords=item["keywords"];
 if(keywords!==undefined&&(!Array.isArray(keywords)||keywords.length>32))throw new TypeError(`Expected ${where}.keywords to be an array of at most 32 strings`);
 return Object.freeze({...(item["label"]!==undefined?{label:plain(item["label"],`${where}.label`)}:{}),...(item["description"]!==undefined?{description:plain(item["description"],`${where}.description`)}:{}),
  ...(keywords!==undefined?{keywords:Object.freeze((keywords as unknown[]).map((word,index)=>plain(word,`${where}.keywords[${index}]`)))}:{})});
};
/** Registered brands, so a locale or panel refusal from another copy of this module is still recognized. */
const localeBrand=Symbol.for("breditor.richUiLocale"),errorBrand=Symbol.for("breditor.richUiError");
class Locale implements RichUiLocale {
 readonly [localeBrand]=true;
 readonly lang:string|null;readonly direction:RichUiDirection|null;readonly strings:Readonly<RichUiStrings>;
 readonly #controls:Readonly<Record<string,RichUiControlStrings>>;readonly #slash:Readonly<Record<string,RichUiSlashItemStrings>>;
 readonly #notices:Readonly<Record<string,string>>;readonly #refusals:Readonly<Record<string,string>>;
 readonly #specialCategories:Readonly<Record<string,string>>;readonly #specialCharacters:Readonly<Record<string,string>>;
 constructor(options:RichUiOptions|undefined){
  const value=options===undefined?{}:record(options,"UI options");only(value,["lang","direction","strings","controls","slashItems","notices","refusals","specialCharacters"],"UI option");
  if(value["lang"]!==undefined&&(typeof value["lang"]!=="string"||!lang.test(value["lang"])))throw new TypeError("Expected a BCP 47 UI language tag");
  if(value["direction"]!==undefined&&value["direction"]!=="ltr"&&value["direction"]!=="rtl")throw new TypeError("Expected UI direction ltr or rtl");
  const known=Object.keys(richUiStringsEn),strings=value["strings"]===undefined?{}:record(value["strings"],"UI strings",Math.max(MAX_ENTRIES,known.length));
  only(strings,known,"UI string");
  const resolved={...richUiStringsEn} as Record<RichUiStringKey,string>;
  for(const [key,text] of Object.entries(strings))resolved[key as RichUiStringKey]=template(key as RichUiStringKey,text);
  const controls=value["controls"]===undefined?{}:record(value["controls"],"UI controls"),slash=value["slashItems"]===undefined?{}:record(value["slashItems"],"UI slash items");
  this.lang=(value["lang"] as string|undefined)??null;this.direction=(value["direction"] as RichUiDirection|undefined)??null;this.strings=Object.freeze(resolved);
  this.#controls=Object.freeze(Object.fromEntries(Object.entries(controls).map(([id,entry])=>[id,freezeControl(id,entry)])));
  this.#slash=Object.freeze(Object.fromEntries(Object.entries(slash).map(([id,entry])=>[id,freezeSlash(id,entry)])));
  [this.#notices,this.#refusals]=codeMaps(value);
  [this.#specialCategories,this.#specialCharacters]=specialCharacterMaps(value["specialCharacters"]);
  Object.freeze(this);
 }
 text(key:RichUiStringKey,values?:Values):string{const text=this.strings[key];if(typeof text!=="string")throw new TypeError(`Unknown UI string ${String(key)}`);return format(text,values);}
 control<T extends Presentation>(control:T):T{
  const entry=Object.prototype.hasOwnProperty.call(this.#controls,control.id)?this.#controls[control.id]:undefined;if(!entry)return control;
  const fields=control.fields?.map(field=>{const local=entry.fields?.[field.id];if(!local)return field;
   return Object.freeze({...field,...(local.label?{label:local.label}:{}),...(local.placeholder?{placeholder:local.placeholder}:{}),...(field.options&&local.options?{options:Object.freeze(field.options.map(option=>local.options![option.value]?Object.freeze({...option,label:local.options![option.value]!}):option))}:{})});});
  return Object.freeze({...control,...(entry.label?{label:entry.label}:{}),...(entry.mixedHint?{mixedHint:entry.mixedHint}:{}),...(fields?{fields:Object.freeze(fields)}:{})}) as T;
 }
 slashItem<T extends {readonly id:string;readonly label:string;readonly description?:string;readonly keywords?:readonly string[]}>(item:T):T{
  const entry=Object.prototype.hasOwnProperty.call(this.#slash,item.id)?this.#slash[item.id]:undefined;if(!entry)return item;
  return Object.freeze({...item,...(entry.label?{label:entry.label}:{}),...(entry.description?{description:entry.description}:{}),...(entry.keywords?{keywords:entry.keywords}:{})}) as T;
 }
 describe(error:unknown,otherwise:string):string{
  const tag=error!==null&&typeof error==="object"?panelTag(error):undefined;if(tag&&Object.prototype.hasOwnProperty.call(this.strings,tag.key))return this.text(tag.key,tag.values);
  if(error!==null&&typeof error==="object"){
   let code:unknown;try{code=(error as {code?:unknown}).code;}catch{/* A released native error has no readable code. */}
   if(typeof code==="string"&&Object.prototype.hasOwnProperty.call(this.#refusals,code))return this.#refusals[code]!;
   if(error instanceof Error&&Object.prototype.hasOwnProperty.call(this.#refusals,error.message))return this.#refusals[error.message]!;
  }
  return error instanceof Error?error.message:otherwise;
 }
 specialCharacterLabel(kind:"category"|"character",key:string,fallback:string):string{const map=kind==="category"?this.#specialCategories:this.#specialCharacters;return Object.prototype.hasOwnProperty.call(map,key)?map[key]!:fallback;}
 notice(code:string):string{return Object.prototype.hasOwnProperty.call(this.#notices,code)?this.#notices[code]!:code;}
 applyChrome(element:HTMLElement):void{if(this.direction)element.dir=this.direction;if(this.lang)element.lang=this.lang;}
 checkControls(controls:readonly Presentation[]):void{
  const byId=new Map(controls.map(control=>[control.id,control]));
  for(const [id,entry] of Object.entries(this.#controls)){
   // One catalog may serve several toolbar profiles: entries for controls this toolbar omits are inert.
   const control=byId.get(id);if(!control)continue;
   for(const [field,local] of Object.entries(entry.fields??{})){
    const definition=control.fields?.find(candidate=>candidate.id===field);
    if(!definition)throw new TypeError(`UI control ${JSON.stringify(id)} has no field ${JSON.stringify(field)}`);
    for(const option of Object.keys(local.options??{}))if(!definition.options?.some(candidate=>candidate.value===option))throw new TypeError(`UI control ${JSON.stringify(id)} field ${JSON.stringify(field)} has no option ${JSON.stringify(option)}`);
   }
  }
 }
}
// ---- Special-character names (see formatting_productivity.ts) ----
function specialCharacterMaps(value:unknown):[Readonly<Record<string,string>>,Readonly<Record<string,string>>]{
 if(value===undefined)return [Object.freeze({}),Object.freeze({})];
 const entry=record(value,"UI special characters");only(entry,["categories","characters"],"UI special-character");
 const categories=entry["categories"]===undefined?{}:record(entry["categories"],"UI special-character categories",64);
 const characters=entry["characters"]===undefined?{}:record(entry["characters"],"UI special-character names",4096);
 for(const id of Object.keys(categories))if(!/^[a-z][a-z0-9-]{0,31}$/.test(id))throw new TypeError(`Expected a special-character category id, not ${JSON.stringify(id)}`);
 for(const key of Object.keys(characters))if(!key||key.length>16||/[\u0000-\u001F\u007F-\u009F]/.test(key))throw new TypeError(`Expected a special character key, not ${JSON.stringify(key)}`);
 const freeze=(map:Readonly<Record<string,unknown>>,what:string)=>Object.freeze(Object.fromEntries(Object.entries(map).map(([key,text])=>[key,plain(text,`${what} ${key}`)])));
 return [freeze(categories,"UI special-character category"),freeze(characters,"UI special-character name")];
}
// ---- Panel refusals and notice/refusal code maps (see ui_locale_panels.ts) ----
const codePattern=/^[a-z][a-z0-9_-]{0,63}(?:\.[a-z0-9_-]{1,63}){0,3}$/;
function codeMaps(value:Readonly<Record<string,unknown>>):[Readonly<Record<string,string>>,Readonly<Record<string,string>>]{
 const notices=value["notices"]===undefined?{}:record(value["notices"],"UI notices"),refusals=value["refusals"]===undefined?{}:record(value["refusals"],"UI refusals");
 only(notices,richUiNoticeCodes,"UI notice");
 for(const code of Object.keys(refusals))if(!codePattern.test(code))throw new TypeError(`Expected a stable refusal code, not ${JSON.stringify(code)}`);
 const freeze=(map:Readonly<Record<string,unknown>>,what:string)=>Object.freeze(Object.fromEntries(Object.entries(map).map(([code,text])=>[code,plain(text,`${what} ${code}`)])));
 return [freeze(notices,"UI notice"),freeze(refusals,"UI refusal")];
}
interface PanelTag {readonly key:RichUiStringKey;readonly values:Values|undefined}
function panelTag(error:object):PanelTag|undefined{
 let tag:unknown;try{tag=(error as Record<symbol,unknown>)[errorBrand];}catch{return undefined;}
 return tag!==null&&typeof tag==="object"&&typeof (tag as PanelTag).key==="string"?tag as PanelTag:undefined;
}
/**
 * A panel refusal the end user sees in a status line. The thrown `Error.message` stays the English developer text
 * (the default template); `RichUiLocale.describe` shows the catalog's text for the same key.
 */
export function richUiError(key:RichUiStringKey,values?:Values,Kind:ErrorConstructor=Error):Error{
 const error=new Kind(format(richUiStringsEn[key],values));
 Object.defineProperty(error,errorBrand,{value:Object.freeze({key,values:values?Object.freeze({...values}):undefined})});return error;
}
/** The English, direction-neutral locale used when no catalog is supplied. */
export const defaultRichUi:RichUiLocale=new Locale(undefined);
/** Validate a catalog once. Throws TypeError/RangeError before any DOM is created. */
export function resolveRichUi(options?:RichUiOptions|RichUiLocale):RichUiLocale{
 if(options===undefined)return defaultRichUi;
 if(options instanceof Locale)return options;
 // A locale validated by another copy of this module (a second bundle, or source next to built output).
 if(options!==null&&typeof options==="object"&&(options as unknown as Record<symbol,unknown>)[localeBrand]===true&&Object.isFrozen(options))return options as RichUiLocale;
 return new Locale(options as RichUiOptions);
}
/** Nearest explicit chrome direction: an element's own `dir`, else the closest ancestor's. `auto` reads as ltr. */
export function richChromeIsRtl(element:Element):boolean{return element.closest("[dir]")?.getAttribute("dir")?.toLowerCase()==="rtl";}
