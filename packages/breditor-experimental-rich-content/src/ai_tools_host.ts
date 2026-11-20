/**
 * Opt-in AI rewrite and language-check contract (docs/AI_AND_LANGUAGE_TOOLS.md).
 * Provider-agnostic: the host supplies a provider function. Nothing here performs network I/O, logs, stores or
 * forwards document text; only the explicitly scoped plain text in a provider request leaves this module, and only
 * by the host provider's own action. Provider output is untrusted input: it is shape-checked, size-bounded and
 * applied only through ordinary guarded editor commands.
 */
import type {RichCommand,RichCommandOutcome,RichDocumentSelection,RichSelection} from "./core.js";
import type {RichUiLocale} from "./ui_locale.js";
import type {RichSearchHostState} from "./search_host.js";

export type RichTextSelection=Extract<RichSelection,{kind:"text"}>;
/** What a provider receives and what a rewrite replaces. Always explicit; there is no implicit default scope. */
export type RichAiScope="selection"|"block"|"document";
/** One contiguous part of a text block. Offsets are UTF-16 code units within the block's text. */
export interface RichAiSegment {readonly block:string;readonly start:number;readonly end:number;readonly text:string}

/** Hard ceilings. Hosts may choose lower limits; larger values are rejected. */
export const RICH_AI_MAX_BYTES=1024*1024;
export const RICH_AI_MAX_INSTRUCTION=2048;
export const RICH_AI_MAX_TIMEOUT_MS=10*60*1000;

export interface RichAiHostState {readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean}
/** The exact read a snapshot is bound to: revision, complete document JSON and selection. */
export interface RichAiViewRead {readonly revision:string;readonly documentJson:string;readonly selection:RichDocumentSelection|null;readonly rangeEditing?:string|undefined;readonly readOnly?:boolean|undefined}
/** A rich replacement prepared by the explicit interchange adapter and native clipboard admission. */
export interface RichAiTransfer {readonly kind:"text"|"flow";readonly clipboardJson:string}
/**
 * Borrowed editor port. Every mutating method submits exactly one ordinary guarded editor command with the given
 * expected revision; the owner refuses it when that revision is not current. Notifications never publish.
 */
export interface RichAiToolsHost {
 readonly surface:HTMLElement;
 aiState():RichAiHostState;
 subscribeAi(listener:()=>void):()=>void;
 aiView():RichAiViewRead;
 /** Plain-text range replacement: `replaceGeneralRangePlainText` when the view declares general-v1, else `replaceTextRange`. */
 replaceAiText(selection:RichTextSelection,text:string,revision:string,focus:boolean):RichCommandOutcome|"queued";
 /** Rich range replacement with an admitted transfer: native general inline or flow clipboard paste over the range.
  * An owner without that native capability refuses the command; nothing is applied. */
 pasteAiTransfer(selection:RichTextSelection,transfer:RichAiTransfer,revision:string,focus:boolean):RichCommandOutcome|"queued";
 /** Selection-only publication (reveal an issue); never changes content. */
 selectAiRange(selection:RichTextSelection,revision:string):RichCommandOutcome|"queued";
 focus():void;
 uiLocale?():RichUiLocale;
 /**
  * What a displayed rewrite review is bound to. `"document"` (the default, local editors): the complete admitted
  * document JSON must be byte-identical to the snapshot. `"target"` (shared editors, where peers publish
  * continuously): only the target region must be byte-identical — see `aiTargetKey`. Either way Accept submits the
  * exact current revision, so the native guard still rejects a publication that raced the check.
  */
 readonly aiStaleScope?:"document"|"target";
}
/** Structural editor shape satisfied by `RichDomEditor` and by the SDK's local editor search/slash host. */
export interface RichAiEditorPort {
 readonly surface:HTMLElement;
 searchState():Pick<RichSearchHostState,"revision"|"closed"|"busy"|"composing"|"readOnly">;
 subscribeSearch(listener:()=>void):()=>void;
 view():{readonly revision:string;readonly documentJson:string;readonly selection:RichDocumentSelection|null;readonly rangeEditing?:string|undefined;readonly readOnly?:boolean|undefined};
 execute(command:RichCommand,focus?:boolean,expectedRevision?:string):RichCommandOutcome|"queued";
 focus():void;
 uiLocale?():RichUiLocale;
}
/** Adapt a local DOM editor (or the SDK local editor's borrowed host) to the AI port. */
export function richAiToolsHost(editor:RichAiEditorPort):RichAiToolsHost {
 const namespace=`br:ai:${globalThis.crypto.randomUUID()}`;let counter=0n;
 const allocate=(kind:string):string=>`${namespace}:${kind}:${counter++}`;
 const general=():boolean=>editor.view().rangeEditing==="general-v1";
 return Object.freeze({
  surface:editor.surface,
  aiState:()=>{const s=editor.searchState();return Object.freeze({revision:s.revision,closed:s.closed,busy:s.busy,composing:s.composing,readOnly:s.readOnly});},
  subscribeAi:(listener:()=>void)=>editor.subscribeSearch(listener),
  aiView:()=>{const v=editor.view();return Object.freeze({revision:v.revision,documentJson:v.documentJson,selection:v.selection,rangeEditing:v.rangeEditing,readOnly:v.readOnly});},
  replaceAiText:(selection:RichTextSelection,text:string,revision:string,focus:boolean)=>editor.execute(general()?{kind:"replaceGeneralRangePlainText",data:{selection,text,prefix:allocate("range")}}:{kind:"replaceTextRange",data:{selection,text}},focus,revision),
  pasteAiTransfer:(selection:RichTextSelection,transfer:RichAiTransfer,revision:string,focus:boolean)=>{
   const prefix=allocate("paste");
   const command:RichCommand=transfer.kind==="text"?{kind:"pasteGeneralInlineClipboard",data:{selection,clipboardJson:transfer.clipboardJson,prefix}}
    :{kind:"pasteGeneralFlowClipboard",data:{selection,clipboardJson:transfer.clipboardJson,allocation:{prefix,replica:"1",counter:String(counter++),lamport:revision},prefix,right:allocate("p")}};
   return editor.execute(command,focus,revision);
  },
  selectAiRange:(selection:RichTextSelection,revision:string)=>editor.execute({kind:"setSelection",selection},false,revision),
  focus:()=>editor.focus(),
  ...(editor.uiLocale?{uiLocale:()=>editor.uiLocale!()}:{}),
 });
}

// ---- Bounded reads of the admitted document JSON (no DOM reads, no JavaScript editing model). ----
interface JsonElement {kind:"element";type:string;properties:Record<string,unknown>;children:readonly (JsonElement|{kind:"text";text:string})[]}
const textTypes=new Set(["breditor/paragraph","breditor/heading","breditor/code-block","breditor/details-summary"]);
/** One immutable snapshot of every text block in document tree order, keyed by stable block id. */
export interface RichAiDocument {readonly order:readonly string[];readonly texts:ReadonlyMap<string,string>}
export function readAiDocument(documentJson:string):RichAiDocument {
 const parsed=JSON.parse(documentJson) as {root?:JsonElement};if(!parsed||typeof parsed!=="object"||!parsed.root||parsed.root.kind!=="element")throw Error("Unexpected native document shape");
 const order:string[]=[],texts=new Map<string,string>(),stack:JsonElement[]=[parsed.root];
 while(stack.length){
  const node=stack.pop()!;
  if(textTypes.has(node.type)){const id=String(node.properties["breditor/block-id"]);if(!texts.has(id)){order.push(id);texts.set(id,node.children.map(child=>child.kind==="text"?child.text:"").join(""));}}
  for(let i=node.children.length-1;i>=0;i--){const child=node.children[i]!;if(child.kind==="element")stack.push(child);}
 }
 return Object.freeze({order:Object.freeze(order),texts});
}
/**
 * Canonical binding of a rewrite target region, or null when a target block is absent. It covers, byte for byte,
 * every node from the first target block through the last one in document tree order (their own properties, text
 * runs and formats, and every block, table or image between them) plus the type/properties of both blocks' ancestor
 * chains (not the ancestors' other children). An edit anywhere else in the document leaves it unchanged; an edit
 * inside the region, a move out of it, a re-wrap or a new block between the endpoints changes it.
 */
export function aiTargetKey(documentJson:string,segments:readonly Pick<RichAiSegment,"block">[]):string|null {
 const first=segments[0]?.block,last=segments[segments.length-1]?.block;if(first===undefined||last===undefined)return null;
 const parsed=JSON.parse(documentJson) as {root?:JsonElement};if(!parsed||typeof parsed!=="object"||!parsed.root||parsed.root.kind!=="element")return null;
 const header=(node:JsonElement):string=>{const {children:_,...rest}=node as JsonElement&Record<string,unknown>;return JSON.stringify(rest);};
 const blockId=(node:JsonElement):string|undefined=>{const id=node.properties?.["breditor/block-id"];return typeof id==="string"?id:undefined;};
 type Frame={readonly node:JsonElement|{kind:"text"}}|{readonly exit:string|undefined};
 const tokens:string[]=[],path:string[]=[],stack:Frame[]=[{node:parsed.root}];let start=-1,end=-1,firstChain:string[]|null=null,lastChain:string[]|null=null;
 while(stack.length&&end<0){
  const frame=stack.pop()!;
  if("exit" in frame){path.pop();if(start>=0){tokens.push(">");if(frame.exit===last)end=tokens.length;}continue;}
  const node=frame.node;
  if(node.kind!=="element"){if(start>=0)tokens.push(`t${JSON.stringify(node)}`);continue;}
  const element=node as JsonElement,id=blockId(element),h=header(element);
  if(start<0&&id===first){start=tokens.length;firstChain=[...path];}
  if(start>=0&&id===last&&lastChain===null)lastChain=[...path];
  if(start>=0)tokens.push(`<${h}`);path.push(h);stack.push({exit:id});
  for(let i=element.children.length-1;i>=0;i--)stack.push({node:element.children[i]!});
 }
 if(start<0||end<0||!firstChain||!lastChain)return null;
 return JSON.stringify([firstChain,lastChain,tokens.slice(start,end)]);
}
/** UTF-8 length without allocating an encoded copy. */
export function utf8Bytes(text:string):number {
 let count=0;
 for(let i=0;i<text.length;i++){const u=text.charCodeAt(i);if(u>=0xd800&&u<=0xdbff&&i+1<text.length){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){count+=4;i++;continue;}}count+=u<0x80?1:u<0x800?2:3;}
 return count;
}
/** True when `offset` does not split a surrogate pair of `text`. */
export function scalarBoundary(text:string,offset:number):boolean {
 if(offset<=0||offset>=text.length)return true;
 const before=text.charCodeAt(offset-1),after=text.charCodeAt(offset);return !(before>=0xd800&&before<=0xdbff&&after>=0xdc00&&after<=0xdfff);
}
export interface RichAiTarget {
 readonly scope:RichAiScope;readonly revision:string;readonly documentJson:string;
 readonly segments:readonly RichAiSegment[];
 /** Segment texts joined with LF in document order. */
 readonly text:string;
 /** Ordered (forward) text range covering the whole target; null for an empty document. */
 readonly selection:RichTextSelection|null;
}
export class RichAiScopeError extends Error {readonly code:"no-selection"|"unknown-block";constructor(code:"no-selection"|"unknown-block",message:string){super(message);this.name="RichAiScopeError";this.code=code;}}
const point=(block:string,offset:number)=>({block,offset:String(offset),affinity:"after" as const});
/** Resolve an explicit scope against one exact view. Read-only: nothing is published. */
export function resolveAiTarget(view:RichAiViewRead,scope:RichAiScope,block?:string):RichAiTarget {
 if(scope!=="selection"&&scope!=="block"&&scope!=="document")throw new TypeError("Expected scope selection, block or document");
 const doc=readAiDocument(view.documentJson);let segments:RichAiSegment[];
 if(scope==="document")segments=doc.order.map(id=>{const text=doc.texts.get(id)!;return {block:id,start:0,end:text.length,text};});
 else if(scope==="block"){
  const selection=view.selection,id=block??(selection?.kind==="text"?selection.focus.block:undefined);
  if(id===undefined)throw new RichAiScopeError("no-selection","Place the caret in a text block or name one");
  const text=doc.texts.get(id);if(text===undefined)throw new RichAiScopeError("unknown-block","The block is not a text block of this document");
  segments=[{block:id,start:0,end:text.length,text}];
 }else{
  const selection=view.selection;
  if(selection?.kind!=="text")throw new RichAiScopeError("no-selection","Select text first");
  const a=doc.order.indexOf(selection.anchor.block),f=doc.order.indexOf(selection.focus.block);
  if(a<0||f<0)throw new RichAiScopeError("no-selection","Select text inside text blocks");
  const ao=Number(selection.anchor.offset),fo=Number(selection.focus.offset),forward=a<f||a===f&&ao<=fo;
  const [first,start,last,end]=forward?[a,ao,f,fo]:[f,fo,a,ao];
  if(first===last&&start===end)throw new RichAiScopeError("no-selection","Select text first");
  segments=[];
  for(let i=first;i<=last;i++){const id=doc.order[i]!,text=doc.texts.get(id)!,s=i===first?start:0,e=i===last?end:text.length;segments.push({block:id,start:s,end:e,text:text.slice(s,e)});}
 }
 const frozen=Object.freeze(segments.map(s=>Object.freeze(s))),first=frozen[0],last=frozen[frozen.length-1];
 return Object.freeze({scope,revision:view.revision,documentJson:view.documentJson,segments:frozen,text:frozen.map(s=>s.text).join("\n"),
  selection:first&&last?Object.freeze({kind:"text" as const,anchor:point(first.block,first.start),focus:point(last.block,last.end)}):null});
}

// ---- Provider invocation: cancellation, timeout and late-result isolation. ----
export class RichAiAbortError extends Error {readonly reason:"cancelled"|"timeout"|"superseded"|"disposed";constructor(reason:"cancelled"|"timeout"|"superseded"|"disposed"){super(reason==="timeout"?"The provider did not answer in time":"The provider request was cancelled");this.name="AbortError";this.reason=reason;}}
/** Run one provider call. Abort settles immediately; a late provider result is never observed. */
export function runAiProvider<T>(realm:Window,controller:AbortController,timeoutMs:number,call:(signal:AbortSignal)=>T|Promise<T>):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  const signal=controller.signal;let done=false,timer:ReturnType<typeof setTimeout>|undefined;
  const finish=(work:()=>void)=>{if(done)return;done=true;if(timer!==undefined)realm.clearTimeout(timer);signal.removeEventListener("abort",onAbort);work();};
  const onAbort=()=>finish(()=>{const reason=signal.reason;reject(reason instanceof RichAiAbortError?reason:new RichAiAbortError("cancelled"));});
  if(signal.aborted){onAbort();return;}
  signal.addEventListener("abort",onAbort);
  if(timeoutMs>0)timer=realm.setTimeout(()=>controller.abort(new RichAiAbortError("timeout")),timeoutMs);
  let result:T|Promise<T>;
  try{result=call(signal);}catch(error){finish(()=>reject(error));return;}
  Promise.resolve(result).then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));
 });
}
/** Validate host limit options against the hard ceilings. */
export function boundedOption(value:unknown,fallback:number,max:number,name:string,min=1):number {
 if(value===undefined)return fallback;
 if(typeof value!=="number"||!Number.isSafeInteger(value)||value<min||value>max)throw new RangeError(`Expected ${name} between ${min} and ${max}`);
 return value;
}
/** Plain object with own data properties only; getters, arrays and class instances are refused. */
export function plainRecord(value:unknown):Record<string,unknown>|null {
 if(value===null||typeof value!=="object"||Array.isArray(value))return null;
 const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return null;
 const out:Record<string,unknown>={};
 for(const key of Object.keys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!("value" in d))return null;out[key]=d.value;}
 return out;
}
/** Admit untrusted plain text: well-formed UTF-16, CR/CRLF normalized to LF, no other control characters. */
export function admitAiText(value:unknown,allowNewlines:boolean):string|null {
 if(typeof value!=="string")return null;
 const text=value.replace(/\r\n?/g,"\n");
 for(let i=0;i<text.length;i++){
  const u=text.charCodeAt(i);
  if(u>=0xd800&&u<=0xdbff){const next=text.charCodeAt(i+1);if(!(next>=0xdc00&&next<=0xdfff))return null;i++;continue;}
  if(u>=0xdc00&&u<=0xdfff)return null;
  if(u===0x0a){if(!allowNewlines)return null;continue;}
  if(u===0x09)continue;
  if(u<0x20||u===0x7f||u>=0x80&&u<=0x9f)return null;
 }
 return text;
}
