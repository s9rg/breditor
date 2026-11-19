// Read-only semantic block-move planning. Rust `move_block` remains the final grammar authority and
// applies one retained-ID placement in one staged native group; this module never copies, deletes or
// edits DOM. It only rejects targets early so pointer/keyboard UI never offers a known-bad drop.
import {id,type ElementNode,type RichPresentationModel} from "@breditor/experimental-rich-content/rendering";
import type {SharedCommand} from "./types.js";

export type SharedBlockMoveCommand=Extract<SharedCommand,{kind:"move_block"}>;
/** `sibling-v1` reorders within the source container only. `flow-v1` also admits grammar-legal
 * moves between flow containers (document, blockquote, list/task item bodies, table cells). */
export type SharedBlockMovePolicy="sibling-v1"|"flow-v1";
export type SharedBlockDropSide="before"|"after";
export interface SharedBlockDropTarget {readonly anchor:string;readonly side:SharedBlockDropSide}
export type SharedBlockMoveRejection=
 |"read_only"|"unknown_block"|"not_movable"|"invalid_target"|"cyclic"|"cross_container"
 |"grammar"|"empties_source"|"item_lead"|"boundary";
export type SharedBlockMoveResolution=
 |{readonly kind:"move";readonly command:SharedBlockMoveCommand;readonly parent:string|null;readonly before:string|null}
 |{readonly kind:"unchanged"}
 |{readonly kind:"rejected";readonly reason:SharedBlockMoveRejection};

const FLOW=["breditor/paragraph","breditor/heading","breditor/bullet-list","breditor/ordered-list","breditor/image","breditor/blockquote","breditor/code-block","breditor/horizontal-rule","breditor/task-list"];
const FLOW_WITH_TABLES=[...FLOW,"breditor/table"];
/** Mirrors the closed V1/V2 child grammars. V1 documents contain only the V1 subset, whose
 * admissions are identical, so one table serves every rich language. */
const ADMITS:Readonly<Record<string,readonly string[]>>={
 "breditor/document":FLOW_WITH_TABLES,"breditor/blockquote":FLOW_WITH_TABLES,
 "breditor/list-item":FLOW_WITH_TABLES,"breditor/task-item":FLOW_WITH_TABLES,
 "breditor/table-cell":FLOW,
 "breditor/bullet-list":["breditor/list-item"],"breditor/ordered-list":["breditor/list-item"],
 "breditor/task-list":["breditor/task-item"],
};
/** Items whose first child must stay a prose line. */
const LEAD_ITEMS=new Set(["breditor/list-item","breditor/task-item"]);
const isLead=(node:ElementNode|undefined):boolean=>node?.type==="breditor/paragraph"||node?.type==="breditor/heading";
const elements=(node:ElementNode):ElementNode[]=>node.children.filter((child):child is ElementNode=>child.kind==="element");

function parentOf(model:RichPresentationModel,block:string):ElementNode|undefined{return model.parents.get(block)??(model.nodes.has(block)?model.root:undefined);}
const parentId=(model:RichPresentationModel,parent:ElementNode):string|null=>parent===model.root?null:id(parent);

/** A block is movable when its container is a grammar container this planner understands. Table
 * rows/cells (axis moves) and image captions are deliberately excluded. */
export function isMovableBlock(model:RichPresentationModel,block:string):boolean{
 const node=model.nodes.get(block),parent=node&&parentOf(model,block);
 return !!node&&!!parent&&(ADMITS[parent.type]?.includes(node.type)??false);
}
function inside(model:RichPresentationModel,block:string,ancestor:string):boolean{
 for(let current:string|undefined=block;current!==undefined;){if(current===ancestor)return true;const parent=model.parents.get(current);current=parent&&parent!==model.root?id(parent):undefined;}
 return false;
}

/** Resolve one semantic drop target to the existing retained-ID `move_block` command. */
export function resolveSharedBlockMove(model:RichPresentationModel,block:string,target:SharedBlockDropTarget,policy:SharedBlockMovePolicy="sibling-v1"):SharedBlockMoveResolution{
 const reject=(reason:SharedBlockMoveRejection):SharedBlockMoveResolution=>({kind:"rejected",reason});
 if(model.view.readOnly===true)return reject("read_only");
 const node=model.nodes.get(block);if(!node||!model.nodes.has(target.anchor))return reject("unknown_block");
 if(!isMovableBlock(model,block))return reject("not_movable");
 if(target.anchor===block)return {kind:"unchanged"};
 if(inside(model,target.anchor,block))return reject("cyclic");
 if(!isMovableBlock(model,target.anchor))return reject("invalid_target");
 const source=parentOf(model,block)!,destination=parentOf(model,target.anchor)!;
 if(source!==destination&&policy!=="flow-v1")return reject("cross_container");
 if(!(ADMITS[destination.type]?.includes(node.type)??false))return reject("grammar");
 // Final sibling order, computed without the moved block, decides lead and no-op rules.
 const siblings=elements(destination).filter(child=>id(child)!==block),anchorIndex=siblings.findIndex(child=>id(child)===target.anchor);
 const index=target.side==="before"?anchorIndex:anchorIndex+1,before=siblings[index],parent=parentId(model,destination);
 const current=elements(source),currentIndex=current.indexOf(node);
 if(source===destination&&currentIndex===index)return {kind:"unchanged"};
 if(LEAD_ITEMS.has(destination.type)&&!isLead([...siblings.slice(0,index),node,...siblings.slice(index)][0]))return reject("item_lead");
 if(source!==destination){
  const remaining=current.filter(child=>child!==node);
  if(remaining.length===0)return reject("empties_source");
  if(LEAD_ITEMS.has(source.type)&&!isLead(remaining[0]))return reject("item_lead");
 }
 const beforeId=before?id(before):null;
 return {kind:"move",parent,before:beforeId,command:{kind:"move_block",data:{block,parent,before:beforeId}}};
}

/** Keyboard sibling swap: one slot earlier (-1) or later (+1) inside the same container. */
export function resolveSharedBlockStep(model:RichPresentationModel,block:string,direction:-1|1):SharedBlockMoveResolution{
 if(model.view.readOnly===true)return {kind:"rejected",reason:"read_only"};
 if(!model.nodes.has(block))return {kind:"rejected",reason:"unknown_block"};
 if(!isMovableBlock(model,block))return {kind:"rejected",reason:"not_movable"};
 const siblings=elements(parentOf(model,block)!),index=siblings.findIndex(child=>id(child)===block),other=siblings[index+direction];
 if(!other)return {kind:"rejected",reason:"boundary"};
 return resolveSharedBlockMove(model,block,{anchor:id(other),side:direction<0?"before":"after"},"sibling-v1");
}

/** Every distinct admitted destination in document order; the keyboard "move mode" cycles these. */
export function sharedBlockDropTargets(model:RichPresentationModel,block:string,policy:SharedBlockMovePolicy="sibling-v1"):readonly (SharedBlockDropTarget&{parent:string|null;before:string|null})[]{
 const result:(SharedBlockDropTarget&{parent:string|null;before:string|null})[]=[],seen=new Set<string>();
 const walk=(parent:ElementNode):void=>{for(const child of elements(parent)){
  const anchor=id(child);
  for(const side of ["before","after"] as const){const resolved=resolveSharedBlockMove(model,block,{anchor,side},policy);if(resolved.kind!=="move")continue;const key=JSON.stringify([resolved.parent,resolved.before]);if(seen.has(key))continue;seen.add(key);result.push({anchor,side,parent:resolved.parent,before:resolved.before});}
  if(anchor!==block)walk(child);
 }};
 walk(model.root);return result;
}

/** The block a caret or node selection "means" for whole-block moves: the lead line of a list or
 * task item stands for the item; a grid selection stands for its table. */
export function sharedSelectionBlock(model:RichPresentationModel):string|null{
 const s=model.view.selection;let block:string|undefined;
 if(s?.kind==="text")block=s.focus.block;else if(s?.kind==="node")block=s.block;
 else if(s?.kind==="grid"){for(const node of model.nodes.values())if(node.type==="breditor/table"&&node.properties["breditor/table-id"]===s.focus.table){block=id(node);break;}}
 return block===undefined?null:sharedHandleBlock(model,block);
}
/** Climb from any rendered block to the nearest movable block, preferring an item over its lead. */
export function sharedHandleBlock(model:RichPresentationModel,block:string):string|null{
 for(let current:string|undefined=block;current!==undefined;){
  const node=model.nodes.get(current),parent=model.parents.get(current);
  if(node&&isMovableBlock(model,current)){
   if(parent&&LEAD_ITEMS.has(parent.type)&&elements(parent)[0]===node&&isMovableBlock(model,id(parent)))return id(parent);
   return current;
  }
  current=parent&&parent!==model.root?id(parent):undefined;
 }
 return null;
}
