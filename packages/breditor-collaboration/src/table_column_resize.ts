/** Shared commit port for the opt-in column resize handles: one existing `resize_column` dispatch per request. */
import type {SharedDispatch} from "./types.js";
export interface SharedTableColumnResizeRequest {readonly table:string;readonly block:string;readonly column:string;readonly width:number;readonly revision:string}
/**
 * Map a handle request to the shared owner's `resize_column` command. Exactly one
 * dispatch is published per request, so a drag release or key step is one local
 * Undo unit and one causal operation for peers. `block` is the table's block id.
 */
export function sharedTableColumnResizeCommit(dom:{execute(request:SharedDispatch,focus?:boolean,revision?:string):void}):(request:SharedTableColumnResizeRequest)=>void {
 return request=>{
  if(!request.block)throw Error("Shared column resize requires the rendered table block id");
  dom.execute({commands:[{kind:"resize_column",data:{block:request.block,column:request.column,width:request.width}}]},false,request.revision);
 };
}
