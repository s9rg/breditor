/** Reconstruct DATA inside the genuine already-held bounded owner scope.
 * No nested source borrow, caller-supplied driver or writer permission is used.
 * Late readonly factory results remain observed after cancellation. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SelectedNativeReconstructionScope} from '../selected_native_recovery/contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import {verifySelectedRoomNativeContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {NativeReconstructionWaits} from './read_waits.js';
import type {NativeReconstructionInputs,ExpectedReconstructionMember} from './input_scope.js';
import {fields,fail} from './policy.js';
/** The scope must come directly from withSelectedNativeReconstruction. The
 * function returns only the visitor's DATA, never its source or native scope. */
export async function withHeldReconstructionInputs<R>(scope:SelectedNativeReconstructionScope,retained:SelectedRoomCurrentFile,provided:SharedAssetBytesOptions|undefined,resolveAsset:SharedAssetBytesResolver|undefined,expected:readonly ExpectedReconstructionMember[],visit:(context:NativeReconstructionInputs)=>Promise<R>):Promise<R>{
 const a=provided===undefined?undefined:fields(provided,[],['limits','signal']) as SharedAssetBytesOptions,assets=a===undefined?undefined:{limits:checkRichAssetLimits(a.limits),...(a.signal?{signal:a.signal}:{})};
 if(resolveAsset!==undefined&&typeof resolveAsset!=='function')throw fail('native_reconstruction_policy');
 const waits=new NativeReconstructionWaits(scope.check,[scope.signal,assets?.signal]);
 // Native factories/resolvers are individually bounded. Never race the whole
 // visitor: a durable intent open must finish its real cleanup before the
 // genuine native exclusion can be released.
 try{let before:Loaded|undefined,after:Loaded|undefined;
  try{const actual=await scope.retainCurrent(),check=()=>{waits.check();actual.integrity.checkAuthority();waits.check();},integrity={...actual.integrity,checkAuthority:check,signal:waits.signal};check();before=await Loaded.read(actual.current,integrity);after=await Loaded.read(retained,integrity);check();
   const left=before.approval(),right=after.approval();if(JSON.stringify(left.selection)!==JSON.stringify(right.selection)||JSON.stringify(left.choice)!==JSON.stringify(right.choice))throw fail();
   if(expected.length!==scope.clients.length||new Set(expected.map(row=>row.id)).size!==expected.length)throw fail('native_reconstruction_policy');
   for(const row of expected){const entry=after.participant(row.id),client=scope.clients.find(client=>client.id===row.id);if(!row.families.includes(entry.family)||client?.family!==entry.family||!scope.reads.some(read=>read.id===row.id))throw fail('native_reconstruction_policy');}
   const reads={reads:scope.reads,checkAuthority:check,signal:waits.signal};await verifySelectedRoomNativeContinuation(before.nativeCut(),after.nativeCut(),reads,scope.clients,check);
   for(const row of left.choice.adoption.participants){await verifySelectedUploadContinuation(before.selectedUploads(row.id),after.selectedUploads(row.id),row.limits,check,waits.signal);check();}
   const result=await visit({before,retained:after,reads:scope.reads,nativeReads:scope.reads,clients:scope.clients,assets,resolveAsset,integrity,check,captureCurrent:()=>scope.retainCurrent()});check();return result;
  }finally{after?.dispose();before?.dispose();}
 }finally{waits.close();}
}
