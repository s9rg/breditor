/** Admit complete generation DATA before native replay. A head is not a phase
 * flag: exact original files, parent plans, committed files, attempt cuts and
 * every capture are retained and rechecked. Facade revisions are observations,
 * never a native ancestry or writer-authority ordering.
 */
import {SharedGenerationParticipantBackup as Backup} from '../generation_participant/backup.js';
import {generationIdentity} from '../generation_source/identity.js';
import {generationReferenceRecordStates} from '../generation_source/record_reference_capture.js';
import {checkGenerationRecords} from '../generation_source/validate_records.js';
import {makeSegmentedCut,readSegmentedHead} from '../persistence/segmented_head.js';
import {checkGenerationRecoveryRecord} from '../generation_participant/recovery_database.js';
import {checkGenerationOperationRecord} from '../generation_operation/database.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {GenerationRecordMetadata,GenerationRecordCapture} from '../persistence/generation_record_read.js';
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord} from '../generation_source/contract.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,fail} from './policy.js';
const backup={read:Backup.read,records:Backup.prototype.records,dispose:Backup.prototype.dispose};
const root=PhysicalRoomRecordCutArchive.prototype.root,inputs=PhysicalRoomRecordCutArchive.prototype.inputs;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function observedRevision(value:unknown):void{if(typeof value!=='string'||!/^(?:0|[1-9]\d*)$/.test(value))throw fail();}
function capture(value:unknown,identity:SharedGenerationSourceIdentity):GenerationRecordCapture{
 const c=fields(value,['checkpoint','review','versions','documentRevision','reviewRevision','companion']);
 if(typeof c['checkpoint']!=='string'||!Array.isArray(c['versions'])||c['versions'].length>32||c['versions'].some(v=>typeof v!=='string')||c['companion']!==null&&typeof c['companion']!=='string')throw fail();
 observedRevision(c['documentRevision']);
 if(identity.review===null){if(c['review']!==null||c['reviewRevision']!==null)throw fail();}
 else{const review=fields(c['review'],['actor','principal','checkpoint']);if(review['actor']!==identity.review.actor||review['principal']!==identity.review.principal||typeof review['checkpoint']!=='string')throw fail();observedRevision(c['reviewRevision']);}
 return c as unknown as GenerationRecordCapture;
}
/** Re-encoding preserves native strings verbatim. It validates the complete
 * declaration but does not synthesize a missing immutable file or source ACK. */
async function encoded(identity:SharedGenerationSourceIdentity,records:readonly SharedGenerationSourceRecord[],check:()=>void){
 const admitted=checkGenerationRecords(identity,records),s=admitted.source;
 const native=await makeSegmentedCut(s.checkpoint,identity.native,identity.review?{...identity.review,checkpoint:s.reviewCheckpoint!}:null,s.versions);check();
 const cut={head:admitted.companion?admitted.companion.wrap(JSON.parse(native.head),admitted.companion.capture()):native.head,files:native.files};
 const head=admitted.companion?admitted.companion.readHead(cut.head):readSegmentedHead(cut.head);
 return{admitted,cut,head};
}
export async function admitGenerationReconstructionRecords(source:Loaded,id:string,options:SharedAssetBytesOptions,check:()=>void){
 source.check();const entry=source.participant(id);if(entry.family!=='generation')throw fail('native_reconstruction_policy');
 const identity=generationIdentity(entry.selection.identity.source),payload=fields(await source.records(id),['parent','source']),data=fields(payload['source'],['format','formatVersion','identity','records']);check();
 if(data['format']!=='breditor/generation-source-record-payload'||data['formatVersion']!==1||!same(data['identity'],identity))throw fail();
 const nativeCut=source.nativeCut(),member=root.call(nativeCut).participants.find(row=>row.id===id);if(!member||member.family!=='generation')throw fail();
 const namespace=(role:string)=>{const value=member.namespaces.find(row=>row.role===role);if(!value)throw fail();return value.database;};
 const names=['operation','recovery','source','uploads'].map(namespace);if(new Set(names).size!==names.length)throw fail();
 const plan=JSON.stringify({format:'breditor/shared-generation-participant-plan',formatVersion:1,expected:entry.selection,destinations:{source:namespace('source'),uploads:namespace('uploads')},kind:identity.kind});
 const parent=fields(payload['parent'],['format','formatVersion','scope','selection','operation','recovery','files']);
 if(parent['format']!=='breditor/generation-operational-record-read'||parent['formatVersion']!==1||parent['scope']!=='held-generation-parent-markers-and-two-archives'||!same(parent['selection'],entry.selection))throw fail();
 const recovery=checkGenerationRecoveryRecord(parent['recovery'],{format:'breditor/shared-generation-participant-recovery',formatVersion:1,plan,phase:'preparing',source:'reserved',uploads:'reserved'});
 const operation=checkGenerationOperationRecord(parent['operation'],{format:'breditor/shared-generation-participant-operation',formatVersion:1,recoveryDatabase:namespace('recovery'),plan,phase:'prepared'});
 if(recovery.phase!=='ready'||recovery.source!=='complete'||recovery.uploads!=='complete'||operation.phase!=='operational')throw fail();
 const files=inputs.call(nativeCut,id),declared=parent['files'];if(files.length!==2||!Array.isArray(declared)||declared.length!==2)throw fail();
 const origins:Readonly<{role:string;records:readonly SharedGenerationSourceRecord[]}>[]=[];
 for(const [index,role] of ['recovery-origin','operation-origin'].entries()){
  const input=files[index],row=fields(declared[index],['role','bytes','sha256']);
  if(!input||input.role!==role||row['role']!==role||row['bytes']!==input.file.size||row['sha256']!==entry.selection.sha256)throw fail();
  const original=await backup.read.call(Backup,input.file,entry.selection,options);
  try{check();origins.push({role,records:backup.records.call(original)});}finally{backup.dispose.call(original);}
 }
 const raw=fields(data['records'],['format','formatVersion','scope','committed','attempt','pending','live']);
 if(raw['format']!=='breditor/persistent-generation-record-read'||raw['formatVersion']!==1||raw['scope']!=='atomic-generation-committed-attempt-pending-live')throw fail();
 const committed=fields(raw['committed'],['head','files','checkpoint','record']);if(typeof committed['head']!=='string'||typeof committed['checkpoint']!=='string'||!Array.isArray(committed['files']))throw fail();
 let attempt:Record<string,unknown>|undefined;
 if(raw['attempt']!==null){attempt=fields(raw['attempt'],['capture','cut']);capture(attempt['capture'],identity);if(attempt['cut']!==null)fields(attempt['cut'],['head','files']);}
 if(raw['pending']!==null)capture(raw['pending'],identity);capture(raw['live'],identity);
 const states=generationReferenceRecordStates(identity,raw as unknown as GenerationRecordMetadata);
 for(const state of states){
  const value=await encoded(identity,state.records,check);check();
  if(state.slot==='committed'){
   if(value.cut.head!==committed['head']||!same(value.cut.files,committed['files'])||!same(value.head,committed['record']))throw fail();
  }else{
   const c=capture(state.slot==='attempt'?attempt!['capture']:raw[state.slot],identity);
   if((value.admitted.companion?.capture()??null)!==c.companion)throw fail();
   if(state.slot==='attempt'&&attempt!['cut']!==null&&!same(value.cut,attempt!['cut']))throw fail();
  }
 }
 check();return Object.freeze({identity,origins:Object.freeze(origins),states:Object.freeze(states)});
}
