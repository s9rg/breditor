/**
 * Borrowed HTML source panel. Source is shown and edited only as plain textarea text; it is never parsed into the
 * live page. Apply requires a reviewed import report and one guarded whole-document paste through the host.
 */
import {createRichStyleElement} from "./style_element.js";
import type {RichInterchangeNotice} from "./clipboard_interchange.js";
import type {RichCommandOutcome} from "./core.js";
import {sourceBytes,staleSourceMessage} from "./source_view_host.js";
import {RICH_DOCUMENT_SOURCE_MAX_BYTES,type RichDocumentSourceHost,type RichDocumentSourcePreview,type RichDocumentSourceRead} from "./source_view_types.js";
export interface RichSourceViewOptions {label?:string;onError?:(error:unknown)=>void;onApply?:(outcome:RichCommandOutcome|"queued")=>void;onClose?:()=>void}
export interface RichSourceViewState {
 readonly disposed:boolean;readonly open:boolean;readonly readOnly:boolean;readonly stale:boolean;
 /** Revision captured when the view opened; the apply guard. */
 readonly revision:string|null;
 readonly bytes:number;readonly preview:RichDocumentSourcePreview|null;readonly error:string|null;
}
export interface RichSourceView {
 /** Export the current document into the textarea. Discards unapplied source edits. */
 open():void;
 /** Import the textarea through the bounded adapter and show its loss report. No mutation. */
 review():RichDocumentSourcePreview|null;
 /** Apply the reviewed source as one whole-document change. Refuses unreviewed, edited-since-review or stale source. */
 apply():RichCommandOutcome|"queued"|null;
 /** Discard source edits and close. */
 cancel():void;
 /** Replace the textarea text programmatically (as if typed); invalidates the review. */
 setSource(source:string):void;
 source():string;
 state():RichSourceViewState;
 dispose():void;
}
const lossText:Readonly<Record<string,string>>=Object.freeze({
 "removed-content":"Removed content (scripts, styles, forms, hidden or non-HTML elements)",
 "unsupported-attribute":"Removed attributes (event handlers, classes, ids or unsupported values)",
 "unsupported-element":"Unsupported elements unwrapped to their text",
 "unsupported-style":"Removed unsupported CSS",
 "style-approximation":"CSS approximated to the nearest supported value",
 "unsafe-link":"Unsafe links removed",
 "image-reference":"Images without a host asset reference kept as text",
 "image-alt":"Missing image descriptions replaced",
 "image-size":"Image sizes adjusted or dropped",
 "block-structure":"Block structure flattened",
 "table-geometry":"Table geometry normalized",
 "table-width":"Table widths dropped",
 "list-numbering":"List numbering normalized",
 "html-repaired":"Malformed HTML repaired",
 "markdown-feature":"Markdown feature converted",
});
const errorText:Readonly<Record<string,string>>=Object.freeze({
 "invalid-source":"the source is not valid text",
 "resource-limit":`the source exceeds the interchange limits (at most ${RICH_DOCUMENT_SOURCE_MAX_BYTES.toLocaleString("en-US")} UTF-8 bytes and bounded nesting, nodes and tables)`,
 "empty":"the source has no supported content",
 "unsupported-content":"the source contains content the editor cannot represent",
 "malformed-table":"a table is malformed",
 "asset-policy":"an image reference was refused by the host",
 "native-admission":"the editor's schema refused the imported content",
});
const hosts=new WeakSet<HTMLElement>();
class SourcePanel implements RichSourceView {
 readonly #root:HTMLElement;readonly #host:RichDocumentSourceHost;readonly #options:RichSourceViewOptions;readonly #abort:AbortController;readonly #unsubscribe:()=>void;
 readonly #element:HTMLElement;readonly #toggle:HTMLButtonElement;readonly #body:HTMLDivElement;readonly #text:HTMLTextAreaElement;readonly #size:HTMLParagraphElement;
 readonly #report:HTMLDivElement;readonly #review:HTMLButtonElement;readonly #apply:HTMLButtonElement;readonly #reload:HTMLButtonElement;readonly #cancel:HTMLButtonElement;readonly #status:HTMLParagraphElement;
 #read:RichDocumentSourceRead|undefined;#preview:RichDocumentSourcePreview|undefined;#error:string|null=null;#applying=false;#disposed=false;
 constructor(root:HTMLElement,host:RichDocumentSourceHost,options:RichSourceViewOptions){
  if(hosts.has(root)||root===host.surface||root.contains(host.surface)||host.surface.contains(root)||root.ownerDocument!==host.surface.ownerDocument)throw Error("The source view requires an unused separate host outside the editing surface");
  const state=host.sourceState();if(state.closed||!state.available)throw Error("Use an open document editor with an explicit clipboard interchange adapter");
  if(options.label!==undefined&&(typeof options.label!=="string"||!options.label||options.label.length>256))throw new TypeError("Expected a bounded source view label");
  this.#root=root;this.#host=host;this.#options={...options};
  const d=root.ownerDocument,realm=d.defaultView as unknown as {AbortController:typeof AbortController},signal=(this.#abort=new realm.AbortController()).signal,label=options.label??"HTML source";
  this.#element=d.createElement("section");this.#element.dataset["breditorSource"]="";this.#element.setAttribute("aria-label",label);
  const style=createRichStyleElement(d,styles);const title=d.createElement("h2");title.textContent=label;
  const scope=d.createElement("p");scope.dataset["sourceScope"]="";scope.textContent="Semantic HTML only. Scripts, event handlers, page metadata and unsupported markup are removed, and CSS is reduced to supported formatting. Review the report before applying.";
  const button=(name:string,text:string,run:()=>void,parent:HTMLElement)=>{const node=d.createElement("button");node.type="button";node.dataset["sourceAction"]=name;node.textContent=text;node.addEventListener("click",()=>this.#attempt(run),{signal});parent.append(node);return node;};
  this.#toggle=button("open","Edit HTML source",()=>this.open(),this.#element);
  this.#body=d.createElement("div");this.#body.hidden=true;
  this.#text=d.createElement("textarea");this.#text.dataset["sourceText"]="";this.#text.setAttribute("aria-label",label);this.#text.spellcheck=false;this.#text.wrap="off";this.#text.rows=14;
  this.#text.setAttribute("autocomplete","off");this.#text.setAttribute("autocapitalize","off");
  this.#text.addEventListener("input",()=>{this.#preview=undefined;this.#error=null;this.#render();},{signal});
  this.#size=d.createElement("p");this.#size.dataset["sourceSize"]="";
  this.#report=d.createElement("div");this.#report.dataset["sourceReport"]="";
  const actions=d.createElement("div");actions.dataset["sourceActions"]="";
  this.#review=button("review","Review changes",()=>{this.review();},actions);this.#apply=button("apply","Apply",()=>{this.apply();},actions);
  this.#reload=button("reload","Reload source",()=>this.open(),actions);this.#cancel=button("cancel","Cancel",()=>this.cancel(),actions);
  this.#status=d.createElement("p");this.#status.dataset["sourceStatus"]="";this.#status.setAttribute("role","status");
  this.#body.append(this.#text,this.#size,this.#report,actions);
  this.#element.append(style,title,scope,this.#body,this.#status);
  this.#unsubscribe=host.subscribeSource(()=>{if(!this.#disposed&&!this.#applying)this.#render();});
  hosts.add(root);root.replaceChildren(this.#element);this.#render();
 }
 #attempt(work:()=>void):void{try{work();}catch(error){this.#fail(error);}}
 #fail(error:unknown):void{if(this.#disposed)return;this.#error=error instanceof Error?error.message:String(error);this.#render();try{this.#options.onError?.(error);}catch{/* Reporting cannot change editor state. */}}
 #live():void{if(this.#disposed)throw Error("The source view is disposed");}
 #stale():boolean{const read=this.#read;if(!read)return false;const s=this.#host.sourceState();return s.closed||s.revision!==read.revision;}
 open():void{
  this.#live();this.#read=this.#preview=undefined;this.#error=null;
  const read=this.#host.readDocumentSource();this.#read=read;this.#text.value=read.html;this.#text.readOnly=read.readOnly;
  this.#render();this.#text.focus({preventScroll:true});
 }
 review():RichDocumentSourcePreview|null{
  this.#live();const read=this.#read;if(!read)throw Error("Open the source view first");
  this.#preview=undefined;this.#error=null;
  const preview=this.#host.previewDocumentSource(this.#text.value,read);if(preview.applicable)this.#preview=preview;
  else this.#error=`Nothing can be applied: ${errorText[preview.error??""]??preview.error??"the source was refused"}.`;
  this.#renderReport(preview);this.#render();return preview.applicable?preview:null;
 }
 apply():RichCommandOutcome|"queued"|null{
  this.#live();const read=this.#read,preview=this.#preview;if(!read)throw Error("Open the source view first");
  if(!preview)throw Error("Review the source before applying it");
  const s=this.#host.sourceState();if(s.revision!==read.revision)throw Error(staleSourceMessage(read.revision,s.revision));
  this.#applying=true;this.#preview=undefined;let outcome:RichCommandOutcome|"queued";
  try{outcome=this.#host.applyDocumentSource(preview);}
  catch(error){this.#report.replaceChildren();this.#render();throw error;}
  finally{this.#applying=false;}
  this.#close(outcome==="unchanged"?"No changes to apply.":`Applied as one change · revision ${this.#host.sourceState().revision}`);
  try{this.#options.onApply?.(outcome);}catch(error){this.#fail(error);}
  return outcome;
 }
 cancel():void{if(this.#disposed||!this.#read)return;this.#close("Source edits discarded.");this.#toggle.focus({preventScroll:true});}
 #close(message:string):void{this.#read=this.#preview=undefined;this.#error=null;this.#text.value="";this.#report.replaceChildren();this.#render();this.#status.textContent=message;try{this.#options.onClose?.();}catch(error){this.#fail(error);}}
 setSource(source:string):void{this.#live();if(!this.#read)throw Error("Open the source view first");if(this.#read.readOnly)throw Error("This document is read-only; its source can be viewed but not applied");if(typeof source!=="string")throw new TypeError("Expected source text");this.#text.value=source;this.#preview=undefined;this.#error=null;this.#render();}
 source():string{return this.#text.value;}
 #renderReport(preview:RichDocumentSourcePreview):void{
  const d=this.#root.ownerDocument,heading=d.createElement("h3"),list=d.createElement("ul");heading.textContent=preview.unchanged?"No source changes":"Import report";
  const item=(text:string,kind:string,code:string)=>{const li=d.createElement("li");li.dataset["sourceLoss"]=code;li.dataset["sourceEffect"]=kind;li.textContent=text;list.append(li);};
  const entry=(n:RichInterchangeNotice)=>`${lossText[n.code]??n.code}${n.count>1?` ×${n.count}`:""}`;
  for(const n of preview.losses)item(entry(n),n.effect,n.code);
  for(const n of preview.exportLosses)if(!preview.unchanged)item(`Not representable in source: ${entry(n)}`,"export",n.code);
  if(!list.childElementCount){const li=d.createElement("li");li.dataset["sourceLoss"]="none";li.textContent=preview.unchanged?"Applying makes no change.":"Nothing will be removed or approximated.";list.append(li);}
  this.#report.replaceChildren(heading,list);
 }
 #render():void{
  if(this.#disposed)return;const read=this.#read,s=this.#host.sourceState(),stale=this.#stale(),open=!!read,bytes=sourceBytes(this.#text.value);
  this.#body.hidden=!open;this.#toggle.hidden=open;this.#toggle.textContent=s.readOnly?"View HTML source":"Edit HTML source";this.#toggle.disabled=s.closed||s.busy||s.composing;
  const blocked=!read||read.readOnly||stale||s.busy||s.composing||s.readOnly;
  this.#review.hidden=this.#apply.hidden=!!read?.readOnly;this.#review.disabled=blocked;this.#apply.disabled=blocked||!this.#preview;this.#reload.hidden=!stale;this.#cancel.textContent=read?.readOnly?"Close":"Cancel";
  if(!this.#preview&&!this.#error&&this.#report.childElementCount)this.#report.replaceChildren();
  this.#size.textContent=`${bytes.toLocaleString("en-US")} of ${RICH_DOCUMENT_SOURCE_MAX_BYTES.toLocaleString("en-US")} bytes`;this.#size.toggleAttribute("data-over",bytes>RICH_DOCUMENT_SOURCE_MAX_BYTES);
  if(!read){if(s.closed)this.#status.textContent="Editor closed";return;}
  this.#status.textContent=s.closed?"Editor closed":stale?`${staleSourceMessage(read.revision,s.revision)}`:this.#error??(read.readOnly?`Read-only document · revision ${read.revision}. The source can be viewed but not applied.`:this.#preview?"Reviewed. Apply replaces the whole document as one change.":`Source of revision ${read.revision}. Review changes before applying.`);
 }
 state():RichSourceViewState{return Object.freeze({disposed:this.#disposed,open:!!this.#read,readOnly:this.#read?.readOnly??this.#host.sourceState().readOnly,stale:this.#stale(),revision:this.#read?.revision??null,bytes:sourceBytes(this.#text.value),preview:this.#preview??null,error:this.#error});}
 /** Releases only the borrowed UI; never the editor or its native owner. */
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#read=this.#preview=undefined;this.#abort.abort();this.#unsubscribe();this.#element.remove();hosts.delete(this.#root);}
}
export function mountRichSourceView(root:HTMLElement,host:RichDocumentSourceHost,options:RichSourceViewOptions={}):RichSourceView{return new SourcePanel(root,host,options);}
const styles=`[data-breditor-source]{padding:12px;border:1px solid #bdcdc5;border-radius:8px;color:#173d37;background:#f4f7f4;font:14px system-ui,sans-serif}[data-breditor-source] h2{font-size:16px;margin:0 0 6px}[data-breditor-source] h3{font-size:14px;margin:8px 0 4px}[data-breditor-source] p{font-size:12px;margin:6px 0}[data-breditor-source] textarea{box-sizing:border-box;width:100%;min-height:12em;font:13px ui-monospace,monospace;padding:8px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit;resize:vertical}[data-breditor-source] textarea[readonly]{background:#eef3ef}[data-breditor-source] [data-over]{color:#9b2c2c;font-weight:600}[data-breditor-source] ul{margin:4px 0;padding-inline-start:20px}[data-breditor-source] li[data-source-effect=loss],[data-breditor-source] li[data-source-effect=export]{color:#8a3b12}[data-breditor-source] button{padding:6px 8px;margin:2px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-source] button:disabled{opacity:.5}`;
