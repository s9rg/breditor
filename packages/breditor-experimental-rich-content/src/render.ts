// Render only the admitted Rust AST and its derived non-destructive table geometry.
import type {FormatLiteral,RichCell} from "./core.js";
import {cellKey,id,property,type AstNode,type ElementNode,type RichPresentationModel} from "./model.js";
import {requireRichInlinePresentation,richInlineRecipes,type RichInlinePresentation} from "./inline_presentation.js";
import {applyBlockLayout} from "./block_layout_presentation.js";
export const structuralBlockStylesV2=`[data-breditor-rich] [data-rich-text]{white-space:pre-wrap;min-height:1em}[data-breditor-rich] blockquote{border-left:3px solid #9dbbb0;margin:12px 0;padding:1px 16px}[data-breditor-rich] pre{font-family:ui-monospace,monospace;background:#f1f5f2;padding:12px;overflow:auto}[data-breditor-rich] [data-task-list]{list-style:none;padding-left:12px}[data-breditor-rich] [data-rich-task]{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;margin:8px 0}[data-breditor-rich] input[data-task-check]{width:18px;height:18px;margin:4px 0}[data-breditor-rich] [data-task-body]>:first-child{margin-top:0}[data-breditor-rich] hr{border:0;border-top:2px solid #9dbbb0;margin:16px 0}`;
export interface AssetBinding {image:string;asset:string;generation:string}
export interface RenderOptions {
 resolveAsset?:(binding:AssetBinding)=>string|undefined|Promise<string|undefined>;
 inlineTag?:(format:FormatLiteral)=>"span"|"strong"|"em"|"code";
 inlinePresentation?:RichInlinePresentation;
}
/** Validate opt-in presentation before publishing host DOM. Legacy callbacks stay separate. */
export function requireRenderOptions(value:RichPresentationModel,options:RenderOptions):void {
 if(options.inlinePresentation){if(options.inlineTag)throw new TypeError("Use either inlinePresentation or inlineTag, not both");requireRichInlinePresentation(options.inlinePresentation,value.schema);}
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
/** Apply native host policy to every browser editing island, not only the outer surface. */
export function applyEditingPolicy(surface:HTMLElement,readOnly:boolean):void {
 surface.contentEditable=readOnly?"false":"true";surface.setAttribute("aria-readonly",String(readOnly));
 if(readOnly)surface.tabIndex=0;else surface.removeAttribute("tabindex");
 for(const caption of surface.querySelectorAll<HTMLElement>("figcaption"))caption.contentEditable=readOnly?"false":"true";
 for(const check of surface.querySelectorAll<HTMLInputElement>("input[data-task-check]"))check.disabled=readOnly;
}
export function render(surface:HTMLElement,value:RichPresentationModel,options:RenderOptions):void {
 requireRenderOptions(value,options);
 const document=surface.ownerDocument;
 const flow=(node:AstNode):Node=>{
  if(node.kind==="text"){
   let result:Node=document.createTextNode(node.text);
   if(options.inlinePresentation){
    for(const {recipe,attributes} of [...richInlineRecipes(options.inlinePresentation,node.formats)].reverse()){
     const wrapper=document.createElement(recipe.element);wrapper.dataset["richFormat"]=recipe.formatKind;if(recipe.classes.length)wrapper.className=recipe.classes.join(" ");for(const attribute of attributes)wrapper.setAttribute(attribute.name,attribute.value);wrapper.append(result);result=wrapper;
    }
   }else for(const format of node.formats){const tag=options.inlineTag?.(format)??(format.type==="breditor/strong"?"strong":"span");if(!["span","strong","em","code"].includes(tag))throw new TypeError("Unsupported legacy inline tag");const wrapper=document.createElement(tag);wrapper.dataset["richFormat"]=format.type;wrapper.append(result);result=wrapper;}
   return result;
  }
  if(node.type==="breditor/table")return table(node);
  if(node.type==="breditor/image")return image(node);
  if(node.type==="breditor/horizontal-rule"){
   const rule=document.createElement("hr");rule.contentEditable="false";rule.dataset["richBlock"]=id(node);rule.dataset["selectNode"]=id(node);return rule;
  }
  if(node.type==="breditor/task-item"){
   const item=document.createElement("li");item.dataset["richBlock"]=id(node);item.dataset["richTask"]=id(node);
   const check=document.createElement("input");check.type="checkbox";check.contentEditable="false";check.checked=property(node,"checked")===true;check.dataset["taskCheck"]=id(node);check.setAttribute("aria-label","Task completed");item.append(check);
   const body=document.createElement("div");body.dataset["taskBody"]="";for(const child of node.children)body.append(flow(child));item.append(body);return item;
  }
  if(node.type==="breditor/code-block"){
   const pre=document.createElement("pre");pre.dataset["richBlock"]=id(node);pre.dataset["richText"]=id(node);applyBlockLayout(pre,node);const language=property(node,"language");if(typeof language==="string")pre.dataset["language"]=language;
   const code=document.createElement("code");for(const child of node.children)code.append(flow(child));if(node.children.length===0)code.append(document.createElement("br"));pre.append(code);return pre;
  }
  const tag=node.type==="breditor/paragraph"?"p":node.type==="breditor/heading"?`h${String(property(node,"level"))}`:node.type==="breditor/bullet-list"||node.type==="breditor/task-list"?"ul":node.type==="breditor/ordered-list"?"ol":node.type==="breditor/list-item"?"li":node.type==="breditor/blockquote"?"blockquote":"div";
  const element=document.createElement(tag);element.dataset["richBlock"]=id(node);
  if(node.type==="breditor/task-list"){element.dataset["taskList"]="";element.setAttribute("role","list");}
  if(node.type==="breditor/ordered-list")element.setAttribute("start",String(property(node,"start")));
  if(node.type==="breditor/paragraph"||node.type==="breditor/heading"){
   element.dataset["richText"]=id(node);
   applyBlockLayout(element,node);
   if(node.children.length===0)element.append(document.createElement("br"));
  }
  for(const child of node.children)element.append(flow(child));
  return element;
 };
 const image=(node:ElementNode):HTMLElement=>{
  const figure=document.createElement("figure");figure.contentEditable="false";figure.dataset["richBlock"]=id(node);figure.dataset["richImage"]=String(property(node,"image-id"));
  const bitmap=document.createElement("img");bitmap.alt=String(property(node,"alt-text"));bitmap.draggable=false;
  const width=property(node,"width"),height=property(node,"height");if(typeof width==="number"&&typeof height==="number"){bitmap.width=width;bitmap.height=height;}
  const binding={image:String(property(node,"image-id")),asset:String(property(node,"asset-id")),generation:String(property(node,"asset-generation"))};
  assetBindings.set(figure,{bitmap,binding,attempt:0});resolveImage(figure,options);
  figure.append(bitmap);
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
  const cols=document.createElement("colgroup");for(const column of geometry.columns){const col=document.createElement("col");col.style.width=`${column.width}px`;cols.append(col);}element.append(cols);
  const body=document.createElement("tbody");
  for(const row of geometry.rows){const tr=document.createElement("tr");
   for(const column of geometry.columns){const cell=geometry.cells.find(cell=>cell.base.row===row&&cell.base.column===column.id);if(!cell||cellKey(cell.base)!==cellKey(cell.master))continue;
    const base=bodies.get(cellKey(cell.base)),td=document.createElement(property(base??node,"header")===true?"th":"td");td.rowSpan=cell.rowSpan;td.colSpan=cell.columnSpan;td.dataset["richCell"]=cellKey(cell.base);
    const pick=document.createElement("button");pick.type="button";pick.contentEditable="false";pick.dataset["selectCell"]=JSON.stringify(cell.base);pick.textContent="Select cell";td.append(pick);
    for(const source of cell.sources){const original=bodies.get(cellKey(source));if(!original)continue;const partition=document.createElement("div");partition.dataset["sourceCell"]=JSON.stringify(source);for(const child of original.children)partition.append(flow(child));td.append(partition);}
    tr.append(td);
   }body.append(tr);
  }element.append(body);return element;
 };
 surface.replaceChildren(...value.root.children.map(flow));
 applyEditingPolicy(surface,value.view.readOnly===true);
 paintSelection(surface,value);
}
export function paintSelection(surface:HTMLElement,value:RichPresentationModel):void {
 surface.toggleAttribute("data-document-selected",value.view.selection?.kind==="document");
 const masters=new Set(value.view.grid?.masters.map(cellKey)??[]);
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-cell]"))element.toggleAttribute("data-selected",masters.has(element.dataset["richCell"]??""));
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]"))element.toggleAttribute("data-node-selected",value.view.selection?.kind==="node"&&value.view.selection.block===element.dataset["richBlock"]);
}
