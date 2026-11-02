/** Shared native/source/upload admission inside an already held scope. This
 * helper never acquires writers or ends the caller's source lifetime. Both the
 * standalone inspector and the same-lifetime retirement use these exact laws. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {NativeReconstructionInputs,ExpectedReconstructionMember} from './input_scope.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {verifySelectedRoomNativeContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {fail} from './policy.js';
const cut=Loaded.prototype.nativeCut,approval=Loaded.prototype.approval,upload=Loaded.prototype.selectedUploads,dispose=Loaded.prototype.dispose,read=Loaded.read;
export async function withAdmittedReconstructionInputs<P extends SharedSelectionPolicy,R>(scope:SelectedNativeRecoveryScope,chosen:PhysicalOperationV3HistoryReadOptions<P>,scoped:PhysicalOperationV3HistoryReadOptions<P>,retained:SelectedRoomCurrentFile,assets:SharedAssetBytesOptions|undefined,resolveAsset:SharedAssetBytesResolver|undefined,expected:readonly ExpectedReconstructionMember[],complete:boolean,visit:(context:NativeReconstructionInputs)=>Promise<R>,retire:boolean):Promise<R>{
 let before:Loaded|undefined,after:Loaded|undefined;
  try{const actual=await scope.retainCurrent();scope.check();before=await read.call(Loaded,actual.current,actual.integrity);after=await read.call(Loaded,retained,actual.integrity);scope.check();const a=approval.call(before),b=approval.call(after);if(JSON.stringify(a.selection)!==JSON.stringify(b.selection)||JSON.stringify(a.choice)!==JSON.stringify(b.choice))throw fail();
   if(complete&&expected.length!==scope.clients.length||new Set(expected.map(row=>row.id)).size!==expected.length)throw fail('native_reconstruction_policy');
   for(const row of expected){const entry=after.participant(row.id),member=scope.clients.find(m=>m.id===row.id),factory=chosen.reads.find(m=>m.id===row.id);if(!row.families.includes(entry.family)||member?.family!==entry.family||!factory)throw fail('native_reconstruction_policy');}
   await verifySelectedRoomNativeContinuation(cut.call(before),cut.call(after),scoped,scope.clients,scope.check);for(const row of a.choice.adoption.participants){await verifySelectedUploadContinuation(upload.call(before,row.id),upload.call(after,row.id),row.limits,scope.check,scope.signal);scope.check();}
   const result=await visit({before,retained:after,reads:chosen.reads,nativeReads:scoped.reads,clients:scope.clients,assets,resolveAsset,integrity:actual.integrity,check:scope.check,captureCurrent:()=>retire?scope.retainRetirementCurrent():scope.retainCurrent()});scope.check();return result;
  }finally{if(after)dispose.call(after);if(before)dispose.call(before);}
}
