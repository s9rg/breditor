/**
 * Ruby (furigana) annotations: an opt-in, first-party **typed inline extension**, not a grammar
 * change (Rust `rich_content/ruby_v1.rs`, docs/RUBY_ANNOTATIONS.md).
 *
 * A host adds the `breditor-ruby/ruby` extension to its profile (bootstrap or shared
 * configuration). The base text is the formatted run; the reading is the required string property
 * `breditor-ruby/annotation`. Rust owns admission (the 1–256 byte bound), the generic set/remove
 * command, exact history and replay; this module holds the authoring policy (no controls or edge
 * whitespace), run grouping shared by the live and static renderers, the live element and the
 * DOM-free toolbar controls.
 *
 * Live output is `<ruby>base<rp>(</rp><rt>reading</rt><rp>)</rp></ruby>` where the `rp`/`rt`
 * text is CSS generated content from a `data-ruby-*` attribute: the annotation is not document text
 * of the editable flow, so selection offsets, typing, IME composition, search and copy only see the
 * base. It is edited through the Ruby field, never inline.
 */
import type {FormatLiteral,RichInlineFormatState,RichInlineFormatStateRead,RichSelectionFormatStateRead,RichSelectionPolicy,RichPoint} from "./core.js";
import type {ActionContext,ToolbarControl} from "./actions.js";
import type {RichToolbarField,RichToolbarReading} from "./toolbar_control_view.js";
import {id,type RichPresentationModel} from "./model.js";
import {richInlinePresentationHasRuby,type RichInlinePresentation} from "./inline_presentation.js";

export const richRubyExtensionName="breditor-ruby/ruby";
export const richRubyFormat="breditor-ruby/ruby";
export const richRubyAnnotationProperty="breditor-ruby/annotation";
export const richRubyAnnotationMaxBytes=256;
/** Class of the `<ruby>` element in live and static output. */
export const richRubyClass="breditor-ruby";

const annotationContract=Object.freeze({name:richRubyAnnotationProperty,presence:"required" as const,valueType:Object.freeze({kind:"string" as const,minimumUtf8Bytes:1,maximumUtf8Bytes:richRubyAnnotationMaxBytes})});
/** The extension entry for a profile bootstrap (formats 6–9, e.g. `profileBootstrapJsonV4`). */
export const richRubyBootstrapExtensionV1=Object.freeze({
 id:Object.freeze({name:richRubyExtensionName,version:1}),dependencies:Object.freeze([]),conflicts:Object.freeze([]),
 inlineFormats:Object.freeze([Object.freeze({kind:richRubyFormat,revision:1})]),
 inlineFormatPropertyContracts:Object.freeze([Object.freeze({formatKind:richRubyFormat,properties:Object.freeze([annotationContract])})]),
 inlineFormatToggles:Object.freeze([]),inlineFormatSets:Object.freeze([]),
});
/** The same extension for a shared configuration (`breditor/shared-rich-profile`, formats 1–4). */
export const richRubySharedExtensionV1=Object.freeze({
 id:Object.freeze({name:richRubyExtensionName,version:1}),dependencies:Object.freeze([]),conflicts:Object.freeze([]),
 formats:Object.freeze([Object.freeze({kind:richRubyFormat,revision:1,properties:Object.freeze([annotationContract])})]),
});
function withExtension<T>(value:T,entry:unknown,what:string):T{
 const record=value as {extensions?:unknown}|null;
 if(!record||typeof record!=="object"||!Array.isArray(record.extensions))throw new TypeError(`Expected a ${what} with an extensions array`);
 if(record.extensions.some(item=>(item as {id?:{name?:unknown}})?.id?.name===richRubyExtensionName))throw new TypeError(`The ${what} already declares the ruby extension`);
 return {...record,extensions:[...record.extensions,entry]} as T;
}
/** Append the ruby extension to a bootstrap JSON string; the result compiles to its own fingerprint. */
export function withRichRubyBootstrapV1(bootstrapJson:string):string{
 if(typeof bootstrapJson!=="string")throw new TypeError("Expected profile bootstrap JSON");
 return JSON.stringify(withExtension(JSON.parse(bootstrapJson) as unknown,richRubyBootstrapExtensionV1,"profile bootstrap"));
}
/** Append the ruby extension to a shared profile configuration object (copied, never mutated). */
export function withRichRubySharedConfigurationV1<T extends {readonly extensions:readonly unknown[]}>(configuration:T):T{
 return withExtension(JSON.parse(JSON.stringify(configuration)) as T,richRubySharedExtensionV1,"shared configuration");
}

// Controls (C0, DEL, C1), line/paragraph separators and bidi embedding/override/isolate controls.
const forbidden=/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;
// Unicode White_Space exactly as Rust `char::is_whitespace`.
const space="[\\t\\n\\v\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]";
const edge=new RegExp(`^${space}|${space}$`,"u");
const encoder=new TextEncoder();
/** Mirrors `RichRubyAnnotation::try_new`: 1–256 UTF-8 bytes, no edge whitespace, no controls. */
export function isRichRubyAnnotation(value:unknown):value is string{
 if(typeof value!=="string"||!value||edge.test(value)||forbidden.test(value))return false;
 for(const scalar of value){const unit=scalar.charCodeAt(0);if(scalar.length===1&&unit>=0xd800&&unit<=0xdfff)return false;}
 return encoder.encode(value).length<=richRubyAnnotationMaxBytes;
}
/** Admitted annotation of one ruby literal, or `undefined` (not ruby, or outside the policy). */
export function rubyAnnotationOf(format:{readonly type:string;readonly properties:Readonly<Record<string,unknown>>}):string|undefined{
 if(format.type!==richRubyFormat)return undefined;
 const keys=Object.keys(format.properties),value=format.properties[richRubyAnnotationProperty];
 return keys.length===1&&isRichRubyAnnotation(value)?value:undefined;
}
/** The format literal of one annotation; throws for text outside the policy. */
export function rubyFormat(annotation:string):FormatLiteral{
 if(!isRichRubyAnnotation(annotation))throw new TypeError("A ruby annotation is 1-256 UTF-8 bytes without controls or edge whitespace");
 return {type:richRubyFormat,properties:{[richRubyAnnotationProperty]:annotation}};
}
/** Whether a Rust catalog entry is exactly the ruby V1 declaration. */
export function isRichRubyDeclaration(format:{readonly kind:string;readonly revision:number;readonly properties:readonly {readonly name:string;readonly presence:string;readonly valueType:{readonly kind:string;readonly minimumUtf8Bytes?:number;readonly maximumUtf8Bytes?:number}}[]}):boolean{
 const p=format.properties[0];
 return format.kind===richRubyFormat&&format.revision===1&&format.properties.length===1&&p?.name===richRubyAnnotationProperty&&p.presence==="required"&&p.valueType.kind==="string"&&p.valueType.minimumUtf8Bytes===1&&p.valueType.maximumUtf8Bytes===richRubyAnnotationMaxBytes;
}

/** One text run as both renderers see it. */
export interface RubyRun {readonly text:string;readonly formats:readonly FormatLiteral[]}
/** Plain stretches and ruby groups. A group's runs have the ruby literal removed. */
export type RubySegment<R extends RubyRun>={readonly kind:"plain";readonly runs:readonly R[]}|{readonly kind:"ruby";readonly annotation:string;readonly runs:readonly R[]};
/**
 * Group consecutive runs carrying one equal admitted annotation into one ruby group (its base).
 * A literal outside the authoring policy renders as plain text (its other formats kept).
 */
export function groupRubyRuns<R extends RubyRun>(runs:readonly R[],rebuild:(run:R,formats:readonly FormatLiteral[])=>R):RubySegment<R>[]{
 const segments:RubySegment<R>[]=[];let plain:R[]=[];
 const flush=()=>{if(plain.length){segments.push({kind:"plain",runs:plain});plain=[];}};
 for(let index=0;index<runs.length;){
  const run=runs[index]!,literal=run.formats.find(format=>format.type===richRubyFormat),annotation=literal&&rubyAnnotationOf(literal);
  if(!literal){plain.push(run);index++;continue;}
  if(annotation===undefined){plain.push(rebuild(run,run.formats.filter(format=>format.type!==richRubyFormat)));index++;continue;}
  flush();const group:R[]=[];
  while(index<runs.length){const next=runs[index]!,other=next.formats.find(format=>format.type===richRubyFormat);if(!other||rubyAnnotationOf(other)!==annotation)break;group.push(rebuild(next,next.formats.filter(format=>format.type!==richRubyFormat)));index++;}
  segments.push({kind:"ruby",annotation,runs:group});
 }
 flush();return segments;
}
/**
 * Live element: `<ruby class="breditor-ruby" data-rich-ruby>base<rp>(</rp><rt>…</rt><rp>)</rp></ruby>`,
 * where the `rp`/`rt` are non-editable, empty and show their text through `richRubyStyles`.
 */
export function createRubyElement(document:Document,annotation:string,children:readonly Node[]):HTMLElement{
 const ruby=document.createElement("ruby");ruby.className=richRubyClass;ruby.dataset["richRuby"]="";ruby.append(...children);
 const paren=(text:string)=>{const rp=document.createElement("rp");rp.setAttribute("contenteditable","false");rp.dataset["rubyParen"]=text;return rp;};
 const rt=document.createElement("rt");rt.setAttribute("contenteditable","false");rt.dataset["rubyText"]=annotation;
 ruby.append(paren("("),rt,paren(")"));return ruby;
}
/** Live CSS: generated annotation text (not part of the editable text flow). */
export const richRubyStyles=`ruby[data-rich-ruby] rt[data-ruby-text]::before{content:attr(data-ruby-text)}ruby[data-rich-ruby] rp[data-ruby-paren]::before{content:attr(data-ruby-paren)}ruby[data-rich-ruby] rt,ruby[data-rich-ruby] rp{user-select:none;-webkit-user-select:none}`;

/** The whole ruby group of one text block containing a caret, or `undefined`. */
export function rubyGroupAt(model:RichPresentationModel,point:RichPoint):{block:string;start:string;end:string;annotation:string}|undefined{
 const node=model.nodes.get(point.block);if(!node)return undefined;
 const at=Number(point.offset),groups:{start:number;end:number;annotation:string}[]=[];let offset=0;
 for(const segment of groupRubyRuns(node.children.filter((child):child is Extract<typeof child,{kind:"text"}>=>child.kind==="text"),(run,formats)=>({...run,formats}))){
  const length=segment.runs.reduce((sum,run)=>sum+run.text.length,0);
  if(segment.kind==="ruby")groups.push({start:offset,end:offset+length,annotation:segment.annotation});offset+=length;
 }
 const pick=groups.find(g=>g.start<at&&at<g.end)??groups.find(g=>point.affinity==="before"?g.end===at:g.start===at)??groups.find(g=>g.start===at||g.end===at);
 return pick&&{block:point.block,start:String(pick.start),end:String(pick.end),annotation:pick.annotation};
}

interface RubyReader {
 inlineFormatState(kind:string):RichInlineFormatStateRead;
 supportsSelectionFormatting?():boolean;selectionFormatState?(kind:string):RichSelectionFormatStateRead;
}
/** One explicit ruby intent: complete targets plus a set (validated annotation) or a removal. */
export type RubyIntent={readonly targets:readonly {block:string;start:string;end:string}[];readonly annotation:string|null};
export interface RubyControl {
 readonly id:"ruby"|"remove-ruby";readonly label:string;readonly fields?:readonly RichToolbarField[];readonly mixedHint?:string;
 /** A caret reads the group around it (typing never inherits a reading); a range reads native state. */
 read(model:RichPresentationModel):RichToolbarReading;
 enabled(model:RichPresentationModel):boolean;
 /** Targets are the selected text of one block, or the whole group around a caret. */
 intent(model:RichPresentationModel,fields:Readonly<Record<string,string>>):RubyIntent|null;
}
function selectionTargets(model:RichPresentationModel,single:boolean):{block:string;start:string;end:string}[]{
 const s=model.view.selection;if(s?.kind!=="text")return [];
 if(s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset){const group=rubyGroupAt(model,s.focus);return group?[{block:group.block,start:group.start,end:group.end}]:[];}
 if(single&&s.anchor.block!==s.focus.block)return [];
 const node=model.nodes.get(s.anchor.block);if(!node)return [];
 if(s.anchor.block===s.focus.block){const [a,b]=[Number(s.anchor.offset),Number(s.focus.offset)].sort((x,y)=>x-y);return [{block:id(node),start:String(a),end:String(b)}];}
 // Removal may span blocks: every selected text block's range.
 const blocks=model.textBlocks,ai=blocks.findIndex(n=>id(n)===s.anchor.block),fi=blocks.findIndex(n=>id(n)===s.focus.block);if(ai<0||fi<0)return [];
 const [start,end]=ai<fi?[s.anchor,s.focus]:[s.focus,s.anchor];
 return blocks.slice(Math.min(ai,fi),Math.max(ai,fi)+1).flatMap(n=>{const length=n.children.reduce((sum,c)=>sum+(c.kind==="text"?c.text.length:0),0),first=id(n)===start.block?Number(start.offset):0,last=id(n)===end.block?Number(end.offset):length;return first===last?[]:[{block:id(n),start:String(first),end:String(last)}];});
}
/**
 * Owner-bound DOM-free controls: **Ruby** (an annotation field; applying sets or replaces the reading
 * on the selected base, or on the whole group around a caret) and **Remove ruby**.
 * `declared` is whether the owner's profile includes the extension (`richInlinePresentationHasRuby`).
 */
export function rubyControls(core:RubyReader,declared:boolean):readonly RubyControl[]{
 if(!declared)throw Error("Use a profile that includes the breditor-ruby/ruby extension");
 const native=core.supportsSelectionFormatting?.()===true&&typeof core.selectionFormatState==="function";
 const state=():RichInlineFormatState=>(native?core.selectionFormatState!(richRubyFormat):core.inlineFormatState(richRubyFormat)).state;
 const effective=(model:RichPresentationModel):RichInlineFormatState=>{
  const s=model.view.selection;
  if(s?.kind==="text"&&s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset){if(state().kind==="unavailable")return {kind:"unavailable"} as RichInlineFormatState;const group=rubyGroupAt(model,s.focus);return group?{kind:"uniform",format:rubyFormat(group.annotation)} as RichInlineFormatState:{kind:"unset"} as RichInlineFormatState;}
  return state();
 };
 const field:RichToolbarField={id:"annotation",label:"Ruby text",type:"text",maxLength:richRubyAnnotationMaxBytes,placeholder:"かんじ"};
 return Object.freeze([
  Object.freeze({id:"ruby" as const,label:"Ruby",fields:Object.freeze([field]),mixedHint:"Mixed ruby: applying sets one reading on the whole selection.",
   read(model:RichPresentationModel):RichToolbarReading{const s=effective(model);return s.kind==="uniform"?{kind:s.kind,values:{annotation:rubyAnnotationOf(s.format)??""}}:s.kind==="unset"?{kind:s.kind,values:{annotation:""}}:{kind:s.kind};},
   enabled:(model:RichPresentationModel)=>state().kind!=="unavailable"&&selectionTargets(model,true).length===1,
   intent(model:RichPresentationModel,fields:Readonly<Record<string,string>>):RubyIntent|null{
    const value=(fields["annotation"]??"").trim();
    if(!value)throw Error("Enter the ruby text, or use Remove ruby");
    if(!isRichRubyAnnotation(value))throw Error("Ruby text must be 1-256 UTF-8 bytes without control characters");
    const s=model.view.selection;
    if(s?.kind==="text"&&s.anchor.block!==s.focus.block)throw Error("Ruby annotates text within one block");
    const targets=selectionTargets(model,true);if(!targets.length)throw Error("Select the base text to annotate");
    return {targets,annotation:value};
   }}),
  Object.freeze({id:"remove-ruby" as const,label:"Remove ruby",
   read(model:RichPresentationModel):RichToolbarReading{return {kind:effective(model).kind};},
   enabled:(model:RichPresentationModel)=>{const k=effective(model).kind;return (k==="uniform"||k==="mixed")&&selectionTargets(model,false).length>0;},
   intent(model:RichPresentationModel):RubyIntent|null{const targets=selectionTargets(model,false);return targets.length?{targets,annotation:null}:null;}}),
 ]);
}
/** The native `setInlineFormat` command of one ruby intent: one exact Undo step. */
export function rubyCommand(intent:RubyIntent){
 return {kind:"setInlineFormat" as const,data:{change:intent.annotation===null?{kind:"remove" as const,format:richRubyFormat}:{kind:"set" as const,formatsJson:JSON.stringify([rubyFormat(intent.annotation)])},targets:intent.targets.map(t=>({...t}))}};
}
/** Local toolbar adapters (Ruby, Remove ruby), bound to the owner they were built for. Append them
 * to a toolbar, e.g. `toolbar:(core,standard)=>[...standard,...rubyToolbarControls(core,presentation)]`. */
export function rubyToolbarControls<P extends RichSelectionPolicy="original">(core:RubyReader&object,presentation:RichInlinePresentation):readonly ToolbarControl<P>[]{
 return rubyControls(core,richInlinePresentationHasRuby(presentation as RichInlinePresentation)).map(spec=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),...(spec.mixedHint?{mixedHint:spec.mixedHint}:{}),
  read:(c:ActionContext<P>)=>spec.read(c.model),
  enabled:(c:ActionContext<P>)=>spec.enabled(c.model),
  command(c:ActionContext<P>,_value?:string,fields:Readonly<Record<string,string>>={}){
   if(c.core!==(core as unknown))throw Error("Ruby control belongs to a different Rust owner");
   const intent=spec.intent(c.model,fields);return intent?rubyCommand(intent):null;
  }}) satisfies ToolbarControl<P>);
}
