/** Shared commit port for the opt-in image resize handles: one existing `resize_image` dispatch per request. */
import type {SharedDispatch} from "./types.js";
export interface SharedImageResizeRequest {readonly image:string;readonly block:string;readonly size:{readonly width:number;readonly height:number};readonly revision:string}
/**
 * Map a handle request to the shared owner's `resize_image` command. Exactly one dispatch is published per
 * request, so a drag release or key step is one local Undo unit and one causal operation for peers. The
 * shared command addresses the image by its rendered block id and writes both dimensions as one pair.
 */
export function sharedImageResizeCommit(dom:{execute(request:SharedDispatch,focus?:boolean,revision?:string):void}):(request:SharedImageResizeRequest)=>void {
 return request=>{
  if(!request.block)throw Error("Shared image resize requires the rendered image block id");
  dom.execute({commands:[{kind:"resize_image",data:{block:request.block,size:[request.size.width,request.size.height]}}]},false,request.revision);
 };
}
