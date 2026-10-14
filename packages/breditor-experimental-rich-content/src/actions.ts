// Browser command preparation only. The Rust owner checks and commits each complete semantic action.
import type {FlowPosition,FormatLiteral,RichCell,RichCommand,RichSelection,TableCellDraft,TableDraft} from "./core.js";
import {formatsAt,id,isText,property,selectedImage,selectedTable,selectedText,sourceCell,text,textTargets,type ElementNode,type RichModel} from "./model.js";
export interface ActionContext {model:RichModel;allocate:(kind:string)=>string;stamp:()=>{replica:string;counter:string;lamport:string}}
export interface ToolbarControl {
 id:string;label:string;type?:"text"|"number";
 enabled:(context:ActionContext)=>boolean;
 value?:(context:ActionContext)=>string;
 command:(context:ActionContext,value?:string)=>RichCommand|null;
}
export function positionAfter(context:ActionContext):FlowPosition {
 const value=context.model,selection=value.view.selection;
 if(selection?.kind==="grid")return {parent:{kind:"cell",cell:selection.focus},before:null};
 let node=selection?.kind==="node"?value.nodes.get(selection.block):selectedText(value);
 if(!node)return {parent:{kind:"document"},before:null};
 let parent=value.parents.get(id(node));
 // A caption is not a general flow insertion parent. Insert after its image.
 if(parent?.type==="breditor/image"){node=parent;parent=value.parents.get(id(node));}
 const index=parent?.children.findIndex(child=>child.kind==="element"&&id(child)===id(node))??-1;
 const next=parent?.children[index+1];
 let target:FlowPosition["parent"]={kind:"document"};
 if(parent?.type==="breditor/table-cell"){
  const cell=sourceCell(value,id(node));if(cell)target={kind:"cell",cell};
 }else if(parent?.type==="breditor/list-item")target={kind:"listItem",block:id(parent)};
 return {parent:target,before:next?.kind==="element"?id(next):null};
}
export function selectedCell(context:ActionContext):RichCell|undefined {
 const selection=context.model.view.selection;
 return selection?.kind==="grid"?selection.focus:selection?.kind==="text"?sourceCell(context.model,selection.focus.block):undefined;
}
export function emptyCell(context:ActionContext,column:string):TableCellDraft {
 return {block:context.allocate("cell"),column,header:false,body:[{kind:"paragraph",block:context.allocate("p"),text:"",formatsJson:"[]"}]};
}
function listContext(value:RichModel):{list:ElementNode;items:ElementNode[];first:number;last:number}|undefined {
 const selection=value.view.selection;if(selection?.kind!=="text")return undefined;
 const itemOf=(block:string):ElementNode|undefined=>{let node=value.nodes.get(block);while(node){if(node.type==="breditor/list-item")return node;node=value.parents.get(id(node));}return undefined;};
 const a=itemOf(selection.anchor.block),f=itemOf(selection.focus.block);if(!a||!f)return undefined;
 const list=value.parents.get(id(a));if(!list||value.parents.get(id(f))!==list)return undefined;
 const items=list.children.filter((node):node is ElementNode=>node.kind==="element");
 const first=items.indexOf(a),last=items.indexOf(f);return {list,items,first:Math.min(first,last),last:Math.max(first,last)};
}
function formats(context:ActionContext):readonly FormatLiteral[] {
 const selection=context.model.view.selection;if(selection?.kind!=="text")return [];
 return context.model.view.pendingFormatsJson!==null?JSON.parse(context.model.view.pendingFormatsJson) as FormatLiteral[]:formatsAt(context.model,selection.focus);
}
export function bold(context:ActionContext):RichCommand|null {
 const selection=context.model.view.selection;if(selection?.kind!=="text")return null;
 if(selection.anchor.block===selection.focus.block&&selection.anchor.offset===selection.focus.offset){
  const current=formats(context),active=current.some(value=>value.type==="breditor/strong");
  const next=current.filter(value=>value.type!=="breditor/strong");
  return {kind:"setPendingFormats",formats:active?next:[...next,{type:"breditor/strong",properties:{}}].sort((a,b)=>a.type<b.type?-1:1)};
 }
 const targets=textTargets(context.model);if(!targets.length)return null;
 const active=targets.every(target=>{
  const node=context.model.nodes.get(target.block);if(!node)return false;let offset=0;
  return node.children.every(run=>{if(run.kind!=="text")return true;const start=offset;offset+=run.text.length;return offset<=Number(target.start)||start>=Number(target.end)||run.formats.some(format=>format.type==="breditor/strong");});
 });
 return {kind:"setInlineFormat",data:{targets,change:active?{kind:"remove",format:"breditor/strong"}:{kind:"set",formatsJson:'[{"type":"breditor/strong","properties":{}}]'}}};
}
export function enter(context:ActionContext):RichCommand|null {
 const selection=context.model.view.selection;if(selection?.kind!=="text")return null;
 const value=context.model,a=value.textBlocks.findIndex(node=>id(node)===selection.anchor.block),f=value.textBlocks.findIndex(node=>id(node)===selection.focus.block);
 const point=a<f||(a===f&&BigInt(selection.anchor.offset)<=BigInt(selection.focus.offset))?selection.anchor:selection.focus;
 const parent=value.parents.get(point.block);
 if(parent?.type==="breditor/image")return {kind:"insertPlainText",text:"\n"};
 const right=context.allocate("p");
 if(parent?.type==="breditor/list-item"&&parent.children[0]?.kind==="element"&&id(parent.children[0])===point.block)
  return {kind:"insertParagraph",data:{right,newItem:context.allocate("item")}};
 return {kind:"insertParagraph",data:{right,newItem:null}};
}
export function boundaryDelete(context:ActionContext,backward:boolean):RichCommand|null {
 const value=context.model,selection=value.view.selection;if(selection?.kind!=="text"||selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset)return null;
 const node=value.nodes.get(selection.focus.block),parent=node?value.parents.get(id(node)):undefined;if(!node||!parent)return null;
 const offset=Number(selection.focus.offset);if(backward?offset!==0:offset!==text(node).length)return null;
 const list=listContext(value);
 if(list&&parent.type==="breditor/list-item"&&parent.children[0]===node){
  const current=list.first,other=backward?current-1:current+1;
  const a=list.items[Math.min(current,other)],b=list.items[Math.max(current,other)];
  return a&&b?{kind:"joinListItems",data:{container:id(list.list),left:id(a),right:id(b)}}:null;
 }
 const position=parent.children.indexOf(node),other=parent.children[position+(backward?-1:1)];
 if(other?.kind!=="element")return null;
 if(isText(other))return {kind:"joinTextBlocks",data:{left:id(backward?other:node),right:id(backward?node:other)}};
 return {kind:"setSelection",selection:{kind:"node",block:id(other)}};
}
export function deleteSelection(context:ActionContext):RichCommand|null {
 const value=context.model,selection=value.view.selection;
 if(selection?.kind==="text")return {kind:"deleteSelection"};
 if(selection?.kind==="grid")return {kind:"clearTableCells",data:{emptyBlocks:(value.view.grid?.cells??[]).map(()=>context.allocate("p"))}};
 if(selection?.kind!=="node")return null;
 const node=value.nodes.get(selection.block),parent=node?value.parents.get(id(node)):undefined;if(!node||!parent)return null;
 const replacement=parent.children.length===1?{kind:"paragraph" as const,block:context.allocate("p"),text:"",formatsJson:"[]"}:null;
 if(node.type==="breditor/image")return {kind:"deleteImage",data:{image:String(property(node,"image-id")),replacement}};
 if(node.type==="breditor/table")return {kind:"deleteTable",data:{table:String(property(node,"table-id")),replacement}};
 return {kind:"replaceBlocks",data:{first:id(node),last:id(node),blocks:replacement?[replacement]:[]}};
}
function listCommand(context:ActionContext,start:number|null):RichCommand|null {
 const list=listContext(context.model);if(list)return {kind:"setListKind",data:{list:id(list.list),start}};
 const selection=context.model.view.selection;if(selection?.kind!=="text")return null;
 const value=context.model,aIndex=value.textBlocks.findIndex(node=>id(node)===selection.anchor.block),fIndex=value.textBlocks.findIndex(node=>id(node)===selection.focus.block);
 const first=aIndex<=fIndex?selection.anchor.block:selection.focus.block,last=aIndex<=fIndex?selection.focus.block:selection.anchor.block,parent=value.parents.get(first);
 if(!parent||parent!==value.parents.get(last))return null;
 const begin=parent.children.findIndex(node=>node.kind==="element"&&id(node)===first),end=parent.children.findIndex(node=>node.kind==="element"&&id(node)===last);
 const heads=parent.children.slice(begin,end+1).filter((node):node is ElementNode=>node.kind==="element"&&isText(node));
 return {kind:"wrapList",data:{first,last,container:context.allocate("list"),items:heads.map(()=>context.allocate("item")),start}};
}
const textEnabled=(context:ActionContext):boolean=>context.model.view.selection?.kind==="text";
const flowTextEnabled=(context:ActionContext):boolean=>textEnabled(context)&&context.model.parents.get(selectedText(context.model)?id(selectedText(context.model)!):"")?.type!=="breditor/image";
const gridEnabled=(context:ActionContext):boolean=>context.model.view.selection?.kind==="grid";
const tableEnabled=(context:ActionContext):boolean=>selectedTable(context.model)!==undefined;
const imageEnabled=(context:ActionContext):boolean=>selectedImage(context.model)!==undefined;
const data=(kind:RichCommand["kind"],value:unknown):RichCommand=>({kind,data:value}) as RichCommand;
function tableAxis(context:ActionContext):{table:string;view:RichModel["view"]["tables"][number];cell:RichCell|undefined}|undefined {
 const node=selectedTable(context.model);if(!node)return undefined;const table=String(property(node,"table-id")),view=context.model.view.tables.find(value=>value.id===table);return view?{table,view,cell:selectedCell(context)}:undefined;
}
function moveAxis(context:ActionContext,row:boolean,direction:-1|1):RichCommand|null {
 const axis=tableAxis(context);if(!axis?.cell)return null;
 const order=row?axis.view.rows:axis.view.columns.map(column=>column.id),key=row?axis.cell.row:axis.cell.column,index=order.indexOf(key);
 if(index<0||index+direction<0||index+direction>=order.length)return null;
 const before=direction<0?order[index-1]??null:order[index+2]??null;
 return row?{kind:"moveTableRow",data:{table:axis.table,row:key,before}}:{kind:"moveTableColumn",data:{table:axis.table,column:key,before}};
}
function headerIntent(context:ActionContext):boolean {
 const table=selectedTable(context.model),selected=new Set(context.model.view.grid?.cells.map(cell=>JSON.stringify([cell.row,cell.column]))??[]);
 if(!table)return true;
 const values=table.children.flatMap(row=>row.kind!=="element"?[]:row.children.flatMap(cell=>cell.kind!=="element"||!selected.has(JSON.stringify([property(row,"row-id"),property(cell,"column-id")]))?[]:[property(cell,"header")]));
 return !values.every(value=>value===true);
}
function dimension(input:string|undefined):number|undefined {if(!input||!/^\d+$/.test(input))return undefined;const value=Number(input);return Number.isSafeInteger(value)&&value>=1&&value<=4096?value:undefined;}
export const defaultToolbar:readonly ToolbarControl[]=[
 {id:"undo",label:"Undo",enabled:c=>c.model.view.undoDepth>0,command:()=>({kind:"undo"})},
 {id:"redo",label:"Redo",enabled:c=>c.model.view.redoDepth>0,command:()=>({kind:"redo"})},
 {id:"bold",label:"Bold",enabled:textEnabled,command:bold},
 {id:"heading",label:"Heading 2",enabled:flowTextEnabled,command:c=>{const node=selectedText(c.model);return node?{kind:"setHeading",block:id(node),level:2}:null;}},
 {id:"paragraph",label:"Paragraph",enabled:textEnabled,command:c=>{const node=selectedText(c.model);return node?{kind:"setHeading",block:id(node),level:null}:null;}},
 {id:"bullet",label:"Bullet list",enabled:flowTextEnabled,command:c=>listCommand(c,null)},
 {id:"numbered",label:"Numbered list",enabled:flowTextEnabled,command:c=>listCommand(c,1)},
 {id:"unlist",label:"Remove list",enabled:c=>listContext(c.model)!==undefined,command:c=>{const list=listContext(c.model);return list?{kind:"unwrapList",data:{list:id(list.list)}}:null;}},
 {id:"indent",label:"Indent",enabled:c=>(listContext(c.model)?.first??0)>0,command:c=>{const list=listContext(c.model);if(!list)return null;const previous=list.items[list.first-1],last=previous?.children[previous.children.length-1],kind=list.list.type,start=kind==="breditor/ordered-list"?Number(property(list.list,"start"))+list.first:null;return {kind:"indentListItems",data:{container:id(list.list),first:id(list.items[list.first]!),last:id(list.items[list.last]!),nested:last?.kind==="element"&&last.type===kind?null:{block:c.allocate("list"),start}}};}},
 {id:"outdent",label:"Outdent",enabled:c=>listContext(c.model)!==undefined,command:c=>{const list=listContext(c.model);return list?{kind:"outdentListItems",data:{container:id(list.list),first:id(list.items[list.first]!),last:id(list.items[list.last]!),tail:list.first>0&&list.last<list.items.length-1?c.allocate("list"):null}}:null;}},
 {id:"table",label:"Insert table",enabled:c=>!selectedTable(c.model),command:c=>{const columns=[{id:c.allocate("col"),width:160},{id:c.allocate("col"),width:160}],table:TableDraft={block:c.allocate("table-block"),table:c.allocate("table"),columns,rows:[0,1].map(()=>({block:c.allocate("row-block"),id:c.allocate("row"),cells:columns.map(column=>emptyCell(c,column.id))}))};return {kind:"insertTable",data:{position:positionAfter(c),table}};}},
 {id:"row",label:"Add row",enabled:tableEnabled,command:c=>{const axis=tableAxis(c);return axis?{kind:"insertTableRow",data:{table:axis.table,before:null,row:{block:c.allocate("row-block"),id:c.allocate("row"),cells:axis.view.columns.map(column=>emptyCell(c,column.id))}}}:null;}},
 {id:"column",label:"Add column",enabled:tableEnabled,command:c=>{const axis=tableAxis(c),column={id:c.allocate("col"),width:160};return axis?{kind:"insertTableColumn",data:{table:axis.table,before:null,column,cells:axis.view.rows.map(row=>({row,cell:emptyCell(c,column.id)}))}}:null;}},
 {id:"delete-row",label:"Delete row",enabled:c=>selectedCell(c)!==undefined,command:c=>{const cell=selectedCell(c);return cell?{kind:"deleteTableRow",data:{table:cell.table,row:cell.row}}:null;}},
 {id:"delete-column",label:"Delete column",enabled:c=>selectedCell(c)!==undefined,command:c=>{const cell=selectedCell(c);return cell?{kind:"deleteTableColumn",data:{table:cell.table,column:cell.column}}:null;}},
 {id:"row-up",label:"Move row up",enabled:c=>moveAxis(c,true,-1)!==null,command:c=>moveAxis(c,true,-1)},
 {id:"row-down",label:"Move row down",enabled:c=>moveAxis(c,true,1)!==null,command:c=>moveAxis(c,true,1)},
 {id:"column-left",label:"Move column left",enabled:c=>moveAxis(c,false,-1)!==null,command:c=>moveAxis(c,false,-1)},
 {id:"column-right",label:"Move column right",enabled:c=>moveAxis(c,false,1)!==null,command:c=>moveAxis(c,false,1)},
 {id:"merge",label:"Merge cells",enabled:c=>gridEnabled(c)&&(c.model.view.grid?.cells.length??0)>1,command:c=>({kind:"mergeTableCells",data:{merge:c.allocate("merge"),...c.stamp()}})},
 {id:"split",label:"Split cell",enabled:gridEnabled,command:c=>{const cell=selectedCell(c);return cell?{kind:"splitTableCell",data:{cell}}:null;}},
 {id:"header",label:"Header cells",enabled:gridEnabled,command:c=>({kind:"setTableHeader",data:{header:headerIntent(c)}})},
 {id:"clear",label:"Clear cells",enabled:gridEnabled,command:deleteSelection},
 {id:"column-width",label:"Column width",type:"number",enabled:c=>selectedCell(c)!==undefined,value:c=>{const axis=tableAxis(c);return String(axis?.view.columns.find(column=>column.id===axis.cell?.column)?.width??160);},command:(c,input)=>{const cell=selectedCell(c),width=dimension(input);return cell&&width?{kind:"resizeTableColumn",data:{table:cell.table,column:cell.column,width}}:null;}},
 {id:"delete-node",label:"Delete selected node",enabled:c=>c.model.view.selection?.kind==="node",command:deleteSelection},
 {id:"alt",label:"Image alt",type:"text",enabled:imageEnabled,value:c=>String(property(selectedImage(c.model)!,"alt-text")),command:(c,input)=>{const image=selectedImage(c.model);return image&&input?.trim()?{kind:"setImageAlt",data:{image:String(property(image,"image-id")),alt:{kind:"description",text:input}}}:null;}},
 {id:"decorative",label:"Decorative image",enabled:imageEnabled,command:c=>{const image=selectedImage(c.model);return image?{kind:"setImageAlt",data:{image:String(property(image,"image-id")),alt:{kind:"decorative"}}}:null;}},
 {id:"caption",label:"Image caption",type:"text",enabled:imageEnabled,value:c=>{const node=selectedImage(c.model)?.children[0];return node?.kind==="element"?text(node):"";},command:(c,input)=>{const image=selectedImage(c.model);return image&&input!==undefined?{kind:"setImageCaption",data:{image:String(property(image,"image-id")),caption:input?{block:c.allocate("caption"),text:input,formatsJson:"[]"}:null}}:null;}},
 {id:"image-width",label:"Image width",type:"number",enabled:imageEnabled,value:c=>String(property(selectedImage(c.model)!,"width")??320),command:(c,input)=>{const image=selectedImage(c.model),width=dimension(input);return image&&width?{kind:"resizeImage",data:{image:String(property(image,"image-id")),size:{width,height:Number(property(image,"height")??240)}}}:null;}},
 {id:"image-height",label:"Image height",type:"number",enabled:imageEnabled,value:c=>String(property(selectedImage(c.model)!,"height")??240),command:(c,input)=>{const image=selectedImage(c.model),height=dimension(input);return image&&height?{kind:"resizeImage",data:{image:String(property(image,"image-id")),size:{height,width:Number(property(image,"width")??320)}}}:null;}},
 {id:"asset",label:"Image asset",type:"text",enabled:imageEnabled,value:c=>String(property(selectedImage(c.model)!,"asset-id")),command:(c,input)=>{const image=selectedImage(c.model);return image&&input?{kind:"replaceImage",data:{image:String(property(image,"image-id")),asset:input,generation:c.allocate("generation")}}:null;}},
];
