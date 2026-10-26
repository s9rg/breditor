/** Complete restored-graph DATA admission. The parent, literal input and
 * journal phases must agree with actual names; a ready marker is not native
 * continuity or writer authority. Every retained cut stays complete. */
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {SharedIndependentDeliveryParticipantBackup as Backup} from '../independent_delivery_participant/backup.js';
import {independentDeliveryParticipantDigest as digest} from '../independent_delivery_participant/codec.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {readRestoredOperationInput} from '../restored_operation/input.js';
import {readRestoredParticipantRecord} from '../restored_participant/record.js';
import {readRestoredOperationStage} from '../restored_operation/stage.js';
import {readOperationCutIntent} from '../independent_operation/cut_intent.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import {operationCutDigest,sameOperationCut,copyOperationCut} from '../independent_operation/cut_codec.js';
import {rows} from '../selected_native_execution/policy.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,fail} from './policy.js';
const backup={read:Backup.read,dispose:Backup.prototype.dispose},root=PhysicalRoomRecordCutArchive.prototype.root,inputs=PhysicalRoomRecordCutArchive.prototype.inputs;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export async function admitGraphReconstructionRecords(source:Loaded,id:string,session:SharedIndependentDeliveryRecoveryFactory,options:SharedAssetBytesOptions,check:()=>void){
 source.check();const entry=source.participant(id);if(entry.family!=='restored-graph')throw fail('native_reconstruction_policy');
 const payload=fields(await source.records(id),['parent','source']),data=fields(payload['source'],['format','formatVersion','identity','original','input','snapshot','live','retainedReferences']);check();
 if(data['format']!=='breditor/graph-source-record-payload'||data['formatVersion']!==1||!same(data['original'],entry.selection.original))throw fail();
 const input=fields(data['input'],['kind','selection','fileSha256']);if(!['snapshot-v1','lineage-v1','lineage-v2'].includes(String(input['kind']))||!same(input['selection'],entry.selection))throw fail();
 const cut=source.nativeCut(),member=root.call(cut).participants.find(row=>row.id===id);if(!member||member.family!=='restored-graph')throw fail();
 const namespace=(role:string)=>{const row=member.namespaces.find(row=>row.role===role);if(!row)throw fail();return row.database;};
 const names=['operation','journal','source','uploads'].map(namespace);if(new Set(names).size!==4)throw fail();
 const files=inputs.call(cut,id);if(files.length!==2||files[0]?.role!=='source-origin'||files[1]?.role!=='parent-input')throw fail();
 let original:Backup|undefined,prepared:Awaited<ReturnType<typeof readRestoredOperationInput>>|undefined,complete=false;
 try{
  original=await backup.read.call(Backup,files[0].file,entry.selection.original,options);check();
  prepared=await readRestoredOperationInput(files[1].file,{kind:input['kind'] as 'snapshot-v1'|'lineage-v1'|'lineage-v2',expected:entry.selection,database:namespace('journal'),sourceDatabase:namespace('source'),cohort:{coordinatorDatabase:namespace('operation'),uploadsDatabase:namespace('uploads')},session,writerRecovery:'host-reacquired',checkAuthority:check,...options});check();
  if(!same(prepared.identity,data['identity'])||prepared.fileSha256!==input['fileSha256']||await digest(source.participantFile(id),options.signal)!==prepared.fileSha256)throw fail();check();
  const selected={kind:prepared.kind,selection:prepared.selection,fileSha256:prepared.fileSha256},plan=JSON.stringify({format:'breditor/shared-restored-participant-plan',formatVersion:1,input:selected,databases:{coordinator:namespace('operation'),journal:namespace('journal'),source:namespace('source'),uploads:namespace('uploads')}});
  const parent=fields(payload['parent'],['format','formatVersion','parent','input','file']),file=fields(parent['file'],['role','bytes','sha256']),record=readRestoredParticipantRecord(parent['parent'],plan);
  if(parent['format']!=='breditor/fresh-restored-delivery-parent-records'||parent['formatVersion']!==1||!same(parent['input'],selected)||file['role']!=='parent-input'||file['bytes']!==files[1].file.size||file['sha256']!==prepared.fileSha256||record.uploads!=='complete'||record.source!=='complete')throw fail();
  const snapshot=fields(data['snapshot'],['record','current','pending','observed','retained','journal']),intent=readOperationCutIntent(snapshot['record'],prepared.identity),journal=readRestoredOperationStage(snapshot['journal'],prepared.identity,prepared.targets.length);
  if(journal.completed!==prepared.targets.length||!same(journal.intent,intent))throw fail();
  const cuts=new Map<string,IndependentHistoryCut>();
  for(const value of rows(snapshot['retained'],2)){const row=fields(value,['id','cut']),hash=row['id'];if(typeof hash!=='string'||cuts.has(hash))throw fail();const selected=row['cut'] as IndependentHistoryCut;await portableCutRecovery(prepared.factory,prepared.identity,selected);check();if(await operationCutDigest(selected)!==hash)throw fail();check();cuts.set(hash,copyOperationCut(selected));}
  const named=new Set([intent.current,intent.pending].filter((value):value is string=>value!==null));if(cuts.size!==named.size||[...cuts.keys()].some(hash=>!named.has(hash)))throw fail();
  for(const[slot,hash]of[['current',intent.current],['pending',intent.pending]]as const)if(hash===null?snapshot[slot]!==null:!cuts.has(hash)||!sameOperationCut(snapshot[slot],cuts.get(hash)!))throw fail();
  if(snapshot['observed']===null?intent.current!==null:typeof snapshot['observed']!=='string'||!named.has(snapshot['observed']))throw fail();
  const references=new Map<string,unknown>();for(const value of rows(data['retainedReferences'],2)){const row=fields(value,['id','references','pending']);if(typeof row['id']!=='string'||references.has(row['id'])||!cuts.has(row['id']))throw fail();references.set(row['id'],{references:row['references'],pending:row['pending']});}if(references.size!==cuts.size)throw fail();
  check();complete=true;return{prepared,original,intent,current:intent.current===null?null:cuts.get(intent.current)!,pending:intent.pending===null?null:cuts.get(intent.pending)!,observed:snapshot['observed'] as string|null,cuts,references,live:data['live'],close(){prepared!.dispose();backup.dispose.call(original!);}};
 }finally{if(!complete){prepared?.dispose();if(original)backup.dispose.call(original);}}
}
