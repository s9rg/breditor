import {isStructuralRichLanguage} from "@breditor/experimental-rich-content/rendering";
// Read-only UI preparation. Rust owns final semantic admission and all replicated state.
import {id,isText,property,sourceCell,text,formatsAt,textTargets,taskContext,selectedFlowAtom,type RichModel,type RichPresentationModel,type ElementNode} from "@breditor/experimental-rich-content/rendering";
import {exitEmptySharedTask} from "./task_actions_v2.js";
import {multiBlockListBackspace,multiBlockListEnter} from "@breditor/experimental-rich-content/rendering";
import {sharedStructureBoundaryV4,sharedStructureEnterV4} from "./structure_v4.js";
import type {SharedRichEditor} from "./core.js";
import type {RichInputRuleOutcome} from "@breditor/experimental-rich-content";
import type {SharedCommand,SharedDispatch,SharedNode,SharedParagraph,RichSelection,RichPoint,RichCell,FormatLiteral,SharedSelectionPolicy} from "./types.js";
import type {RichToolbarField,RichToolbarReading} from "@breditor/experimental-rich-content/rendering";
export interface ActionContext<P extends SharedSelectionPolicy="original"> {core:SharedRichEditor<P>;model:RichModel<P>;revision:string;allocate:(kind:string)=>string;image?:{asset:string;alt:string}}
/** Minimal intent port, not a replacement owner/view. Private generic observer/listener state is
 * deliberately absent; every operation still invokes the real native-backed facade. */
type IntentCore=Pick<SharedRichEditor,"splitWithAutolink"|"dispatch"|"select"|"setPendingFormats"|"replace"|"richLanguageVersion"|"supportsAtomEditing"|"deleteAtom"|"hardBreak"|"replaceGeneralRangePlainText"|"insertGeneralParagraph"|"undo"|"redo">&{
 selectionPolicy?():SharedSelectionPolicy;replaceDocumentPlainText?(paragraph:string,text:string,revision?:string):boolean;
};
export interface SharedIntentContext extends Omit<ActionContext,"core"|"model"> {core:IntentCore;model:RichPresentationModel}
export interface SharedToolbarControl<P extends SharedSelectionPolicy="original"> {id:string;label:string;type?:"text"|"number";owner?:SharedRichEditor<P>;fields?:readonly RichToolbarField[];shortcut?:string;mixedHint?:string;readOnlySafe?:boolean;read?:(context:ActionContext<P>)=>RichToolbarReading;enabled:(context:ActionContext<P>)=>boolean;value?:(context:ActionContext<P>)=>string;run:(context:ActionContext<P>,value?:string,fields?:Readonly<Record<string,string>>)=>void}
export type SharedCommonToolbarControl=Omit<SharedToolbarControl,"owner"|"read"|"enabled"|"value"|"run">&{read?:(context:SharedIntentContext)=>RichToolbarReading;enabled:(context:SharedIntentContext)=>boolean;value?:(context:SharedIntentContext)=>string;run:(context:SharedIntentContext,value?:string,fields?:Readonly<Record<string,string>>)=>void};
export function publish(ctx:SharedIntentContext,commands:readonly SharedCommand[],selection?:RichSelection|null):void{
 const request:SharedDispatch={commands};if(selection!==undefined)request.selectionUpdate={kind:"set",value:selection};ctx.core.dispatch(request,ctx.revision);
}
export function paragraph(block:string,value=""):SharedParagraph{return {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:value?[{kind:"text",text:value,formats:[]}]:[]};}
export function imageNode(block:string,image:string,asset:string,generation:string,alt:string,caption?:string,size?:{width:number;height:number}):SharedNode{
 const properties:Record<string,unknown>={"breditor/block-id":block,"breditor/image-id":image,"breditor/asset-id":asset,"breditor/asset-generation":generation,"breditor/alt-text":alt,"breditor/decorative":false};if(size){properties["breditor/width"]=size.width;properties["breditor/height"]=size.height;}
 return {kind:"element",type:"breditor/image",entityId:null,properties,children:caption?[paragraph(caption)]:[]};
}
export const caret=(block:string,offset=0):Extract<RichSelection,{kind:"text"}>=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
export function positionAfter(ctx:SharedIntentContext):{parent:string|null;before:string|null}{
 if(ctx.model.view.selection?.kind==="document")throw Error("Whole-document insertion requires an explicit replacement intent");
 const s=ctx.model.view.selection;if(s?.kind==="grid")return {parent:cellBlock(ctx.model,s.focus),before:null};
 let node=s?.kind==="node"?ctx.model.nodes.get(s.block):s?.kind==="text"?ctx.model.nodes.get(s.focus.block):undefined;
 if(!node)return {parent:null,before:null};let parent=ctx.model.parents.get(id(node));if(parent?.type==="breditor/image"){node=parent;parent=ctx.model.parents.get(id(node));}
 const index=parent?.children.indexOf(node)??-1,next=parent?.children[index+1];return {parent:parent&&parent!==ctx.model.root?id(parent):null,before:next?.kind==="element"?id(next):null};
}
export function cellBlock(value:RichPresentationModel,cell:RichCell):string{
 for(const node of value.nodes.values()){if(node.type!=="breditor/table-cell")continue;const source=sourceCell(value,id(node));if(source?.table===cell.table&&source.row===cell.row&&source.column===cell.column)return id(node);}throw Error("Visible source cell is absent");
}
export function ordered(value:RichPresentationModel,s:Extract<RichSelection,{kind:"text"}>):[RichPoint,RichPoint]{
 const a=value.textBlocks.findIndex(n=>id(n)===s.anchor.block),b=value.textBlocks.findIndex(n=>id(n)===s.focus.block);return a<b||(a===b&&BigInt(s.anchor.offset)<=BigInt(s.focus.offset))?[s.anchor,s.focus]:[s.focus,s.anchor];
}
export function listContext(value:RichPresentationModel):{list:ElementNode;items:ElementNode[];first:number;last:number}|undefined{
 const s=value.view.selection;if(s?.kind!=="text")return undefined;const item=(block:string):ElementNode|undefined=>{let n=value.nodes.get(block);while(n){if(n.type==="breditor/list-item")return n;if(n.type==="breditor/task-item")return undefined;n=value.parents.get(id(n));}return undefined;};
 const a=item(s.anchor.block),b=item(s.focus.block);if(!a||!b)return undefined;const list=value.parents.get(id(a));if(!list||value.parents.get(id(b))!==list)return undefined;const items=list.children.filter((n):n is ElementNode=>n.kind==="element"),first=items.indexOf(a),last=items.indexOf(b);return {list,items,first:Math.min(first,last),last:Math.max(first,last)};
}
export function bold(ctx:SharedIntentContext):void{
 const s=ctx.model.view.selection;if(s?.kind!=="text")return;const format={type:"breditor/strong",properties:{}};
 if(s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset){const formats=ctx.model.view.pendingFormatsJson===null?formatsAt(ctx.model,s.focus):JSON.parse(ctx.model.view.pendingFormatsJson) as FormatLiteral[];const active=formats.some(f=>f.type===format.type);const next=formats.filter(f=>f.type!==format.type);if(!active)next.push(format);next.sort((a,b)=>a.type.localeCompare(b.type));ctx.core.setPendingFormats(next,ctx.revision);return;}
 const targets=textTargets(ctx.model),active=targets.every(target=>{const n=ctx.model.nodes.get(target.block);if(!n)return false;let offset=0;return n.children.every(run=>{if(run.kind!=="text")return true;const start=offset;offset+=run.text.length;return offset<=Number(target.start)||start>=Number(target.end)||run.formats.some(f=>f.type===format.type);});});
 publish(ctx,targets.map(target=>({kind:"set_format",data:{block:target.block,offset:Number(target.start),length:Number(target.end)-Number(target.start),format,enabled:!active}})));
}
export function removeSelection(ctx:SharedIntentContext,movement:"before"|"after"="after"):void{
 if(ctx.model.view.selection?.kind==="document"){
  if(ctx.core.selectionPolicy?.()!=="document-v1"||!ctx.core.replaceDocumentPlainText)throw Error("Use matching native document-selection replacement");
  ctx.core.replaceDocumentPlainText(ctx.allocate("p"),"",ctx.revision);return;
 }
 const s=ctx.model.view.selection;if(s?.kind==="text"){ctx.core.replace(s,"",ctx.revision);return;}
 if(s?.kind==="node"){
  if(isStructuralRichLanguage(ctx.core.richLanguageVersion())&&ctx.core.supportsAtomEditing()&&selectedFlowAtom(ctx.model)){ctx.core.deleteAtom(ctx.allocate("p"),movement,ctx.revision);return;}
  const node=ctx.model.nodes.get(s.block),parent=ctx.model.parents.get(s.block);
  if(node?.type==="breditor/horizontal-rule")publish(ctx,[{kind:"delete_horizontal_rule",data:{block:s.block,replacement:parent?.children.length===1?paragraph(ctx.allocate("p")):null}}]);
  else publish(ctx,[{kind:"delete_block",data:{block:s.block}}]);return;
 }
 if(s?.kind==="grid")publish(ctx,[{kind:"clear_table_cells",data:{anchor:cellBlock(ctx.model,s.anchor),focus:cellBlock(ctx.model,s.focus),empty:(ctx.model.view.grid?.cells??[]).map(()=>ctx.allocate("empty"))}}]);
}
/** With `autolink`, a plain caret split takes the exclusive native split-and-link call and returns its outcome. */
export function enter(ctx:SharedIntentContext,target?:Extract<RichSelection,{kind:"text"}>,autolink=false):RichInputRuleOutcome|undefined{
 const s=target??ctx.model.view.selection;if(s?.kind!=="text")return;const[start,end]=ordered(ctx.model,s),node=ctx.model.nodes.get(start.block);if(!node)return;
 const cross=ctx.model.view.rangeEditing==="general-v1"&&s.anchor.block!==s.focus.block,parent=ctx.model.parents.get(start.block);
 if(!cross&&!target&&sharedStructureEnterV4(ctx)!==undefined)return;
 if(node.type==="breditor/code-block"||parent?.type==="breditor/image"){if(cross)ctx.core.replaceGeneralRangePlainText(s,"\n",ctx.allocate("range"),ctx.revision);else ctx.core.hardBreak(ctx.revision);return;}
 if(cross){ctx.core.insertGeneralParagraph(s,ctx.allocate("range"),ctx.revision);return;}
 // Multi-block item: Enter in an empty later paragraph moves it (and what follows) to a new item.
 const lift=target?undefined:multiBlockListEnter(ctx.model);if(lift){publish(ctx,[{kind:"split_list_item_block",data:{block:lift.block,new_item:ctx.allocate("item")}}],caret(lift.block));return;}
 if(parent?.type==="breditor/task-item"&&parent.children[0]===node){const exit=exitEmptySharedTask(ctx);if(exit){publish(ctx,[exit],caret(start.block));return;}}
 const list=listContext(ctx.model);
 if(list&&parent?.type==="breditor/list-item"&&parent.children[0]===node&&!text(node)&&start.block===end.block&&start.offset===end.offset){const outside=ctx.model.parents.get(id(list.list)),tail=outside?.type!=="breditor/list-item"&&list.last<list.items.length-1?ctx.allocate("list-tail"):null;publish(ctx,[{kind:"outdent_list_items",data:{container:id(list.list),first:id(parent),last:id(parent),fresh_tail:tail}}],caret(start.block));return;}
 const commands:SharedCommand[]=[];if(start.block!==end.block||start.offset!==end.offset)commands.push({kind:"replace_text_range",data:{anchor:s.anchor,focus:s.focus,runs:[]}});
 const right=ctx.allocate("p"),endNode=ctx.model.nodes.get(end.block),rank=node.type==="breditor/heading"&&endNode&&Number(end.offset)<text(endNode).length?Number(property(node,"level")):null;
 if(parent?.type==="breditor/task-item"&&parent.children[0]===node)commands.push({kind:"split_task_item",data:{block:start.block,offset:Number(start.offset),new_item:ctx.allocate("task"),right,right_heading:rank}});
 else if(parent?.type==="breditor/list-item"&&parent.children[0]===node)commands.push({kind:"split_list_item",data:{block:start.block,offset:Number(start.offset),new_item:ctx.allocate("item"),right,right_heading:rank}});
 else commands.push({kind:"split_text_block",data:{block:start.block,offset:Number(start.offset),right,right_heading:rank}});
 if(autolink&&commands.length===1&&start.block===end.block&&start.offset===end.offset)return ctx.core.splitWithAutolink({commands,selectionUpdate:{kind:"set",value:caret(right)}},ctx.revision);
 publish(ctx,commands,caret(right));
 return undefined;
}
export function boundaryDelete(ctx:SharedIntentContext,backward:boolean):boolean{
 const s=ctx.model.view.selection;if(s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset)return false;
 const node=ctx.model.nodes.get(s.focus.block),parent=node?ctx.model.parents.get(id(node)):undefined;if(!node||!parent||Number(s.focus.offset)!==(backward?0:text(node).length))return false;
 if(node.type==="breditor/code-block")return false;
 const v4=sharedStructureBoundaryV4(ctx,backward,node,parent);if(v4!==undefined)return v4;
 const task=taskContext(ctx.model);if(task&&parent.type==="breditor/task-item"&&parent.children[0]===node){const index=task.first,other=index+(backward?-1:1),left=task.items[Math.min(index,other)],right=task.items[Math.max(index,other)];if(left&&right){publish(ctx,[{kind:"join_task_items",data:{container:id(task.container),left:id(left),right:id(right)}}]);return true;}return false;}
 // Multi-block item: Backspace in an empty leading block keeps it as a later block of the previous item.
 const merge=backward?multiBlockListBackspace(ctx.model):undefined;if(merge){publish(ctx,[{kind:"join_list_items",data:{...merge,blocks:true}}],caret(id(node)));return true;}
 const list=listContext(ctx.model);if(list&&parent.type==="breditor/list-item"&&parent.children[0]===node){const index=list.first,other=index+(backward?-1:1),left=list.items[Math.min(index,other)],right=list.items[Math.max(index,other)];if(left&&right){publish(ctx,[{kind:"join_list_items",data:{container:id(list.list),left:id(left),right:id(right)}}]);return true;}return false;}
 const index=parent.children.indexOf(node),other=parent.children[index+(backward?-1:1)];if(other?.kind!=="element")return false;
 if(other.type==="breditor/code-block")return false;
 if(isText(other))publish(ctx,[{kind:"join_text_blocks",data:{left:id(backward?other:node),right:id(backward?node:other)}}]);else ctx.core.select({kind:"node",block:id(other)},ctx.revision);return true;
}
