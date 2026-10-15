// Read-only UI preparation. Rust owns final semantic admission and all replicated state.
import {id,isText,property,sourceCell,text,formatsAt,textTargets,type RichModel,type ElementNode} from "@breditor/experimental-rich-content/rendering";
import type {SharedRichEditor} from "./core.js";
import type {SharedCommand,SharedDispatch,SharedNode,SharedParagraph,RichSelection,RichPoint,RichCell,FormatLiteral} from "./types.js";
export interface ActionContext {core:SharedRichEditor;model:RichModel;revision:string;allocate:(kind:string)=>string;image?:{asset:string;alt:string}}
export interface SharedToolbarControl {id:string;label:string;type?:"text"|"number";enabled:(context:ActionContext)=>boolean;value?:(context:ActionContext)=>string;run:(context:ActionContext,value?:string)=>void}
export function publish(ctx:ActionContext,commands:readonly SharedCommand[],selection?:RichSelection|null):void{
 const request:SharedDispatch={commands};if(selection!==undefined)request.selectionUpdate={kind:"set",value:selection};ctx.core.dispatch(request,ctx.revision);
}
export function paragraph(block:string,value=""):SharedParagraph{return {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:value?[{kind:"text",text:value,formats:[]}]:[]};}
export function imageNode(block:string,image:string,asset:string,generation:string,alt:string,caption?:string,size?:{width:number;height:number}):SharedNode{
 const properties:Record<string,unknown>={"breditor/block-id":block,"breditor/image-id":image,"breditor/asset-id":asset,"breditor/asset-generation":generation,"breditor/alt-text":alt,"breditor/decorative":false};if(size){properties["breditor/width"]=size.width;properties["breditor/height"]=size.height;}
 return {kind:"element",type:"breditor/image",entityId:null,properties,children:caption?[paragraph(caption)]:[]};
}
export const caret=(block:string,offset=0):Extract<RichSelection,{kind:"text"}>=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
export function positionAfter(ctx:ActionContext):{parent:string|null;before:string|null}{
 const s=ctx.model.view.selection;if(s?.kind==="grid")return {parent:cellBlock(ctx.model,s.focus),before:null};
 let node=s?.kind==="node"?ctx.model.nodes.get(s.block):s?.kind==="text"?ctx.model.nodes.get(s.focus.block):undefined;
 if(!node)return {parent:null,before:null};let parent=ctx.model.parents.get(id(node));if(parent?.type==="breditor/image"){node=parent;parent=ctx.model.parents.get(id(node));}
 const index=parent?.children.indexOf(node)??-1,next=parent?.children[index+1];return {parent:parent&&parent!==ctx.model.root?id(parent):null,before:next?.kind==="element"?id(next):null};
}
export function cellBlock(value:RichModel,cell:RichCell):string{
 for(const node of value.nodes.values()){if(node.type!=="breditor/table-cell")continue;const source=sourceCell(value,id(node));if(source?.table===cell.table&&source.row===cell.row&&source.column===cell.column)return id(node);}throw Error("Visible source cell is absent");
}
export function ordered(value:RichModel,s:Extract<RichSelection,{kind:"text"}>):[RichPoint,RichPoint]{
 const a=value.textBlocks.findIndex(n=>id(n)===s.anchor.block),b=value.textBlocks.findIndex(n=>id(n)===s.focus.block);return a<b||(a===b&&BigInt(s.anchor.offset)<=BigInt(s.focus.offset))?[s.anchor,s.focus]:[s.focus,s.anchor];
}
export function listContext(value:RichModel):{list:ElementNode;items:ElementNode[];first:number;last:number}|undefined{
 const s=value.view.selection;if(s?.kind!=="text")return undefined;const item=(block:string):ElementNode|undefined=>{let n=value.nodes.get(block);while(n){if(n.type==="breditor/list-item")return n;n=value.parents.get(id(n));}return undefined;};
 const a=item(s.anchor.block),b=item(s.focus.block);if(!a||!b)return undefined;const list=value.parents.get(id(a));if(!list||value.parents.get(id(b))!==list)return undefined;const items=list.children.filter((n):n is ElementNode=>n.kind==="element"),first=items.indexOf(a),last=items.indexOf(b);return {list,items,first:Math.min(first,last),last:Math.max(first,last)};
}
export function bold(ctx:ActionContext):void{
 const s=ctx.model.view.selection;if(s?.kind!=="text")return;const format={type:"breditor/strong",properties:{}};
 if(s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset){const formats=ctx.model.view.pendingFormatsJson===null?formatsAt(ctx.model,s.focus):JSON.parse(ctx.model.view.pendingFormatsJson) as FormatLiteral[];const active=formats.some(f=>f.type===format.type);const next=formats.filter(f=>f.type!==format.type);if(!active)next.push(format);next.sort((a,b)=>a.type.localeCompare(b.type));ctx.core.setPendingFormats(next,ctx.revision);return;}
 const targets=textTargets(ctx.model),active=targets.every(target=>{const n=ctx.model.nodes.get(target.block);if(!n)return false;let offset=0;return n.children.every(run=>{if(run.kind!=="text")return true;const start=offset;offset+=run.text.length;return offset<=Number(target.start)||start>=Number(target.end)||run.formats.some(f=>f.type===format.type);});});
 publish(ctx,targets.map(target=>({kind:"set_format",data:{block:target.block,offset:Number(target.start),length:Number(target.end)-Number(target.start),format,enabled:!active}})));
}
export function removeSelection(ctx:ActionContext):void{
 const s=ctx.model.view.selection;if(s?.kind==="text"){ctx.core.replace(s,"",ctx.revision);return;}
 if(s?.kind==="node"){publish(ctx,[{kind:"delete_block",data:{block:s.block}}]);return;}
 if(s?.kind==="grid")publish(ctx,[{kind:"clear_table_cells",data:{anchor:cellBlock(ctx.model,s.anchor),focus:cellBlock(ctx.model,s.focus),empty:(ctx.model.view.grid?.cells??[]).map(()=>ctx.allocate("empty"))}}]);
}
export function enter(ctx:ActionContext):void{
 const s=ctx.model.view.selection;if(s?.kind!=="text")return;const[start,end]=ordered(ctx.model,s),node=ctx.model.nodes.get(start.block);if(!node)return;
 const parent=ctx.model.parents.get(start.block);if(parent?.type==="breditor/image"){ctx.core.type("\n",ctx.revision);return;}
 const list=listContext(ctx.model);
 if(list&&parent?.type==="breditor/list-item"&&parent.children[0]===node&&!text(node)&&start.block===end.block&&start.offset===end.offset){const outside=ctx.model.parents.get(id(list.list)),tail=outside?.type!=="breditor/list-item"&&list.last<list.items.length-1?ctx.allocate("list-tail"):null;publish(ctx,[{kind:"outdent_list_items",data:{container:id(list.list),first:id(parent),last:id(parent),fresh_tail:tail}}],caret(start.block));return;}
 const commands:SharedCommand[]=[];if(start.block!==end.block||start.offset!==end.offset)commands.push({kind:"replace_text_range",data:{anchor:s.anchor,focus:s.focus,runs:[]}});
 const right=ctx.allocate("p"),endNode=ctx.model.nodes.get(end.block),rank=node.type==="breditor/heading"&&endNode&&Number(end.offset)<text(endNode).length?Number(property(node,"level")):null;
 if(parent?.type==="breditor/list-item"&&parent.children[0]===node)commands.push({kind:"split_list_item",data:{block:start.block,offset:Number(start.offset),new_item:ctx.allocate("item"),right,right_heading:rank}});
 else commands.push({kind:"split_text_block",data:{block:start.block,offset:Number(start.offset),right,right_heading:rank}});
 publish(ctx,commands,caret(right));
}
export function boundaryDelete(ctx:ActionContext,backward:boolean):boolean{
 const s=ctx.model.view.selection;if(s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset)return false;
 const node=ctx.model.nodes.get(s.focus.block),parent=node?ctx.model.parents.get(id(node)):undefined;if(!node||!parent||Number(s.focus.offset)!==(backward?0:text(node).length))return false;
 const list=listContext(ctx.model);if(list&&parent.type==="breditor/list-item"&&parent.children[0]===node){const index=list.first,other=index+(backward?-1:1),left=list.items[Math.min(index,other)],right=list.items[Math.max(index,other)];if(left&&right){publish(ctx,[{kind:"join_list_items",data:{container:id(list.list),left:id(left),right:id(right)}}]);return true;}return false;}
 const index=parent.children.indexOf(node),other=parent.children[index+(backward?-1:1)];if(other?.kind!=="element")return false;
 if(isText(other))publish(ctx,[{kind:"join_text_blocks",data:{left:id(backward?other:node),right:id(backward?node:other)}}]);else ctx.core.select({kind:"node",block:id(other)},ctx.revision);return true;
}
