// Render only the admitted Rust AST and its derived non-destructive table geometry.
import type {FormatLiteral,RichCell,RichView} from "./core.js";
import {cellKey,id,property,sourceCell,type AstNode,type ElementNode,type RichPresentationModel,type TextNode} from "./model.js";
import {requireRichInlinePresentation,richInlineRecipes,richInlinePresentationHasRuby,type RichInlinePresentation} from "./inline_presentation.js";
import {createRubyElement,groupRubyRuns} from "./ruby.js";
import {applyBlockLayout} from "./block_layout_presentation.js";
import {applyListNumbering} from "./list_numbering_presentation.js";
import {legalListAttribute,legalListMarkerAttribute,legalListMarkers} from "./list_structure.js";
import {wrapImageLink} from "./image_link.js";
import {createMentionChip,groupMentionRuns} from "./mention.js";
import {createPageBreakElement,richPageBreakKind} from "./page_break.js";
import {bookmarkAttributes,bookmarkNames,bookmarkOf,internalLinkAttributes,internalLinkOf} from "./bookmark.js";
import {resolveRichUi,type RichUiLocale,type RichUiOptions} from "./ui_locale.js";
export const structuralBlockStylesV2=`[data-breditor-rich] [data-rich-text]{white-space:pre-wrap;min-height:1em}[data-breditor-rich] blockquote{border-left:3px solid #9dbbb0;margin:12px 0;padding:1px 16px}[data-breditor-rich] pre{font-family:ui-monospace,monospace;background:#f1f5f2;padding:12px;overflow:auto}[data-breditor-rich] [data-task-list]{list-style:none;padding-left:12px}[data-breditor-rich] [data-rich-task]{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;margin:8px 0}[data-breditor-rich] input[data-task-check]{width:18px;height:18px;margin:4px 0}[data-breditor-rich] [data-task-body]>:first-child{margin-top:0}[data-breditor-rich] hr{border:0;border-top:2px solid #9dbbb0;margin:16px 0}[data-breditor-rich] details[data-rich-details]{border:1px solid #c9d8d2;border-radius:6px;margin:12px 0;padding:4px 12px}[data-breditor-rich] summary[data-rich-text]{font-weight:600;cursor:text;padding:4px 0}[data-breditor-rich] details[data-rich-details][open]>summary[data-rich-text]{border-bottom:1px solid #e3ece8;margin-bottom:4px}`;
export const richTableScrollStyles=`[data-rich-table-scroll]{max-inline-size:100%;contain:inline-size;overflow-x:auto}[data-rich-table-scroll-controls]{display:flex;justify-content:end;gap:4px}[data-rich-table-scroll-controls][hidden]{display:none}[data-rich-table-scroll-controls] button[aria-disabled=true]{opacity:.48;cursor:default}[data-rich-table-scroll-controls] button:focus-visible{outline:2px solid Highlight;outline-offset:2px}@media (pointer:coarse){[data-rich-table-scroll-controls] button{min-inline-size:44px;min-block-size:44px}}@media print{[data-rich-table-scroll]{contain:none;overflow:visible}[data-rich-table-scroll-controls]{display:none}}`;
export interface AssetBinding {image:string;asset:string;generation:string}
export interface RenderOptions {
 resolveAsset?:(binding:AssetBinding)=>string|undefined|Promise<string|undefined>;
 inlineTag?:(format:FormatLiteral)=>"span"|"strong"|"em"|"code";
 inlinePresentation?:RichInlinePresentation;
 /** Chrome catalog; only the V4 page-break marker label (`pageBreakLabel`) reads it. */
 ui?:RichUiOptions;
 /** Rich V4 bookmarks and internal links: bookmarked blocks get `id="bm-<name>"` and
  * `data-rich-bookmark`, internal links `href="#bm-<name>"` (or `data-rich-link-broken` when no block
  * carries the name). The controller sets it for a V4 owner; omitted keeps V1–V3 output exact. */
 bookmarks?:boolean;
 /** Opt-in legal multi-level numbering (`1.`, `1.2.`, `1.2.3.`) for nested ordered lists, derived
  * at render time from admitted structure and starts (see `legalListMarkers`); presentation only,
  * never stored. Omitted keeps the existing output exact. */
 legalListNumbering?:boolean;
 /** Opt-in horizontal table viewports for narrow editor layouts. */
 scrollableTables?:boolean;
}
const resolvedUi=new WeakMap<object,RichUiLocale>();
/** Resolve (and cache per options object) the catalog that labels rendered chrome. */
function renderUi(options:RenderOptions):RichUiLocale{
 const ui=options.ui;if(ui===undefined)return resolveRichUi();
 let locale=resolvedUi.get(ui);if(!locale){locale=resolveRichUi(ui);resolvedUi.set(ui,locale);}
 return locale;
}
function pageBreakLabel(options:RenderOptions):string{return renderUi(options).text("pageBreakLabel");}
/** Validate opt-in presentation before publishing host DOM. Legacy callbacks stay separate. */
export function requireRenderOptions(value:RichPresentationModel,options:RenderOptions):void {
 if(options.legalListNumbering!==undefined&&typeof options.legalListNumbering!=="boolean")throw new TypeError("legalListNumbering must be a boolean");
 if(options.scrollableTables!==undefined&&typeof options.scrollableTables!=="boolean")throw new TypeError("scrollableTables must be a boolean");
 if(options.inlinePresentation){if(options.inlineTag)throw new TypeError("Use either inlinePresentation or inlineTag, not both");requireRichInlinePresentation(options.inlinePresentation,value.schema);}
}
/** A lone LF at the very end of a `pre-wrap` text block creates no line box after it, so Chromium
 * and WebKit canonicalize a caret after it to the position before it (their `beforeinput` target
 * ranges point before the LF, so typed text landed before the break) and no engine shows the new
 * empty line. The live renderer appends this presentation-only `<br>` to such a block: it has no
 * text, so Range.toString, textContent and the text-node walkers in selection.ts ignore it, and
 * model offsets, search, composition reconcile and clipboard are unchanged. Static output omits it. */
export const trailingBreakAttribute="data-rich-trailing-break";
export function endsWithLineBreak(children:readonly AstNode[]):boolean {
 const last=children[children.length-1];return last?.kind==="text"&&last.text.endsWith("\n");
}
function appendTrailingBreak(target:HTMLElement,node:ElementNode):void {
 if(!endsWithLineBreak(node.children))return;
 const anchor=target.ownerDocument.createElement("br");anchor.setAttribute(trailingBreakAttribute,"");target.append(anchor);
}
const assetBindings=new WeakMap<HTMLElement,{bitmap:HTMLImageElement;binding:AssetBinding;attempt:number}>();
function resolveImage(figure:HTMLElement,options:RenderOptions):void {
 const record=assetBindings.get(figure);if(!record)return;
 const attempt=++record.attempt,{bitmap,binding}=record;
 const live=()=>assetBindings.get(figure)===record&&record.attempt===attempt&&figure.isConnected;
 const apply=(url:string|undefined):void=>{if(!live())return;if(url){bitmap.src=url;figure.dataset["assetState"]="ready";}else if(!bitmap.hasAttribute("src"))figure.dataset["assetState"]="unresolved";};
 try{
  const resolved=options.resolveAsset?.({...binding});
  if(typeof resolved==="string"){bitmap.src=resolved;figure.dataset["assetState"]="ready";}
  else if(resolved)void Promise.resolve(resolved).then(apply).catch(()=>{if(live()&&!bitmap.hasAttribute("src"))figure.dataset["assetState"]="error";});
  else if(!bitmap.hasAttribute("src"))figure.dataset["assetState"]="unresolved";
 }catch{if(!bitmap.hasAttribute("src"))figure.dataset["assetState"]="error";}
}
/** Retry only current immutable image bindings. Text, selection, composition and Rust history are
 * untouched. Per-element attempts fence a delayed resolver after replacement/removal/refresh. */
export function refreshAssets(surface:HTMLElement,options:RenderOptions):void {
 for(const figure of surface.querySelectorAll<HTMLElement>("figure[data-rich-image]"))resolveImage(figure,options);
}
/** Apply native host policy to every browser editing island, not only the outer surface.
 * V4 image links are inert while editing (like inline links inside the editable
 * surface): they leave the tab order and the controller cancels their activation, so a click
 * selects the image node. A read-only surface lets them behave as ordinary links. */
/** Presentation-only marking of editable regions; never a document property or an enforcement mechanism. */
export function applyRestrictedPresentation(surface:HTMLElement,value:RichPresentationModel):void {
 const restricted=value.view.restricted;
 surface.toggleAttribute("data-rich-restricted",!!restricted);
 const editable=new Set(restricted?.editable??[]),cells=new Set<string>();
 // Table cells and rows render without a block id: mark their base cells instead.
 for(const block of editable){
  const node=value.nodes.get(block),parts=node?.type==="breditor/table-row"?node.children.filter(child=>child.kind==="element").map(child=>id(child as ElementNode)):node?.type==="breditor/table-cell"?[block]:[];
  for(const part of parts){const cell=sourceCell(value,part);if(cell)cells.add(cellKey(cell));}
 }
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]"))element.toggleAttribute("data-rich-editable-region",editable.has(element.dataset["richBlock"]??""));
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-cell]"))element.toggleAttribute("data-rich-editable-region",cells.has(element.dataset["richCell"]??""));
}
/** Default marking for `data-rich-editable-region` under `data-rich-restricted`; hosts may restyle. */
export const richRestrictedEditingStyles="[data-rich-restricted] [data-rich-editable-region]{outline:1px dashed color-mix(in srgb,Highlight 70%,transparent);outline-offset:2px;background:color-mix(in srgb,Highlight 8%,transparent)}";
export function applyEditingPolicy(surface:HTMLElement,readOnly:boolean):void {
 surface.contentEditable=readOnly?"false":"true";surface.setAttribute("aria-readonly",String(readOnly));
 for(const link of surface.querySelectorAll<HTMLElement>("a[data-rich-image-link]")){if(readOnly)link.removeAttribute("tabindex");else link.tabIndex=-1;}
 if(readOnly)surface.tabIndex=0;else surface.removeAttribute("tabindex");
 for(const caption of surface.querySelectorAll<HTMLElement>("figcaption"))caption.contentEditable=readOnly?"false":"true";
 for(const check of surface.querySelectorAll<HTMLInputElement>("input[data-task-check]"))check.disabled=readOnly;
}
const tableScrollCleanup=new WeakMap<HTMLElement,()=>void>();
export function releaseRichTableScroll(surface:HTMLElement):void{
 tableScrollCleanup.get(surface)?.();
 tableScrollCleanup.delete(surface);
}
function refreshTableScroll(viewport:HTMLElement,controls:HTMLElement):void {
 const distance=viewport.scrollWidth-viewport.clientWidth;
 controls.hidden=distance<=0;
 if(controls.hidden)return;
 const rtl=viewport.ownerDocument.defaultView?.getComputedStyle(viewport).direction==="rtl";
 const left=rtl?-distance:0,right=rtl?0:distance;
 for(const button of controls.querySelectorAll<HTMLButtonElement>("[data-scroll-table]")){
  const edge=button.dataset["scrollTable"]==="left"?left:right;
  button.setAttribute("aria-disabled",String(Math.abs(viewport.scrollLeft-edge)<1));
 }
}
export function render(surface:HTMLElement,value:RichPresentationModel,options:RenderOptions):void {
 requireRenderOptions(value,options);
 const document=surface.ownerDocument;
 const tableScroll=new Map<string,{offset:number;focus:string|undefined}>();
 const tableViewports:{viewport:HTMLElement;table:HTMLTableElement;controls:HTMLElement}[]=[];
 releaseRichTableScroll(surface);
 if(options.scrollableTables){
  for(const viewport of surface.querySelectorAll<HTMLElement>("[data-rich-table-scroll]")){
   const focus=viewport.parentElement?.querySelector<HTMLElement>("[data-scroll-table]:focus");
   tableScroll.set(viewport.dataset["richTableScroll"]!,{offset:viewport.scrollLeft,focus:focus?.dataset["scrollTable"]});
  }
 }
 let tableNumber=0;
 const bookmarks=options.bookmarks===true?new Set(bookmarkNames(value.root)):undefined;
 const legal=options.legalListNumbering===true?legalListMarkers(value.root):undefined;
 const anchor=(element:HTMLElement,node:ElementNode):void=>{const name=bookmarks?bookmarkOf(node):undefined;if(name!==undefined)for(const attribute of bookmarkAttributes(name))element.setAttribute(attribute.name,attribute.value);};
 // V4 mentions render as inert chips grouping their styled pieces (text blocks and summaries).
 const mentions=(runs:readonly TextNode[]):Node[]=>groupMentionRuns(runs,(run,text,formats)=>({...run,text,formats})).map(item=>item.kind==="run"?flow(item.run):createMentionChip(document,item.mention,item.pieces.map(flow)));
 // Opt-in ruby extension: each group of equal annotations is one `<ruby>` around its base pieces.
 const ruby=options.inlinePresentation!==undefined&&richInlinePresentationHasRuby(options.inlinePresentation);
 const appendInline=(target:HTMLElement,node:ElementNode):void=>{
  const runs=node.children.filter((child):child is TextNode=>child.kind==="text");
  if(!ruby){target.append(...mentions(runs));return;}
  for(const segment of groupRubyRuns(runs,(run,formats)=>({...run,formats})))target.append(...(segment.kind==="plain"?mentions(segment.runs):[createRubyElement(document,segment.annotation,mentions(segment.runs))]));
 };
 const flow=(node:AstNode):Node=>{
  if(node.kind==="text"){
   let result:Node=document.createTextNode(node.text);
   if(options.inlinePresentation){
    for(const {recipe,attributes} of [...richInlineRecipes(options.inlinePresentation,node.formats)].reverse()){
     const wrapper=document.createElement(recipe.element);wrapper.dataset["richFormat"]=recipe.formatKind;if(recipe.classes.length)wrapper.className=recipe.classes.join(" ");for(const attribute of attributes)wrapper.setAttribute(attribute.name,attribute.value);
     // V4 internal link: the external policy emits no href for `#name`; the bookmark grammar does.
     const internal=bookmarks&&recipe.formatKind==="breditor-inline/link"?node.formats.map(internalLinkOf).find(name=>name!==undefined):undefined;
     if(internal!==undefined)for(const attribute of internalLinkAttributes(internal,bookmarks!.has(internal)))wrapper.setAttribute(attribute.name,attribute.value);
     wrapper.append(result);result=wrapper;
    }
   }else for(const format of node.formats){const tag=options.inlineTag?.(format)??(format.type==="breditor/strong"?"strong":"span");if(!["span","strong","em","code"].includes(tag))throw new TypeError("Unsupported legacy inline tag");const wrapper=document.createElement(tag);wrapper.dataset["richFormat"]=format.type;wrapper.append(result);result=wrapper;}
   return result;
  }
  if(node.type==="breditor/table")return table(node);
  if(node.type==="breditor/image")return image(node);
  // V4 page break: a non-editable, node-selectable marker that forces a page break when printed.
  if(node.type===richPageBreakKind)return createPageBreakElement(document,node,pageBreakLabel(options));
  if(node.type==="breditor/horizontal-rule"){
   const rule=document.createElement("hr");rule.contentEditable="false";rule.dataset["richBlock"]=id(node);rule.dataset["selectNode"]=id(node);return rule;
  }
  if(node.type==="breditor/task-item"){
   const item=document.createElement("li");item.dataset["richBlock"]=id(node);item.dataset["richTask"]=id(node);
   const check=document.createElement("input");check.type="checkbox";check.contentEditable="false";check.checked=property(node,"checked")===true;check.dataset["taskCheck"]=id(node);check.setAttribute("aria-label","Task completed");item.append(check);
   const body=document.createElement("div");body.dataset["taskBody"]="";for(const child of node.children)body.append(flow(child));item.append(body);return item;
  }
  if(node.type==="breditor/details"){
   // V4 section: native disclosure semantics; `open` mirrors persisted document state.
   // While editing, the controller cancels native summary toggling (see applyEditingPolicy).
   const details=document.createElement("details");details.dataset["richBlock"]=id(node);details.dataset["richDetails"]=id(node);details.open=property(node,"details-open")===true;
   for(const child of node.children)details.append(flow(child));return details;
  }
  if(node.type==="breditor/details-summary"){
   const summary=document.createElement("summary");summary.dataset["richBlock"]=id(node);summary.dataset["richText"]=id(node);
   if(node.children.length===0)summary.append(document.createElement("br"));
   appendInline(summary,node);appendTrailingBreak(summary,node);return summary;
  }
  if(node.type==="breditor/code-block"){
   const pre=document.createElement("pre");pre.dataset["richBlock"]=id(node);pre.dataset["richText"]=id(node);applyBlockLayout(pre,node);anchor(pre,node);const language=property(node,"language");if(typeof language==="string")pre.dataset["language"]=language;
   const code=document.createElement("code");for(const child of node.children)code.append(flow(child));if(node.children.length===0)code.append(document.createElement("br"));appendTrailingBreak(code,node);pre.append(code);return pre;
  }
  const tag=node.type==="breditor/paragraph"?"p":node.type==="breditor/heading"?`h${String(property(node,"level"))}`:node.type==="breditor/bullet-list"||node.type==="breditor/task-list"?"ul":node.type==="breditor/ordered-list"?"ol":node.type==="breditor/list-item"?"li":node.type==="breditor/blockquote"?"blockquote":"div";
  const element=document.createElement(tag);element.dataset["richBlock"]=id(node);
  if(node.type==="breditor/task-list"){element.dataset["taskList"]="";element.setAttribute("role","list");}
  if(node.type==="breditor/ordered-list")applyListNumbering(element,node);
 if(legal&&node.type==="breditor/ordered-list"){element.setAttribute(legalListAttribute,"");element.setAttribute("role","list");}
 const marker=legal&&node.type==="breditor/list-item"?legal.get(node):undefined;if(marker!==undefined)element.setAttribute(legalListMarkerAttribute,marker);
  if(node.type==="breditor/paragraph"||node.type==="breditor/heading"){
   element.dataset["richText"]=id(node);
   applyBlockLayout(element,node);anchor(element,node);
   if(node.children.length===0)element.append(document.createElement("br"));
  }
  // V4 mentions render as inert chips grouping their styled pieces.
  if(node.type==="breditor/paragraph"||node.type==="breditor/heading"){appendInline(element,node);appendTrailingBreak(element,node);}
  else for(const child of node.children)element.append(flow(child));
  return element;
 };
 const image=(node:ElementNode):HTMLElement=>{
  const figure=document.createElement("figure");figure.contentEditable="false";figure.dataset["richBlock"]=id(node);figure.dataset["richImage"]=String(property(node,"image-id"));
  const bitmap=document.createElement("img");bitmap.alt=String(property(node,"alt-text"));bitmap.draggable=false;
  const width=property(node,"width"),height=property(node,"height");if(typeof width==="number"&&typeof height==="number"){bitmap.width=width;bitmap.height=height;}
  const binding={image:String(property(node,"image-id")),asset:String(property(node,"asset-id")),generation:String(property(node,"asset-generation"))};
  assetBindings.set(figure,{bitmap,binding,attempt:0});resolveImage(figure,options);
  figure.append(wrapImageLink(bitmap,node));
  const pick=document.createElement("button");pick.type="button";pick.dataset["selectNode"]=id(node);pick.textContent="Select image";figure.append(pick);
  if(node.children.length){const caption=document.createElement("figcaption");caption.contentEditable="true";for(const child of node.children)caption.append(flow(child));figure.append(caption);}
  return figure;
 };
 const table=(node:ElementNode):HTMLElement=>{
  const element=document.createElement("table"),tableId=String(property(node,"table-id"));element.dataset["richBlock"]=id(node);element.dataset["richTable"]=tableId;
  const geometry=value.view.tables.find(table=>table.id===tableId);
  if(!geometry||geometry.hidden){const placeholder=document.createElement("div");placeholder.contentEditable="false";placeholder.dataset["selectNode"]=id(node);placeholder.textContent="Hidden table — select to restore axes or remove";return placeholder;}
  const bodies=new Map<string,ElementNode>();
  for(const row of node.children)if(row.kind==="element")for(const cell of row.children)if(cell.kind==="element")bodies.set(cellKey({table:tableId,row:String(property(row,"row-id")),column:String(property(cell,"column-id"))}),cell);
  // V4 caption: the table's trailing paragraph. HTML requires <caption> as the table's
  // first child; `caption-side:bottom` shows it after the rows, matching document/reading order.
  const captionNode=node.children[node.children.length-1];
  if(captionNode?.kind==="element"&&captionNode.type==="breditor/paragraph"){const caption=document.createElement("caption");caption.dataset["richTableCaption"]=tableId;caption.style.captionSide="bottom";caption.append(flow(captionNode));element.append(caption);}
  const cols=document.createElement("colgroup");for(const column of geometry.columns){const col=document.createElement("col");col.style.width=`${column.width}px`;cols.append(col);}element.append(cols);
  const body=document.createElement("tbody");
  for(const row of geometry.rows){const tr=document.createElement("tr");
   for(const column of geometry.columns){const cell=geometry.cells.find(cell=>cell.base.row===row&&cell.base.column===column.id);if(!cell||cellKey(cell.base)!==cellKey(cell.master))continue;
    const base=bodies.get(cellKey(cell.base)),td=document.createElement(property(base??node,"header")===true?"th":"td");td.rowSpan=cell.rowSpan;td.colSpan=cell.columnSpan;td.dataset["richCell"]=cellKey(cell.base);
    const pick=document.createElement("button");pick.type="button";pick.contentEditable="false";pick.dataset["selectCell"]=JSON.stringify(cell.base);pick.textContent="Select cell";td.append(pick);
    for(const source of cell.sources){const original=bodies.get(cellKey(source));if(!original)continue;const partition=document.createElement("div");partition.dataset["sourceCell"]=JSON.stringify(source);for(const child of original.children)partition.append(flow(child));td.append(partition);}
    tr.append(td);
   }body.append(tr);
  }element.append(body);
  if(!options.scrollableTables)return element;
  const frame=document.createElement("div"),controls=document.createElement("div"),viewport=document.createElement("div");
  controls.dataset["richTableScrollControls"]="";
  controls.contentEditable="false";
  viewport.dataset["richTableScroll"]=tableId;
  viewport.setAttribute("role","region");
  const ui=renderUi(options),number=++tableNumber;
  viewport.setAttribute("aria-label",ui.text("tableScrollRegion",{number}));
  element.style.minInlineSize=`${geometry.columns.reduce((width,column)=>width+column.width,0)}px`;
  for(const [direction,icon,delta] of [["left","←",-72],["right","→",72]] as const){
   const button=document.createElement("button");
   button.type="button";button.dataset["scrollTable"]=direction;button.textContent=icon;
   button.setAttribute("aria-label",ui.text(direction==="left"?"tableScrollLeft":"tableScrollRight",{number}));
   button.addEventListener("click",()=>{
    if(button.getAttribute("aria-disabled")!=="true")viewport.scrollBy({left:delta,behavior:"instant"});
   });
   button.addEventListener("keydown",event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||(event.key!=="ArrowLeft"&&event.key!=="ArrowRight"))return;
    event.preventDefault();event.stopPropagation();viewport.scrollBy({left:event.key==="ArrowLeft"?-72:72,behavior:"instant"});
   });
   controls.append(button);
  }
  viewport.append(element);
  viewport.addEventListener("scroll",()=>refreshTableScroll(viewport,controls));
  frame.append(controls,viewport);tableViewports.push({viewport,table:element,controls});
  return frame;
 };
 surface.replaceChildren(...value.root.children.map(flow));
 applyEditingPolicy(surface,value.view.readOnly===true);
 applyRestrictedPresentation(surface,value);
 paintSelection(surface,value);
 if(tableViewports.length){
  const refresh=()=>{for(const {viewport,controls} of tableViewports)refreshTableScroll(viewport,controls);};
  for(const {viewport,controls} of tableViewports){
   const previous=tableScroll.get(viewport.dataset["richTableScroll"]!);
   if(previous){
    viewport.scrollLeft=previous.offset;
    if(previous.focus){
     const button=[...controls.querySelectorAll("button")].find(item=>item.dataset["scrollTable"]===previous.focus);
     button?.focus({preventScroll:true});
    }
   }
  }
  refresh();
  const Resize=document.defaultView?.ResizeObserver,Mutation=document.defaultView?.MutationObserver;
  const resize=Resize?new Resize(refresh):null;
  for(const {viewport,table} of tableViewports){resize?.observe(viewport);resize?.observe(table);}
  // Direction can change when a host switches its document language, without resizing the table.
  const direction=Mutation?new Mutation(refresh):null;
  if(direction){
   for(let target:HTMLElement|null=surface;target;target=target.parentElement)direction.observe(target,{attributes:true,attributeFilter:["dir"]});
  }
  tableScrollCleanup.set(surface,()=>{resize?.disconnect();direction?.disconnect();});
 }
}
export function paintSelection(surface:HTMLElement,value:RichPresentationModel):void {
 surface.toggleAttribute("data-document-selected",value.view.selection?.kind==="document");
 const masters=new Set(value.view.grid?.masters.map(cellKey)??[]);
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-cell]"))element.toggleAttribute("data-selected",masters.has(element.dataset["richCell"]??""));
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]"))element.toggleAttribute("data-node-selected",value.view.selection?.kind==="node"&&value.view.selection.block===element.dataset["richBlock"]);
}
