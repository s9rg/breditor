import type {SharedRichEditor} from "./core.js";
import {imageNode} from "./actions.js";
import {SharedEditorError} from "./core.js";
export interface SharedAssetStore {ingest(file:Blob):Promise<{asset:string;width:number;height:number}>}
/** Persist all bytes before one guarded document action; failed/stale insertion never deletes bytes. */
export async function insertSharedImageFiles(core:SharedRichEditor,store:SharedAssetStore,files:readonly File[],position:{parent:string|null;before:string|null},revision=core.view().revision):Promise<void>{
 const selected=[...files];if(!selected.length||selected.length>16)throw Error("Select 1–16 image files per insertion");const target=structuredClone(position),prefix=`files:${crypto.randomUUID()}`,nodes=[];
 if(core.view().revision!==revision)throw new SharedEditorError("stale_observation","The image insertion was prepared from an older shared publication");
 // Decoding and durable storage are asynchronous. Keep the bounded remote queue
 // behind this intent; local UI/history changes still invalidate its exact guard.
 const release=core.holdRemotes();
 try{
  for(const[index,file]of selected.entries()){const asset=await store.ingest(file);nodes.push(imageNode(`${prefix}:b:${index}`,`${prefix}:i:${index}`,asset.asset,`${prefix}:g:${index}`,file.name||"Image",undefined,{width:asset.width,height:asset.height}));}
  core.dispatch({commands:[{kind:"insert_blocks",data:{...target,nodes}}]},revision);
 }finally{release();}
}
