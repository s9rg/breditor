// Candidate rich V4 table captions: deterministic arrow-key boundaries around a caption.
// HTML requires <caption> as a table's first child, but the caption is laid out (and stored)
// after the rows. Native caret movement follows DOM order differently in each engine, so the
// four caption boundaries are owned here; every other arrow key keeps native behaviour.
import type {RichCommand} from "./core.js";
import {id,property,text,type ElementNode,type RichPresentationModel} from "./model.js";
import {tableCaptionOf} from "./table_caption.js";

type Key="ArrowUp"|"ArrowDown"|"ArrowLeft"|"ArrowRight";
const caret=(block:string,offset:number,affinity:"before"|"after"="after"):RichCommand=>{const point={block,offset:String(offset),affinity};return {kind:"setSelection",selection:{kind:"text",anchor:point,focus:{...point}}};};
const blocks=(root:Element):HTMLElement[]=>[...root.querySelectorAll<HTMLElement>("[data-rich-text]")];
/** Whether the native caret sits on the first or last rendered line of `block`. */
function onEdgeLine(block:HTMLElement,edge:"first"|"last",offset:number,length:number):boolean{
 if(length===0)return true;
 const native=block.ownerDocument.getSelection();if(!native||native.rangeCount!==1)return edge==="first"?offset===0:offset===length;
 const range=native.getRangeAt(0),rects=range.getClientRects(),rect=rects[rects.length-1]??range.getBoundingClientRect();
 if(!rect||rect.height===0)return edge==="first"?offset===0:offset===length;
 const outer=block.getBoundingClientRect();
 return edge==="first"?rect.top-outer.top<rect.height*0.75:outer.bottom-rect.bottom<rect.height*0.75;
}
/** The table element rendering `table` (block identity), if visible. */
function tableElement(surface:HTMLElement,table:ElementNode):HTMLTableElement|undefined{
 return [...surface.querySelectorAll<HTMLTableElement>("table[data-rich-table]")].find(element=>element.dataset["richBlock"]===id(table));
}
/** The last text block of the last row's cell `pick` (first or last visible cell). */
function lastRowBlock(element:HTMLTableElement,pick:"first"|"last"):HTMLElement|undefined{
 const row=element.tBodies[0]?.rows[element.tBodies[0].rows.length-1],cells=row?[...row.cells]:[];
 const cell=pick==="first"?cells[0]:cells[cells.length-1];
 return cell?blocks(cell).at(-1):undefined;
}
/**
 * Commands for one unmodified arrow key at a caption boundary, or `null` to keep native movement.
 * - In a caption: Up (first line) / Left (start) go to the last row; Down (last line) / Right (end)
 *   leave after the table through native flow navigation.
 * - In the last text block of a last-row cell: Down (last line) enters the caption start; Right at
 *   the end of the last cell enters it too.
 * - In a block directly after a captioned table: Up (first line) / Left (start) go to the caption end.
 */
export function captionArrowCommands(surface:HTMLElement,model:RichPresentationModel,key:Key):RichCommand[]|null{
 const s=model.view.selection;
 if(s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset)return null;
 const block=s.focus.block,offset=Number(s.focus.offset),node=model.nodes.get(block);if(!node)return null;
 const length=text(node).length,element=blocks(surface).find(candidate=>candidate.dataset["richText"]===block);if(!element)return null;
 const parent=model.parents.get(block);
 // 1. Inside a caption.
 if(parent?.type==="breditor/table"&&tableCaptionOf(parent)===node){
  const table=tableElement(surface,parent);if(!table)return null;
  if(key==="ArrowUp"&&onEdgeLine(element,"first",offset,length)||key==="ArrowLeft"&&offset===0){
   const target=lastRowBlock(table,key==="ArrowUp"?"first":"last"),targetId=target?.dataset["richText"],targetNode=targetId?model.nodes.get(targetId):undefined;
   return targetId&&targetNode?[caret(targetId,text(targetNode).length,"before")]:null;
  }
  if(key==="ArrowDown"&&onEdgeLine(element,"last",offset,length)||key==="ArrowRight"&&offset===length)
   return [caret(block,length,"before"),{kind:"navigateFlow",data:{movement:"after"}}];
  return null;
 }
 // 2. In the last row of a captioned table.
 const cell=element.closest<HTMLTableCellElement>("td,th"),table=cell?.closest<HTMLTableElement>("table[data-rich-table]");
 if(cell&&table&&table.caption&&surface.contains(table)){
  const body=table.tBodies[0],lastRow=body?.rows[body.rows.length-1];
  if(cell.parentElement!==lastRow||blocks(cell).at(-1)!==element)return null;
  const tableNode=model.nodes.get(table.dataset["richBlock"]??""),caption=tableNode?tableCaptionOf(tableNode):undefined;if(!caption)return null;
  if(key==="ArrowDown"&&onEdgeLine(element,"last",offset,length)||key==="ArrowRight"&&offset===length&&lastRow?.cells[lastRow.cells.length-1]===cell)return [caret(id(caption),0)];
  return null;
 }
 // 3. Directly after a captioned table.
 if(key==="ArrowUp"&&onEdgeLine(element,"first",offset,length)||key==="ArrowLeft"&&offset===0){
  const container=parent??model.root,index=container.children.findIndex(child=>child.kind==="element"&&property(child,"block-id")===block),previous=index>0?container.children[index-1]:undefined;
  const caption=previous?.kind==="element"&&previous.type==="breditor/table"?tableCaptionOf(previous):undefined;
  if(caption&&tableElement(surface,previous as ElementNode))return [caret(id(caption),text(caption).length,"before")];
 }
 return null;
}
