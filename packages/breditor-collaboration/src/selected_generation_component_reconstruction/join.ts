/** Complete immutable component join, not AST merging or serving custody.
 * Both full inputs remain required evidence. Every chosen native record keeps
 * its actual input files. Packet decisions cannot be dropped merely because
 * its rendered text or native history matches another candidate. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {verifySelectedRoomNativeParticipantContinuation as member,verifySelectedRoomNativeDataContinuation as complete} from '../selected_room_current/native_continuation.js';
import {compareReconstructionPackets} from '../selected_native_reconstruction/compare_packets.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {encodePhysicalRoomRecordCut} from '../physical_room_record_cut/capture.js';
import {encodeSelectedRoomCurrent} from '../selected_room_current/archive.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {PhysicalRoomRecordCutParticipant} from '../physical_room_record_cut/contract.js';
import {generationComponents,type GenerationComponentSide,type GenerationComponentRow} from './components.js';
import {selectConservedComponent,nativeOrderMismatch,packetOrderMismatch,uploadOrderMismatch} from './candidate.js';
import {fail} from './policy.js';
export async function joinGenerationComponents(
 current:Loaded,journal:Loaded,reads:PhysicalOperationV3HistoryReadOptions,
 descriptors:ReadonlyMap<string,string>,options:SharedArchiveIntegrityOptions,assetLimits?:Parameters<typeof checkRichAssetLimits>[0],
) {
 const integrity=prepareArchiveIntegrity(options),check=integrity.guard,a=current.nativeCut(),b=journal.nativeCut(),root=a.root();
 if(JSON.stringify(root)!==JSON.stringify(b.root())||JSON.stringify(current.approval())!==JSON.stringify(journal.approval()))throw fail();
 const af=a.catalogFiles(),bf=b.catalogFiles();if(af.size!==bf.size)throw fail();
 for(const[name,file]of af){const other=bf.get(name);if(!other||await integrity.digest(file)!==await integrity.digest(other))throw fail();}
 const selected=(side:GenerationComponentSide)=>side==='current'?current:journal;
 const nativeDirection=async(left:Loaded,right:Loaded,id:string,descriptor:string)=>{
  try{await member(left.nativeCut(),right.nativeCut(),reads,id,descriptor,check);check();return true;}
  catch(error){check();if(!nativeOrderMismatch(error))throw error;return false;}
 };
 const participants:PhysicalRoomRecordCutParticipant[]=[],uploads:{id:string;family:PhysicalRoomRecordCutParticipant['family'];file:Blob}[]=[],selectedUploads:{id:string;database:string;file:Blob;sha256:string}[]=[],components:GenerationComponentRow[]=[],historyRows:ReturnType<typeof a.history>['history']['participants'][number][]=[];
 const originalLimits=checkRichAssetLimits(assetLimits),ah=a.history(),bh=b.history();
 for(const row of root.participants){
  check();const descriptor=descriptors.get(row.id);if(typeof descriptor!=='string')throw fail('generation_component_reconstruction_policy');
  const forward=await nativeDirection(current,journal,row.id,descriptor),backward=await nativeDirection(journal,current,row.id,descriptor);
  const native=await selectConservedComponent(forward,backward,async side=>{
   try{for(const input of[current,journal])await compareReconstructionPackets({id:row.id,before:input,retained:selected(side),check});check();return true;}
   catch(error){check();if(!packetOrderMismatch(error))throw error;return false;}
  },check);
  const policy=journal.approval().choice.adoption.participants.find(item=>item.id===row.id);if(!policy)throw fail();
  const chooseUploads=async(kind:'original'|'selected')=>selectConservedComponent(true,true,async side=>{
   const file=kind==='original'?selected(side).originalUploads(row.id):selected(side).selectedUploads(row.id);
   try{for(const input of[current,journal])await verifySelectedUploadContinuation(kind==='original'?input.originalUploads(row.id):input.selectedUploads(row.id),file,kind==='original'?originalLimits:policy.limits,check,options.signal);check();return true;}
   catch(error){check();if(!uploadOrderMismatch(error))throw error;return false;}
  },check);
  const originalUploads=await chooseUploads('original'),selectedQueue=await chooseUploads('selected'),chosen=selected(native),cut=chosen.nativeCut(),file=selected(selectedQueue).selectedUploads(row.id);
  participants.push({id:row.id,family:row.family,payload:{family:row.family,state:await chosen.records(row.id),files:cut.inputs(row.id)}});
  uploads.push({id:row.id,family:row.family,file:selected(originalUploads).originalUploads(row.id)});
  selectedUploads.push({id:row.id,database:policy.targetDatabase,file,sha256:await integrity.digest(file)});
  components.push({id:row.id,native,originalUploads,selectedUploads:selectedQueue});
  const history=(native==='current'?ah:bh).history.participants.find(item=>item.id===row.id);if(!history)throw fail();historyRows.push(history);
 }
 // Original diagnostic reports remain in the before/journal inputs. Derived
 // diagnostics are conservative Pending, never a live-readiness certificate.
 const refs=new Map([...ah.history.references,...bh.history.references].map(row=>[JSON.stringify(row),row]));
 const history={...bh,history:{...bh.history,participants:historyRows,kind:'pending' as const,references:[...refs.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,row])=>row)}};
 const native=await encodePhysicalRoomRecordCut({root:{operationDatabase:root.database,catalogDatabase:root.source.catalogDatabase,record:root,files:[...bf].map(([name,file])=>({name,file}))},history,participants,uploads},integrity);
 const result=await encodeSelectedRoomCurrent({approval:journal.approval(),root:native,uploads:selectedUploads},options);
 let output:Loaded|undefined;
 try{
  output=await Loaded.read(result,options);
  for(const input of[current,journal]){
   await complete(input.nativeCut(),output.nativeCut(),reads,descriptors,check);
   for(const row of root.participants){await compareReconstructionPackets({id:row.id,before:input,retained:output,check});const policy=output.approval().choice.adoption.participants.find(item=>item.id===row.id);if(!policy)throw fail();await verifySelectedUploadContinuation(input.originalUploads(row.id),output.originalUploads(row.id),originalLimits,check,options.signal);await verifySelectedUploadContinuation(input.selectedUploads(row.id),output.selectedUploads(row.id),policy.limits,check,options.signal);}
  }
  check();return Object.freeze({components:generationComponents(components),output:result});
 }finally{output?.dispose();}
}
