// Read-only semantic block-move planning for the shared editor. The planner itself is shared with the
// local rich editor; this module only lowers its retained-ID placement to the shared `move_block`
// command. Rust `move_block` remains the final grammar authority and applies one retained-ID placement
// in one staged native group; nothing here copies, deletes or edits DOM.
import {isMovableBlock,resolveRichBlockMove,resolveRichBlockStep,richBlockDropTargets,richHandleBlock,richSelectionBlock,type RichBlockDropSide,type RichBlockDropTarget,type RichBlockMovePolicy,type RichBlockMoveRejection,type RichBlockMoveResolution,type RichPresentationModel} from "@breditor/experimental-rich-content/rendering";
import type {SharedCommand} from "./types.js";

export type SharedBlockMoveCommand=Extract<SharedCommand,{kind:"move_block"}>;
/** `sibling-v1` reorders within the source container only. `flow-v1` also admits grammar-legal
 * moves between flow containers (document, blockquote, list/task item bodies, table cells). */
export type SharedBlockMovePolicy=RichBlockMovePolicy;
export type SharedBlockDropSide=RichBlockDropSide;
export type SharedBlockDropTarget=RichBlockDropTarget;
export type SharedBlockMoveRejection=RichBlockMoveRejection;
export type SharedBlockMoveResolution=
 |{readonly kind:"move";readonly command:SharedBlockMoveCommand;readonly parent:string|null;readonly before:string|null}
 |{readonly kind:"unchanged"}
 |{readonly kind:"rejected";readonly reason:SharedBlockMoveRejection};

export {isMovableBlock};
/** Lower one planned retained-ID placement to the shared command. */
export function sharedBlockMoveResolution(resolution:RichBlockMoveResolution):SharedBlockMoveResolution{
 if(resolution.kind!=="move")return resolution;
 const {block,parent,before}=resolution.move;
 return {kind:"move",parent,before,command:{kind:"move_block",data:{block,parent,before}}};
}
/** Resolve one semantic drop target to the existing retained-ID `move_block` command. */
export function resolveSharedBlockMove(model:RichPresentationModel,block:string,target:SharedBlockDropTarget,policy:SharedBlockMovePolicy="sibling-v1"):SharedBlockMoveResolution{
 return sharedBlockMoveResolution(resolveRichBlockMove(model,block,target,policy));
}
/** Keyboard sibling swap: one slot earlier (-1) or later (+1) inside the same container. */
export function resolveSharedBlockStep(model:RichPresentationModel,block:string,direction:-1|1):SharedBlockMoveResolution{
 return sharedBlockMoveResolution(resolveRichBlockStep(model,block,direction));
}
/** Every distinct admitted destination in document order; the keyboard "move mode" cycles these. */
export function sharedBlockDropTargets(model:RichPresentationModel,block:string,policy:SharedBlockMovePolicy="sibling-v1"):readonly (SharedBlockDropTarget&{parent:string|null;before:string|null})[]{
 return richBlockDropTargets(model,block,policy);
}
/** The block a caret or node selection "means" for whole-block moves: the lead line of a list or
 * task item stands for the item; a grid selection stands for its table. */
export const sharedSelectionBlock=(model:RichPresentationModel):string|null=>richSelectionBlock(model);
/** Climb from any rendered block to the nearest movable block, preferring an item over its lead. */
export const sharedHandleBlock=(model:RichPresentationModel,block:string):string|null=>richHandleBlock(model,block);
