/** Await a fresh host decision without letting an abandoned dialog pin native
 * sources forever. Late results are observed but never resume a cancelled job.
 * No callback, signal or saved boolean can manufacture a source reservation. */
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {fail} from '../physical_room_asset_adoption/policy.js';
import type {RoomAssetApprovalChoice} from './contract.js';
export async function decideRoomAssetApproval(choice:RoomAssetApprovalChoice,approve:(choice:RoomAssetApprovalChoice)=>boolean|Promise<boolean>,scope:Readonly<{check:()=>void;signal:AbortSignal|undefined;watchClosing:(cancel:()=>void)=>()=>void}>):Promise<void>{
 const observation=new PhysicalOperationV3Cancellation(scope.signal);let unwatch=()=>{},unclose=()=>{};
 try{await new Promise<void>((resolve,reject)=>{
  let finished=false;const refuse=(error:unknown)=>{if(finished)return;finished=true;reject(error);},cancel=()=>refuse(fail('asset_adoption_aborted'));
  try{unwatch=observation.watch(cancel);unclose=scope.watchClosing(cancel);observation.check();scope.check();if(finished)return;
   // Invoke now, while the real root and ALL sources/targets are held. Always
   // attach both handlers, even when cancellation wins during the callback.
   const result=approve(choice);void Promise.resolve(result).then(value=>{if(finished)return;try{observation.check();scope.check();if(value!==true)throw fail('asset_adoption_policy');finished=true;resolve();}catch(error){refuse(error);}},refuse);
  }catch(error){refuse(error);}
 });}finally{unclose();unwatch();observation.close();}
}
