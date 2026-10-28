/** Recompute the exact component join from complete stored inputs, then
 * prove that the original accepted input and every journal cut fit the output.
 * Labels, last-stage markers and equal rendered content are never evidence. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {SelectedGenerationNativeImportArchive as Input} from '../selected_generation_import/archive.js';
import {RoomPreparationArchive as Preparation} from '../native_room_preparation/archive.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {verifySelectedRoomNativeDataContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {compareReconstructionPackets} from '../selected_native_reconstruction/compare_packets.js';
import {executionNativeDescriptors} from '../native_room_execution/native_descriptors.js';
import type {RoomExecutionArchive} from '../native_room_execution/archive.js';
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import type {GenerationNativeExecutionSnapshot} from '../selected_generation_execution/contract.js';
import type {GenerationComponentRow} from './components.js';
import {joinGenerationComponents} from './join.js';
import {fail} from './policy.js';
export async function verifyGenerationComponentReconstructionHistory(snapshot:GenerationNativeExecutionSnapshot,execution:RoomExecutionArchive,scope:RoomExecutionReadScope,components:readonly GenerationComponentRow[]){
 let input:Input|undefined,prepared:Preparation|undefined,right:Loaded|undefined,before:Loaded|undefined,last:Loaded|undefined;
 const options={wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal};
 try{
  input=await Input.read(snapshot.intent.input,snapshot.intent.identity.input.input,options);prepared=await Preparation.read(execution.preparation().file,execution.preparation().choice,options);right=await Loaded.read(prepared.retained(),options);before=await Loaded.read(prepared.before(),options);
  const tail=snapshot.events.at(-1)!;last=await Loaded.read({selection:tail.event.cut,file:snapshot.cuts.get(tail.event.sequence)!},options);
  const participants=right.nativeCut().root().participants.map(row=>({id:row.id,family:row.family}));if(JSON.stringify(participants)!==JSON.stringify(snapshot.intent.clients))throw fail();
  const descriptors=await executionNativeDescriptors(right,scope),reads={reads:scope.reads,checkAuthority:scope.check,signal:scope.signal};
  const joined=await joinGenerationComponents(before,last,reads,descriptors,options,scope.assets?.limits);
  if(JSON.stringify(joined.components)!==JSON.stringify(components)||JSON.stringify(joined.output.selection)!==JSON.stringify(right.file().selection))throw fail();
  const files=[input.beforeFile(),...snapshot.events.map(row=>({selection:row.event.cut,file:snapshot.cuts.get(row.event.sequence)!}))],seen=new Set<string>(),limits=checkRichAssetLimits(scope.assets?.limits);
  for(const file of files){scope.check();const key=JSON.stringify(file.selection);if(seen.has(key))continue;seen.add(key);let left:Loaded|undefined;
   try{left=await Loaded.read(file,options);if(JSON.stringify(left.approval())!==JSON.stringify(right.approval()))throw fail();await verifySelectedRoomNativeDataContinuation(left.nativeCut(),right.nativeCut(),reads,descriptors,scope.check);for(const row of participants){await compareReconstructionPackets({id:row.id,before:left,retained:right,check:scope.check});await verifySelectedUploadContinuation(left.originalUploads(row.id),right.originalUploads(row.id),limits,scope.check,scope.signal);const policy=left.approval().choice.adoption.participants.find(member=>member.id===row.id);if(!policy)throw fail();await verifySelectedUploadContinuation(left.selectedUploads(row.id),right.selectedUploads(row.id),policy.limits,scope.check,scope.signal);}}
   finally{left?.dispose();}
  }
  scope.check();return Object.freeze({before:prepared.before(),retained:prepared.retained()});
 }finally{last?.dispose();before?.dispose();right?.dispose();prepared?.dispose();input?.dispose();}
}
