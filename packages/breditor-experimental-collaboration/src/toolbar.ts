import {id,isText,property,sourceCell,selectedImage,selectedTable,type ElementNode} from "@breditor/experimental-rich-content/rendering";
import {bold,caret,cellBlock,imageNode,listContext,ordered,paragraph,positionAfter,publish,removeSelection,type ActionContext,type SharedToolbarControl} from "./actions.js";
import type {SharedCommand,SharedNode,RichCell} from "./types.js";
const table=(ctx:ActionContext)=>selectedTable(ctx.model),image=(ctx:ActionContext)=>selectedImage(ctx.model);
function focusCell(ctx:ActionContext):RichCell|undefined{const s=ctx.model.view.selection;return s?.kind==="grid"?s.focus:s?.kind==="text"?sourceCell(ctx.model,s.focus.block):undefined;}
function row(ctx:ActionContext):ElementNode|undefined{const t=table(ctx),cell=focusCell(ctx);return t?.children.find((n):n is ElementNode=>n.kind==="element"&&property(n,"row-id")===(cell?.row??(t.children.at(-1)?.kind==="element"?property(t.children.at(-1) as ElementNode,"row-id"):undefined)));}
function column(ctx:ActionContext):string|undefined{const t=table(ctx),columns=t?ctx.model.view.tables.find(v=>v.id===property(t,"table-id"))?.columns:undefined;return focusCell(ctx)?.column??columns?.at(-1)?.id;}
const textEnabled=(ctx:ActionContext)=>ctx.model.view.selection?.kind==="text";
function setList(ctx:ActionContext,orderedList:boolean):void{
 const list=listContext(ctx.model),style=orderedList?{kind:"ordered" as const,start:1}:{kind:"bullet" as const};if(list){publish(ctx,[{kind:"set_list_kind",data:{container:id(list.list),style}}]);return;}
 const s=ctx.model.view.selection;if(s?.kind!=="text")return;const[start,end]=ordered(ctx.model,s),parent=ctx.model.parents.get(start.block);if(!parent||ctx.model.parents.get(end.block)!==parent)throw Error("List wrapping requires sibling flow blocks");
 const a=parent.children.findIndex(n=>n.kind==="element"&&id(n)===start.block),b=parent.children.findIndex(n=>n.kind==="element"&&id(n)===end.block),items=parent.children.slice(a,b+1).filter((n):n is ElementNode=>n.kind==="element"&&isText(n)).map(()=>ctx.allocate("item"));
 publish(ctx,[{kind:"wrap_list",data:{first:start.block,last:end.block,container:ctx.allocate("list"),items,style}}]);
}
function newTable(ctx:ActionContext):SharedNode{
 const columns=[{id:ctx.allocate("column"),width:160},{id:ctx.allocate("column"),width:160}];
 return {kind:"element",type:"breditor/table",entityId:null,properties:{"breditor/block-id":ctx.allocate("table-block"),"breditor/table-id":ctx.allocate("table"),"breditor/columns":columns,"breditor/merges":[],"breditor/retracted-merges":[]},children:[0,1].map(()=>({kind:"element",type:"breditor/table-row",entityId:null,properties:{"breditor/block-id":ctx.allocate("row-block"),"breditor/row-id":ctx.allocate("row")},children:columns.map(c=>({kind:"element",type:"breditor/table-cell",entityId:null,properties:{"breditor/block-id":ctx.allocate("cell"),"breditor/column-id":c.id,"breditor/header":false},children:[paragraph(ctx.allocate("p"))]}))}))};
}
export const defaultSharedToolbar:readonly SharedToolbarControl[]=[
 {id:"undo",label:"Undo",enabled:c=>c.model.view.undoDepth>0,run:c=>{c.core.undo(c.revision);}},
 {id:"redo",label:"Redo",enabled:c=>c.model.view.redoDepth>0,run:c=>{c.core.redo(c.revision);}},
 {id:"bold",label:"Bold",enabled:textEnabled,run:bold},
 ...([null,1,2,3] as const).map(level=>({id:level?`h${level}`:"paragraph",label:level?`H${level}`:"Paragraph",enabled:textEnabled,run:(c:ActionContext)=>{const s=c.model.view.selection;if(s?.kind==="text")publish(c,[{kind:"set_heading",data:{block:s.focus.block,level}}]);}})),
 {id:"bullet",label:"Bullet list",enabled:textEnabled,run:c=>setList(c,false)},
 {id:"numbered",label:"Numbered list",enabled:textEnabled,run:c=>setList(c,true)},
 {id:"unlist",label:"Remove list",enabled:c=>!!listContext(c.model),run:c=>{const l=listContext(c.model)!;publish(c,[{kind:"unwrap_list",data:{container:id(l.list)}}]);}},
 {id:"indent",label:"Indent",enabled:c=>(listContext(c.model)?.first??0)>0,run:c=>{const l=listContext(c.model)!,prior=l.items[l.first-1]!,nested=prior.children.find(n=>n.kind==="element"&&(n.type==="breditor/bullet-list"||n.type==="breditor/ordered-list"));publish(c,[{kind:"indent_list_items",data:{container:id(l.list),first:id(l.items[l.first]!),last:id(l.items[l.last]!),new_nested:nested?null:{block:c.allocate("nested"),style:l.list.type==="breditor/ordered-list"?{kind:"ordered",start:1}:{kind:"bullet"}}}}]);}},
 {id:"outdent",label:"Outdent",enabled:c=>!!listContext(c.model),run:c=>{const l=listContext(c.model)!,parent=c.model.parents.get(id(l.list));publish(c,[{kind:"outdent_list_items",data:{container:id(l.list),first:id(l.items[l.first]!),last:id(l.items[l.last]!),fresh_tail:parent?.type!=="breditor/list-item"&&l.last<l.items.length-1?c.allocate("list-tail"):null}}]);}},
 {id:"table",label:"Insert table",enabled:c=>{const p=positionAfter(c).parent;return p===null||c.model.nodes.get(p)?.type==="breditor/list-item";},run:c=>publish(c,[{kind:"insert_blocks",data:{...positionAfter(c),nodes:[newTable(c)]}}])},
 {id:"select-table",label:"Select table",enabled:c=>!!table(c),run:c=>{c.core.select({kind:"node",block:id(table(c)!)},c.revision);}},
 {id:"add-row",label:"Add row",enabled:c=>!!table(c),run:c=>{const t=table(c)!,r=c.allocate("row"),columns=c.model.view.tables.find(v=>v.id===property(t,"table-id"))?.columns,selection=columns?.[0]?{kind:"grid" as const,anchor:{table:String(property(t,"table-id")),row:r,column:columns[0].id},focus:{table:String(property(t,"table-id")),row:r,column:columns[0].id}}:undefined;publish(c,[{kind:"insert_row",data:{block:id(t),row_block:c.allocate("row-block"),row:r,before:null}}],selection);}},
 {id:"delete-row",label:"Delete row",enabled:c=>!!row(c),run:c=>publish(c,[{kind:"delete_block",data:{block:id(row(c)!)}}])},
 {id:"add-column",label:"Add column",enabled:c=>!!table(c),run:c=>{const t=table(c)!,column=c.allocate("column"),r=focusCell(c)?.row??c.model.view.tables.find(v=>v.id===property(t,"table-id"))?.rows[0],selection=r?{kind:"grid" as const,anchor:{table:String(property(t,"table-id")),row:r,column},focus:{table:String(property(t,"table-id")),row:r,column}}:undefined;publish(c,[{kind:"insert_column",data:{block:id(t),column,width:160,before:null}}],selection);}},
 {id:"delete-column",label:"Delete column",enabled:c=>!!column(c),run:c=>publish(c,[{kind:"delete_column",data:{block:id(table(c)!),column:column(c)!}}])},
 {id:"column-width",label:"Column width",type:"number",enabled:c=>!!column(c),value:c=>String(c.model.view.tables.find(v=>v.id===property(table(c)!,"table-id"))?.columns.find(v=>v.id===column(c))?.width??160),run:(c,v)=>publish(c,[{kind:"resize_column",data:{block:id(table(c)!),column:column(c)!,width:Number(v)}}])},
 {id:"merge",label:"Merge cells",enabled:c=>(c.model.view.grid?.cells.length??0)>1,run:c=>{const s=c.model.view.selection;if(s?.kind==="grid")publish(c,[{kind:"merge_cells",data:{block:id(table(c)!),merge:c.allocate("merge"),anchor:cellBlock(c.model,s.anchor),focus:cellBlock(c.model,s.focus)}}]);}},
 {id:"split",label:"Split cell",enabled:c=>!!focusCell(c),run:c=>publish(c,[{kind:"split_cell",data:{cell:cellBlock(c.model,focusCell(c)!)}}])},
 {id:"header",label:"Toggle header",enabled:c=>!!c.model.view.grid,run:c=>{const cells=c.model.view.grid!.cells.map(v=>cellBlock(c.model,v)),header=!cells.every(v=>property(c.model.nodes.get(v)!,"header")===true);publish(c,[{kind:"set_header",data:{cells,header}}]);}},
 {id:"clear",label:"Clear selection",enabled:c=>c.model.view.selection!==null,run:removeSelection},
 {id:"image",label:"Insert image",enabled:c=>!!c.image,run:c=>publish(c,[{kind:"insert_blocks",data:{...positionAfter(c),nodes:[imageNode(c.allocate("image-block"),c.allocate("image"),c.image!.asset,c.allocate("generation"),c.image!.alt,c.allocate("caption"))]}}])},
 {id:"alt",label:"Image alt text",type:"text",enabled:c=>!!image(c),value:c=>String(property(image(c)!,"alt-text")),run:(c,v)=>publish(c,[{kind:"set_image_alt",data:{block:id(image(c)!),text:v??"",decorative:false}}])},
 {id:"decorative",label:"Decorative image",enabled:c=>!!image(c),run:c=>publish(c,[{kind:"set_image_alt",data:{block:id(image(c)!),text:"",decorative:true}}])},
 {id:"asset",label:"Image asset",type:"text",enabled:c=>!!image(c),value:c=>String(property(image(c)!,"asset-id")),run:(c,v)=>publish(c,[{kind:"replace_image",data:{block:id(image(c)!),asset:v??"",generation:c.allocate("generation")}}])},
 {id:"image-width",label:"Image width",type:"number",enabled:c=>!!image(c),value:c=>String(property(image(c)!,"width")??160),run:(c,v)=>publish(c,[{kind:"resize_image",data:{block:id(image(c)!),size:[Number(v),Number(property(image(c)!,"height")??Number(v))]}}])},
 {id:"remove-node",label:"Remove node",enabled:c=>c.model.view.selection?.kind==="node",run:removeSelection},
];
/** Reorder the selected row/column without rebuilding retained cell bodies. */
export function axisMove(ctx:ActionContext,axis:"row"|"column",direction:-1|1):SharedCommand|undefined{
 const t=table(ctx);if(!t)return undefined;if(axis==="row"){const current=row(ctx);if(!current)return undefined;const rows=t.children.filter((n):n is ElementNode=>n.kind==="element"),index=rows.indexOf(current),other=rows[index+direction];if(!other)return undefined;const before=direction<0?id(other):rows[index+2]?id(rows[index+2]!):null;return {kind:"move_block",data:{block:id(current),parent:id(t),before}};}
 const columns=ctx.model.view.tables.find(v=>v.id===property(t,"table-id"))?.columns??[],current=column(ctx),index=columns.findIndex(c=>c.id===current),other=columns[index+direction];if(!current||!other)return undefined;return {kind:"move_column",data:{block:id(t),column:current,before:direction<0?other.id:columns[index+2]?.id??null}};
}
export const moveSharedToolbar:readonly SharedToolbarControl[]=(['row','column'] as const).flatMap(axis=>([-1,1] as const).map(direction=>({id:`${axis}-${direction<0?"previous":"next"}`,label:`Move ${axis} ${direction<0?"earlier":"later"}`,enabled:(c:ActionContext)=>!!axisMove(c,axis,direction),run:(c:ActionContext)=>{const command=axisMove(c,axis,direction);if(command)publish(c,[command]);}})));
