// Render only the admitted Rust AST and its derived non-destructive table geometry.
import type {FormatLiteral,RichCell} from "./core.js";
import {cellKey,id,property,type AstNode,type ElementNode,type RichModel} from "./model.js";
export interface AssetBinding {image:string;asset:string;generation:string}
export interface RenderOptions {
 resolveAsset?:(binding:AssetBinding)=>string|undefined|Promise<string|undefined>;
 inlineTag?:(format:FormatLiteral)=>"span"|"strong"|"em"|"code";
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
export function render(surface:HTMLElement,value:RichModel,options:RenderOptions):void {
 const document=surface.ownerDocument;
 const flow=(node:AstNode):Node=>{
  if(node.kind==="text"){
   let result:Node=document.createTextNode(node.text);
   for(const format of node.formats){const wrapper=document.createElement(options.inlineTag?.(format)??(format.type==="breditor/strong"?"strong":"span"));wrapper.dataset["richFormat"]=format.type;wrapper.append(result);result=wrapper;}
   return result;
  }
  if(node.type==="breditor/table")return table(node);
  if(node.type==="breditor/image")return image(node);
  const tag=node.type==="breditor/paragraph"?"p":node.type==="breditor/heading"?`h${String(property(node,"level"))}`:node.type==="breditor/bullet-list"?"ul":node.type==="breditor/ordered-list"?"ol":node.type==="breditor/list-item"?"li":"div";
  const element=document.createElement(tag);element.dataset["richBlock"]=id(node);
  if(node.type==="breditor/ordered-list")element.setAttribute("start",String(property(node,"start")));
  if(node.type==="breditor/paragraph"||node.type==="breditor/heading"){
   element.dataset["richText"]=id(node);
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
 paintSelection(surface,value);
}
export function paintSelection(surface:HTMLElement,value:RichModel):void {
 const masters=new Set(value.view.grid?.masters.map(cellKey)??[]);
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-cell]"))element.toggleAttribute("data-selected",masters.has(element.dataset["richCell"]??""));
 for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]"))element.toggleAttribute("data-node-selected",value.view.selection?.kind==="node"&&value.view.selection.block===element.dataset["richBlock"]);
}
