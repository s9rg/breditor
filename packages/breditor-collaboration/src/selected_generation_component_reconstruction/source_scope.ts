/** Genuine already-held source exclusion around the complete DATA join.
 * Individual native factories are bounded by the selected owner's read scope.
 * Never race this visitor or abandon a pending durable open/cleanup. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SelectedNativeReconstructionScope} from '../selected_native_recovery/contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import type {NativeReconstructionInputs,ExpectedReconstructionMember} from '../selected_native_reconstruction/input_scope.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {fields,fail} from './policy.js';
import {joinGenerationComponents} from './join.js';
import type {GenerationComponentRow} from './components.js';
export async function withHeldComponentInputs<R>(
 scope:SelectedNativeReconstructionScope,retained:SelectedRoomCurrentFile,
 provided:SharedAssetBytesOptions|undefined,resolveAsset:SharedAssetBytesResolver|undefined,
 expected:readonly ExpectedReconstructionMember[],visit:(context:NativeReconstructionInputs,components:readonly GenerationComponentRow[])=>Promise<R>,
):Promise<R>{
 const a=provided===undefined?undefined:fields(provided,[],['limits','signal']) as SharedAssetBytesOptions,assets=a===undefined?undefined:{limits:checkRichAssetLimits(a.limits),...(a.signal?{signal:a.signal}:{})};
 if(resolveAsset!==undefined&&typeof resolveAsset!=='function')throw fail('generation_component_reconstruction_policy');
 const waits=new NativeReconstructionWaits(scope.check,[scope.signal,assets?.signal]);let before:Loaded|undefined,journal:Loaded|undefined,joined:Loaded|undefined;
 try{
  const actual=await scope.retainCurrent(),check=()=>{waits.check();actual.integrity.checkAuthority();waits.check();},integrity={...actual.integrity,checkAuthority:check,signal:waits.signal};check();
  before=await Loaded.read(actual.current,integrity);journal=await Loaded.read(retained,integrity);
  if(expected.length!==scope.clients.length||new Set(expected.map(row=>row.id)).size!==expected.length)throw fail('generation_component_reconstruction_policy');
  for(const row of expected){const entry=journal.participant(row.id),client=scope.clients.find(client=>client.id===row.id);if(!row.families.includes(entry.family)||client?.family!==entry.family||!scope.reads.some(read=>read.id===row.id))throw fail('generation_component_reconstruction_policy');}
  const reads={reads:scope.reads,checkAuthority:check,signal:waits.signal},descriptors=new Map(scope.clients.map(row=>[row.id,JSON.stringify(sourceNativeRecoveryRead(row.core).descriptor())]));
  const result=await joinGenerationComponents(before,journal,reads,descriptors,integrity,assets?.limits);joined=await Loaded.read(result.output,integrity);check();
  const value=await visit({before,retained:joined,reads:scope.reads,nativeReads:scope.reads,clients:scope.clients,assets,resolveAsset,integrity,check,captureCurrent:()=>scope.retainCurrent()},result.components);check();return value;
 }finally{joined?.dispose();journal?.dispose();before?.dispose();waits.close();}
}
