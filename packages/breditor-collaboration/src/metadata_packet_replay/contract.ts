/** SDK-private readonly Native loan for inspecting literal saved packets.
 * It conveys no storage ownership, writer registration or activation rights. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {fail} from '../selected_native_reconstruction/policy.js';
export interface MetadataPacketNativeAlias {readonly participant:string;readonly core:SharedRichEditor<SharedSelectionPolicy>;readonly versions:readonly string[];check():void}
export type MetadataPacketNativeVisit<T>=(source:MetadataPacketNativeAlias)=>Promise<T>;
const view=SharedRichEditor.prototype.view;
export async function visitPacketNativeAlias<T>(participant:string,core:MetadataPacketNativeAlias['core'],check:()=>void,visit:MetadataPacketNativeVisit<T>,versions:readonly string[]=[]):Promise<T>{
 check();if(typeof visit!=='function'||!view.call(core).readOnly)throw fail('native_reconstruction_policy');const stamp=coreReadStamp(core);
 const guard=()=>{check();const now=coreReadStamp(core);if(!view.call(core).readOnly||now.document!==stamp.document||now.review!==stamp.review)throw fail('native_reconstruction_integrity');};
 guard();const result=await visit(Object.freeze({participant,core,versions:Object.freeze([...versions]),check:guard}));guard();return result;
}
