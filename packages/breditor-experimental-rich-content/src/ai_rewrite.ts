/**
 * Opt-in rewrite/generate review panel (docs/AI_AND_LANGUAGE_TOOLS.md). A host provider receives only the explicitly
 * scoped plain text; its untrusted answer is shown as text for review and applied on Accept as one ordinary guarded
 * editor command bound to the snapshot's document content. Nothing here performs I/O or logs.
 */
import type {RichCommandOutcome} from "./core.js";
import type {RichClipboardInterchange,RichInterchangeNotice} from "./clipboard_interchange.js";
import {defaultRichUi,type RichUiLocale,type RichUiStringKey} from "./ui_locale.js";
import {RICH_AI_MAX_BYTES,RICH_AI_MAX_INSTRUCTION,RICH_AI_MAX_TIMEOUT_MS,RichAiAbortError,RichAiScopeError,admitAiText,boundedOption,plainRecord,resolveAiTarget,runAiProvider,utf8Bytes,type RichAiSegment,type RichAiTarget,type RichAiToolsHost,type RichAiTransfer} from "./ai_tools_host.js";
import {importAiSource} from "./ai_interchange.js";
import {diffAiText,type RichAiDiffPart} from "./ai_diff.js";

export type RichRewriteScope="selection"|"block";
/** Exactly one key. `markdown`/`html` require the explicit interchange adapter and a native owner with general range paste. */
export type RichRewriteOutput=Readonly<{text:string}>|Readonly<{markdown:string}>|Readonly<{html:string}>;
export interface RichRewriteRequest {readonly scope:RichRewriteScope;readonly instruction:string;readonly block?:string}
/** Everything a provider receives. No editor, DOM, history, identity or other document text is included. */
export interface RichRewriteProviderRequest {
 readonly kind:"rewrite";readonly instruction:string;readonly scope:RichRewriteScope;
 /** The scoped text: segment texts joined with LF. */
 readonly text:string;
 readonly segments:readonly RichAiSegment[];
 /** Opaque revision of the snapshot (informational; it is not an edit credential). */
 readonly revision:string;
 readonly signal:AbortSignal;
}
export type RichRewriteProvider=(request:RichRewriteProviderRequest)=>RichRewriteOutput|Promise<RichRewriteOutput>;
export interface RichAiToolsOptions {
 /** Default provider for the built-in form and `rerun()`. Without one the form is not shown. */
 provider?:RichRewriteProvider;
 /** Explicit adapter for Markdown/HTML output; omitted means formatted output is refused. */
 interchange?:RichClipboardInterchange;
 /** UTF-8 bytes of scoped text sent (default 64 KiB) and of provider output admitted (default 64 KiB); at most 1 MiB. */
 maxInputBytes?:number;maxOutputBytes?:number;
 /** Provider deadline in milliseconds (default 60 000; 0 disables; at most 10 minutes). */
 timeoutMs?:number;
 /** Scopes offered by the form, in order (default selection, block). */
 scopes?:readonly RichRewriteScope[];
 initialInstruction?:string;label?:string;
 onApply?:(outcome:RichCommandOutcome|"queued")=>void;
 onStale?:()=>void;
 onError?:(error:unknown)=>void;
}
export type RichAiPhase="idle"|"pending"|"review"|"stale"|"applied"|"rejected"|"cancelled"|"failed";
/** Immutable review of one provider answer. Display data only; it grants no mutation authority. */
export interface RichAiReview {
 readonly revision:string;readonly scope:RichRewriteScope;readonly original:string;readonly proposed:string;
 readonly format:"text"|"markdown"|"html";readonly losses:readonly RichInterchangeNotice[];readonly diff:readonly RichAiDiffPart[];
 readonly unchanged:boolean;
}
export interface RichAiToolsState {
 readonly phase:RichAiPhase;readonly disposed:boolean;readonly review:RichAiReview|null;readonly error:string|null;
 readonly request:RichRewriteRequest|null;
}
export interface RichAiTools {
 /**
  * Snapshot the scope, call the provider (cancellable) and show the review. Rejects before anything is sent when
  * a precondition fails (no target, busy, read-only, input too large); resolves null when the provider call is
  * cancelled, superseded, times out, fails or returns unusable output (see `state().error`).
  */
 requestRewrite(request:RichRewriteRequest,provider?:RichRewriteProvider):Promise<RichAiReview|null>;
 /** Apply the reviewed change as one guarded command; refuses (and marks stale) when the document changed. */
 accept():RichCommandOutcome|"queued";
 reject():void;
 /** Abort the pending provider call. The document is never changed by a cancelled request. */
 cancel():void;
 /** Repeat the last request against the current document. */
 rerun():Promise<RichAiReview|null>;
 state():RichAiToolsState;
 dispose():void;
}
const hosts=new WeakSet<HTMLElement>();
class AiTools implements RichAiTools {
 readonly #root:HTMLElement;readonly #host:RichAiToolsHost;readonly #options:RichAiToolsOptions;readonly #ui:RichUiLocale;readonly #window:Window;readonly #abort:AbortController;readonly #unsubscribe:()=>void;
 readonly #maxInput:number;readonly #maxOutput:number;readonly #timeout:number;readonly #scopes:readonly RichRewriteScope[];
 readonly #element:HTMLElement;readonly #instruction:HTMLTextAreaElement|undefined;readonly #scope:HTMLSelectElement|undefined;readonly #generate:HTMLButtonElement|undefined;readonly #stop:HTMLButtonElement;
 readonly #review:HTMLDivElement;readonly #before:HTMLDivElement;readonly #after:HTMLDivElement;readonly #losses:HTMLUListElement;readonly #accept:HTMLButtonElement;readonly #reject:HTMLButtonElement;readonly #rerun:HTMLButtonElement;readonly #status:HTMLParagraphElement;
 #phase:RichAiPhase="idle";#disposed=false;#error:string|null=null;#message:string|null=null;#generation=0;#pending:AbortController|undefined;#scheduled=false;#keyboard=false;#panelRequest=false;
 #request:RichRewriteRequest|null=null;#provider:RichRewriteProvider|undefined;
 #target:RichAiTarget|undefined;#result:{review:RichAiReview;text?:string;transfer?:RichAiTransfer}|undefined;
 constructor(root:HTMLElement,host:RichAiToolsHost,options:RichAiToolsOptions){
  if(hosts.has(root)||root===host.surface||root.contains(host.surface)||host.surface.contains(root)||root.ownerDocument!==host.surface.ownerDocument)throw Error("AI tools require an unused separate host outside the editing surface");
  const state=host.aiState();if(state.closed)throw Error("Use an open editor");
  if(options.provider!==undefined&&typeof options.provider!=="function")throw new TypeError("Expected a provider function");
  if(options.interchange!==undefined&&(!options.interchange||typeof options.interchange.importHtml!=="function"||typeof options.interchange.importMarkdown!=="function"))throw new TypeError("Expected an explicit interchange adapter");
  if(options.label!==undefined&&(typeof options.label!=="string"||!options.label||options.label.length>256))throw new TypeError("Expected a bounded label");
  if(options.initialInstruction!==undefined&&(admitAiText(options.initialInstruction,true)===null||options.initialInstruction.length>RICH_AI_MAX_INSTRUCTION))throw new TypeError("Expected a bounded plain-text instruction");
  const scopes=options.scopes??["selection","block"];
  if(!Array.isArray(scopes)||!scopes.length||scopes.length>2||new Set(scopes).size!==scopes.length||scopes.some(s=>s!=="selection"&&s!=="block"))throw new TypeError("Expected rewrite scopes selection and/or block");
  this.#maxInput=boundedOption(options.maxInputBytes,64*1024,RICH_AI_MAX_BYTES,"maxInputBytes");this.#maxOutput=boundedOption(options.maxOutputBytes,64*1024,RICH_AI_MAX_BYTES,"maxOutputBytes");
  this.#timeout=boundedOption(options.timeoutMs,60_000,RICH_AI_MAX_TIMEOUT_MS,"timeoutMs",0);this.#scopes=Object.freeze([...scopes]);
  this.#root=root;this.#host=host;this.#options={...options};this.#ui=host.uiLocale?.()??defaultRichUi;this.#provider=options.provider;
  const d=root.ownerDocument,window=d.defaultView;if(!window)throw Error("AI tools require a live document");this.#window=window;
  const realm=window as unknown as {AbortController:typeof AbortController},signal=(this.#abort=new realm.AbortController()).signal,ui=this.#ui,label=options.label??ui.text("aiPanelLabel");
  this.#element=d.createElement("section");this.#element.dataset["breditorAi"]="";this.#element.setAttribute("aria-label",label);ui.applyChrome(this.#element);
  const style=d.createElement("style");style.textContent=styles;const title=d.createElement("h2");title.textContent=label;this.#element.append(style,title);
  const button=(name:string,key:RichUiStringKey,run:()=>void,parent:HTMLElement)=>{const node=d.createElement("button");node.type="button";node.dataset["aiAction"]=name;node.textContent=ui.text(key);node.addEventListener("click",()=>run(),{signal});parent.append(node);return node;};
  const form=d.createElement("div");form.dataset["aiForm"]="";
  if(options.provider){
   const instructionLabel=d.createElement("label"),scopeLabel=d.createElement("label");
   this.#instruction=d.createElement("textarea");this.#instruction.dataset["aiField"]="instruction";this.#instruction.rows=2;this.#instruction.maxLength=RICH_AI_MAX_INSTRUCTION;this.#instruction.value=options.initialInstruction??"";
   instructionLabel.append(ui.text("aiInstructionLabel"),this.#instruction);
   this.#scope=d.createElement("select");this.#scope.dataset["aiField"]="scope";
   for(const scope of this.#scopes){const option=d.createElement("option");option.value=scope;option.textContent=ui.text(scope==="selection"?"aiScopeSelection":"aiScopeBlock");this.#scope.append(option);}
   scopeLabel.append(ui.text("aiScopeLabel"),this.#scope);form.append(instructionLabel,scopeLabel);
   this.#generate=button("generate","aiGenerate",()=>this.#fromForm(),form);
   this.#instruction.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.metaKey||event.ctrlKey)&&!event.isComposing){event.preventDefault();this.#fromForm();}},{signal});
  }
  this.#stop=button("stop","aiStop",()=>this.cancel(),form);
  this.#review=d.createElement("div");this.#review.dataset["aiReview"]="";this.#review.setAttribute("role","region");this.#review.tabIndex=-1;
  const reviewTitle=d.createElement("h3"),headingId=`breditor-ai-${globalThis.crypto.randomUUID().slice(0,8)}`;reviewTitle.id=headingId;reviewTitle.textContent=ui.text("aiReviewLabel");this.#review.setAttribute("aria-labelledby",headingId);
  const pane=(name:string,key:RichUiStringKey)=>{const figure=d.createElement("div"),caption=d.createElement("h4"),body=d.createElement("div");figure.dataset["aiPane"]=name;caption.textContent=ui.text(key);body.dataset[name==="before"?"aiBefore":"aiAfter"]="";figure.append(caption,body);this.#review.append(figure);return body;};
  this.#review.append(reviewTitle);this.#before=pane("before","aiBefore");this.#after=pane("after","aiAfter");
  this.#losses=d.createElement("ul");this.#losses.dataset["aiLosses"]="";
  const actions=d.createElement("div");actions.dataset["aiActions"]="";
  this.#accept=button("accept","aiAccept",()=>this.#attempt(()=>{this.accept();}),actions);this.#reject=button("reject","aiReject",()=>this.reject(),actions);this.#rerun=button("rerun","aiRerun",()=>{this.#panelRequest=true;void this.rerun().catch(()=>{/* Reported in status. */});},actions);
  this.#review.append(actions);
  this.#status=d.createElement("p");this.#status.dataset["aiStatus"]="";this.#status.setAttribute("role","status");this.#status.setAttribute("aria-live","polite");
  // Import notices stay visible when a formatted answer is refused, so they live outside the review region.
  this.#element.append(form,this.#review,this.#losses,this.#status);
  this.#element.addEventListener("keydown",event=>{if(event.key!=="Escape"||event.isComposing)return;if(this.#phase==="pending"){event.preventDefault();this.cancel();}else if(this.#phase==="review"||this.#phase==="stale"){event.preventDefault();this.reject();}},{signal});
  let unsubscribe:(()=>void)|undefined;
  try{unsubscribe=host.subscribeAi(()=>this.#schedule());this.#unsubscribe=unsubscribe;hosts.add(root);root.replaceChildren(this.#element);this.#render();}
  catch(error){unsubscribe?.();this.#abort.abort();hosts.delete(root);throw error;}
 }
 #live():void{if(this.#disposed)throw Error("AI tools are disposed");}
 #attempt(work:()=>void):void{try{work();}catch{/* Already reported through status/onError. */}}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}}
 #fail(message:string,error?:unknown):never{this.#phase="failed";this.#error=message;this.#message=null;this.#render();const failure=error instanceof Error?error:Error(message);this.#report(failure);throw failure;}
 #fromForm():void{
  if(!this.#instruction||!this.#scope)return;
  this.#panelRequest=true;
  void this.requestRewrite({scope:this.#scope.value as RichRewriteScope,instruction:this.#instruction.value}).catch(()=>{/* Reported in status. */});
 }
 #schedule():void{if(this.#disposed||this.#scheduled)return;this.#scheduled=true;queueMicrotask(()=>{this.#scheduled=false;this.#published();});}
 /** A changed document invalidates a displayed review; selection-only publications do not. */
 #published():void{
  if(this.#disposed)return;
  if(this.#phase==="review"&&this.#target){let changed=true;try{const s=this.#host.aiState();changed=s.closed||this.#host.aiView().documentJson!==this.#target.documentJson;}catch{changed=true;}
   if(changed){this.#markStale();return;}}
  this.#render();
 }
 #markStale():void{this.#phase="stale";this.#error=this.#ui.text("aiStale");this.#message=null;this.#render();try{this.#options.onStale?.();}catch(error){this.#report(error);}}
 #clear():void{this.#target=undefined;this.#result=undefined;}
 async requestRewrite(request:RichRewriteRequest,provider:RichRewriteProvider|undefined=this.#provider):Promise<RichAiReview|null>{
  const fromPanel=this.#panelRequest;this.#panelRequest=false;
  this.#live();
  if(typeof provider!=="function")throw new TypeError("Supply a rewrite provider function");
  const record=plainRecord(request);
  if(!record||Object.keys(record).some(key=>!["scope","instruction","block"].includes(key))||!this.#scopes.includes(record["scope"] as RichRewriteScope)||typeof record["instruction"]!=="string"||record["instruction"].length>RICH_AI_MAX_INSTRUCTION||admitAiText(record["instruction"],true)===null||record["block"]!==undefined&&(typeof record["block"]!=="string"||!record["block"]))throw new TypeError("Expected an explicit rewrite scope and a bounded plain-text instruction");
  const frozen:RichRewriteRequest=Object.freeze({scope:record["scope"] as RichRewriteScope,instruction:admitAiText(record["instruction"],true)!,...(typeof record["block"]==="string"?{block:record["block"]}:{})});
  this.#pending?.abort(new RichAiAbortError("superseded"));this.#pending=undefined;this.#clear();this.#request=frozen;this.#provider=provider;this.#error=null;this.#message=null;
  const generation=++this.#generation,state=this.#host.aiState();
  if(state.closed)this.#fail("The editor is closed");
  if(state.busy||state.composing)this.#fail(this.#ui.text("aiBusy"));
  if(state.readOnly)this.#fail(this.#ui.text("aiReadOnly"));
  let target:RichAiTarget;
  try{target=resolveAiTarget(this.#host.aiView(),frozen.scope,frozen.block);}catch(error){if(error instanceof RichAiScopeError)this.#fail(this.#ui.text("aiNoSelection"),error);throw error;}
  if(!target.selection)this.#fail(this.#ui.text("aiNoSelection"));
  if(utf8Bytes(target.text)>this.#maxInput)this.#fail(this.#ui.text("aiInputTooLarge",{limit:this.#maxInput}));
  // Focus follows the request only when it was started from this panel (never stolen from the editor).
  // (WebKit does not focus clicked buttons, so a request from this panel's own controls also counts.)
  this.#keyboard=fromPanel||this.#element.contains(this.#root.ownerDocument.activeElement);
  this.#target=target;this.#phase="pending";this.#render();
  const realm=this.#window as unknown as {AbortController:typeof AbortController},controller=new realm.AbortController();this.#pending=controller;
  const live=()=>!this.#disposed&&this.#generation===generation;
  let output:unknown;
  try{
   output=await runAiProvider(this.#window,controller,this.#timeout,signal=>provider(Object.freeze({kind:"rewrite",instruction:frozen.instruction,scope:frozen.scope,text:target.text,segments:target.segments,revision:target.revision,signal})));
  }catch(error){
   if(!live())return null;this.#pending=undefined;
   if(error instanceof RichAiAbortError){
    if(error.reason==="timeout"){this.#phase="failed";this.#error=this.#ui.text("aiTimeout");}else{this.#phase="cancelled";this.#message=this.#ui.text("aiCancelled");}
    this.#clear();this.#render();if(error.reason==="timeout")this.#report(error);return null;
   }
   this.#clear();this.#phase="failed";this.#error=this.#ui.text("aiFailed",{reason:error instanceof Error&&error.message?error.message.slice(0,256):"error"});this.#render();this.#report(error);return null;
  }
  if(!live())return null;this.#pending=undefined;
  try{return this.#admit(target,output);}
  catch(error){if(!live())return null;this.#clear();if((this.#phase as RichAiPhase)!=="failed"){this.#phase="failed";this.#error=this.#ui.text("aiInvalidOutput");this.#render();this.#report(error);}return null;}
 }
 #admit(target:RichAiTarget,output:unknown):RichAiReview{
  const record=plainRecord(output),keys=record?Object.keys(record):[];
  if(!record||keys.length!==1||!["text","markdown","html"].includes(keys[0]!)||typeof record[keys[0]!]!=="string")this.#fail(this.#ui.text("aiInvalidOutput"));
  const format=keys[0] as "text"|"markdown"|"html",raw=record[format] as string;
  if(raw.length>this.#maxOutput||utf8Bytes(raw)>this.#maxOutput)this.#fail(this.#ui.text("aiOutputTooLarge",{limit:this.#maxOutput}));
  let proposed:string,transfer:RichAiTransfer|undefined,losses:readonly RichInterchangeNotice[]=Object.freeze([]);
  if(format==="text"){const text=admitAiText(raw,true);if(text===null)this.#fail(this.#ui.text("aiInvalidOutput"));proposed=text;}
  else{
   const adapter=this.#options.interchange;if(!adapter)this.#fail(this.#ui.text("aiFormattedUnavailable"));
   const imported=importAiSource(adapter,format,raw);losses=imported.losses;
   if(!imported.ok){this.#renderLosses(losses);this.#fail(this.#ui.text("aiImportRefused",{reason:imported.error}));}
   transfer=imported.transfer;proposed=imported.text;
  }
  const review:RichAiReview=Object.freeze({revision:target.revision,scope:target.scope as RichRewriteScope,original:target.text,proposed,format,losses,diff:diffAiText(target.text,proposed),unchanged:format==="text"&&proposed===target.text});
  this.#result={review,...(transfer?{transfer}:{text:proposed})};this.#phase="review";this.#error=null;this.#message=review.unchanged?this.#ui.text("aiNoChange"):this.#ui.text("aiReady");
  const active=this.#root.ownerDocument.activeElement,focusInside=this.#keyboard&&(!active||active===this.#root.ownerDocument.body||this.#element.contains(active));
  this.#render();
  // A document change while the provider ran makes the review stale before it can be accepted.
  if(this.#host.aiView().documentJson!==target.documentJson)this.#markStale();
  else if(focusInside)this.#review.focus({preventScroll:true});
  return review;
 }
 accept():RichCommandOutcome|"queued"{
  this.#live();const target=this.#target,result=this.#result;
  if(this.#phase==="stale")throw Error(this.#ui.text("aiStale"));
  if(this.#phase!=="review"||!target||!result||!target.selection)throw Error("There is no reviewed suggestion to accept");
  const state=this.#host.aiState();
  if(state.closed)this.#fail("The editor is closed");
  if(state.busy||state.composing){const error=Error(this.#ui.text("aiBusy"));this.#error=error.message;this.#render();this.#report(error);throw error;}
  if(state.readOnly){const error=Error(this.#ui.text("aiReadOnly"));this.#error=error.message;this.#render();this.#report(error);throw error;}
  const view=this.#host.aiView();
  if(view.documentJson!==target.documentJson){this.#markStale();const error=Error(this.#ui.text("aiStale"));this.#report(error);throw error;}
  if(result.review.unchanged){this.#clear();this.#phase="applied";this.#error=null;this.#message=this.#ui.text("aiNoChange");this.#render();return "unchanged";}
  let outcome:RichCommandOutcome|"queued";
  // The document content is the snapshot's; the guard is the exact current publication (selection may have moved).
  try{outcome=result.transfer?this.#host.pasteAiTransfer(target.selection,result.transfer,view.revision,true):this.#host.replaceAiText(target.selection,result.text!,view.revision,true);}
  catch(error){this.#fail(this.#ui.text("aiFailed",{reason:error instanceof Error?error.message.slice(0,256):"error"}),error);}
  this.#clear();this.#phase="applied";this.#error=null;this.#message=this.#ui.text("aiApplied",{revision:this.#host.aiState().revision});this.#render();
  try{this.#options.onApply?.(outcome);}catch(error){this.#report(error);}
  return outcome;
 }
 reject():void{
  if(this.#disposed||this.#phase!=="review"&&this.#phase!=="stale")return;
  const inside=this.#element.contains(this.#root.ownerDocument.activeElement);
  this.#clear();this.#phase="rejected";this.#error=null;this.#message=this.#ui.text("aiRejected");this.#render();
  if(inside&&!this.#host.aiState().closed)this.#host.focus();
 }
 cancel():void{if(this.#disposed||!this.#pending)return;this.#pending.abort(new RichAiAbortError("cancelled"));}
 rerun():Promise<RichAiReview|null>{
  try{this.#live();if(!this.#request)throw Error("There is no previous request to run again");}catch(error){return Promise.reject(error);}
  return this.requestRewrite(this.#request,this.#provider);
 }
 #renderLosses(losses:readonly RichInterchangeNotice[]):void{
  const d=this.#root.ownerDocument;this.#losses.replaceChildren();
  if(!losses.length)return;
  const item=d.createElement("li");item.dataset["aiLossSummary"]="";item.textContent=this.#ui.text("aiLosses",{losses:losses.map(n=>`${n.code}${n.count>1?` ×${n.count}`:""}`).join(", ")});this.#losses.append(item);
  for(const n of losses){const li=d.createElement("li");li.dataset["aiLoss"]=n.code;li.dataset["aiEffect"]=n.effect;li.hidden=true;li.textContent=n.code;this.#losses.append(li);}
 }
 #render():void{
  if(this.#disposed)return;const d=this.#root.ownerDocument,state=this.#host.aiState(),phase=this.#phase,result=this.#result,had=d.activeElement;
  this.#element.dataset["aiPhase"]=phase;this.#element.setAttribute("aria-busy",String(phase==="pending"));
  const blocked=state.closed||state.busy||state.composing;
  if(this.#generate)this.#generate.disabled=blocked||state.readOnly||phase==="pending";
  this.#stop.hidden=phase!=="pending";
  const showing=(phase==="review"||phase==="stale")&&!!result;
  this.#review.hidden=!showing;
  if(showing&&result){
   const fill=(target:HTMLElement,kinds:readonly RichAiDiffPart["kind"][])=>{target.replaceChildren(...result.review.diff.filter(part=>kinds.includes(part.kind)).map(part=>{if(part.kind==="same")return d.createTextNode(part.text);const mark=d.createElement(part.kind==="removed"?"del":"ins");mark.textContent=part.text;return mark;}));};
   fill(this.#before,["same","removed"]);fill(this.#after,["same","added"]);this.#renderLosses(result.review.losses);
  }else if(phase!=="failed"){this.#before.replaceChildren();this.#after.replaceChildren();this.#losses.replaceChildren();}
  this.#accept.hidden=phase!=="review";this.#accept.disabled=blocked||state.readOnly;
  this.#reject.hidden=!showing;this.#rerun.hidden=phase!=="stale";this.#rerun.disabled=blocked||state.readOnly;
  this.#status.textContent=state.closed?"Editor closed":this.#error??(phase==="pending"?this.#ui.text("aiPending"):this.#message??"");
  this.#status.toggleAttribute("data-ai-error",this.#error!==null);
  // A control that just became disabled or hidden drops focus; keep keyboard users inside the panel.
  if(had instanceof d.defaultView!.HTMLButtonElement&&this.#element.contains(had)&&(had.disabled||had.hidden||had.closest("[hidden]"))){
   const next=phase==="pending"?this.#stop:this.#generate&&!this.#generate.disabled?this.#generate:undefined;next?.focus({preventScroll:true});
  }
 }
 state():RichAiToolsState{return Object.freeze({phase:this.#phase,disposed:this.#disposed,review:this.#result?.review??null,error:this.#error,request:this.#request});}
 /** Releases the panel, its subscription and any pending provider call; never the editor or its history. */
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#generation++;this.#pending?.abort(new RichAiAbortError("disposed"));this.#pending=undefined;this.#clear();this.#abort.abort();this.#unsubscribe();this.#element.remove();hosts.delete(this.#root);}
}
/** Mount the opt-in rewrite review panel in a host element outside the editing surface. */
export function mountRichAiTools(root:HTMLElement,host:RichAiToolsHost,options:RichAiToolsOptions={}):RichAiTools{return new AiTools(root,host,options);}
const styles=`[data-breditor-ai]{padding:12px;border:1px solid #bdcdc5;border-radius:8px;color:#173d37;background:#f4f7f4;font:14px system-ui,sans-serif}[data-breditor-ai] h2{font-size:16px;margin:0 0 8px}[data-breditor-ai] h3{font-size:14px;margin:10px 0 4px}[data-breditor-ai] h4{font-size:12px;margin:6px 0 2px;text-transform:uppercase;letter-spacing:.04em}[data-breditor-ai] label{display:flex;flex-direction:column;gap:4px;margin:4px 0}[data-breditor-ai] textarea,[data-breditor-ai] select{font:inherit;padding:6px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-ai] [data-ai-before],[data-breditor-ai] [data-ai-after]{white-space:pre-wrap;overflow-wrap:anywhere;padding:6px 8px;border:1px solid #d3dfd9;border-radius:4px;background:white;max-height:16em;overflow:auto}[data-breditor-ai] del{background:#fbe0dd;color:#8a1f11}[data-breditor-ai] ins{background:#d9f2df;color:#14532d;text-decoration:underline}[data-breditor-ai] [data-ai-review]:focus{outline:2px solid #2f6f5e;outline-offset:2px}[data-breditor-ai] [hidden]{display:none}[data-breditor-ai] button{padding:6px 9px;margin:2px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-ai] button:disabled{opacity:.5}[data-breditor-ai] [data-ai-status]{font-size:12px;margin:8px 0 0}[data-breditor-ai] [data-ai-error]{color:#8a1f11}[data-breditor-ai] ul{margin:4px 0;padding-inline-start:18px;font-size:12px;color:#8a3b12}`;
