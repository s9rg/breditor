/** Read the actual held root, catalog and every genuine selected child with a
 * fresh read grant. Historical references do not prove provider availability. */
import {reserveCompleteOperationalHistoryRead,type CompleteHistoryParticipant,type CompleteOperationalHistoryMetadata} from '../complete_operation_cohort/history_read.js';
import {reserveCompleteHistoryUploads} from '../complete_operation_cohort/history_uploads.js';
import type {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {readPhysicalCatalogV3Database} from '../physical_room_catalog_v3/database.js';
import {physicalCatalogV3Archive} from '../physical_room_catalog_v3/archive.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PhysicalOperationV3HistoryReadOptions,PhysicalOperationV3HistoryRead} from './history_read_contract.js';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import type {PhysicalRoomRecordCutRoot,PhysicalRoomRecordCutParticipant} from '../physical_room_record_cut/contract.js';
import {physicalOperationV3Failure as fail} from './policy.js';
function choices<P extends SharedSelectionPolicy>(input:PhysicalOperationV3HistoryReadOptions<P>){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['reads','checkAuthority','signal'].includes(key)))throw fail('physical_operation_v3_policy');const values:Record<string,unknown>={};for(const key of Object.keys(input)){const field=Object.getOwnPropertyDescriptor(input,key);if(!field||!('value'in field))throw fail('physical_operation_v3_policy');values[key]=field.value;}
 const rows=values['reads'];if(!Array.isArray(rows))throw fail('physical_operation_v3_policy');const length=Object.getOwnPropertyDescriptor(rows,'length')?.value;if(!Number.isSafeInteger(length)||length<1||length>1024)throw fail('physical_operation_v3_policy');const result=new Map<string,CompleteHistoryParticipant<P>['read']>();
 for(let i=0;i<length;i++){const field=Object.getOwnPropertyDescriptor(rows,String(i));if(!field||!('value'in field))throw fail('physical_operation_v3_policy');const row=field.value;if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='id,read')throw fail('physical_operation_v3_policy');const id=Object.getOwnPropertyDescriptor(row,'id'),read=Object.getOwnPropertyDescriptor(row,'read');if(!id||!read||!('value'in id)||!('value'in read)||typeof id.value!=='string'||result.has(id.value))throw fail('physical_operation_v3_policy');result.set(id.value,read.value);}
 return{reads:result,authority:participantAuthority(values['checkAuthority'] as ()=>void),signal:values['signal'] as AbortSignal|undefined};
}
export interface PhysicalHistoryAssetVisit {readonly history:CompleteOperationalHistoryMetadata;readonly uploads:readonly Readonly<{id:string;family:CompleteHistoryParticipant['family'];file:Blob}>[];readonly check:()=>void;readonly digest:(file:Blob)=>Promise<string>;readonly signal:AbortSignal|undefined;readonly root?:PhysicalRoomRecordCutRoot;readonly recordPayloads?:()=>readonly PhysicalRoomRecordCutParticipant[]}
/** SDK-only projection while actual reservations remain held. This seam is not
 * a caller callback or an incoming custody constructor. Existing history-only
 * reads keep their old no-upload-acquisition/request behavior. */
export async function projectPhysicalOperationV3History<P extends SharedSelectionPolicy,T,R>(s:PhysicalOperationV3Custody,held:()=>void,input:PhysicalOperationV3HistoryReadOptions<P>,extra:Readonly<{cleanup:RecoveryCleanupScope;mode?:OperationalRecordReadMode;visit:(scope:PhysicalHistoryAssetVisit)=>Promise<T>;project:(history:PhysicalOperationV3HistoryRead,value:T)=>R}>|undefined):Promise<PhysicalOperationV3HistoryRead|R>{
 const selected=choices(input);if(s.pending||s.record.phase!=='operational'||s.children.some(child=>!child.live)||s.children.length!==selected.reads.size||s.children.some(child=>!selected.reads.has(child.selected.target.id)))throw fail('physical_operation_v3_restore');
 let observation:OperationalReadCancellation|undefined,read:ReturnType<typeof reserveCompleteOperationalHistoryRead<P>>|ReturnType<typeof reserveCompleteHistoryUploads<P>>|undefined,uploadRead:ReturnType<typeof reserveCompleteHistoryUploads<P>>|undefined,cleanup:ReturnType<RecoveryCleanupScope['retain']>|undefined;
 const rootCurrent=()=>{held();s.readCurrent();s.intent.checkReadCurrent();checkRecoveryLeasesHeld([s.lease,s.held.lease]);if(s.life.released||s.archiveDisposed||!physicalCatalogV3Archive.owns(s.held.archive))throw fail('physical_operation_v3_closed');observation?.check(()=>fail('physical_operation_v3_aborted'));},current=()=>{rootCurrent();read?.checkCurrent();},check=()=>{current();selected.authority();current();};
 // No signal observation, authority callback, I/O or native replay until the
 // real coordinator and all selected genuine parents are synchronously held.
 const participants=s.children.map(child=>({...child.live!,read:selected.reads.get(child.selected.target.id)!})) as CompleteHistoryParticipant<P>[];
 if(extra){uploadRead=reserveCompleteHistoryUploads(participants,check,selected.signal,extra.mode);read=uploadRead;cleanup=extra.cleanup.retain(()=>uploadRead!.close());}else read=reserveCompleteOperationalHistoryRead(participants,check,selected.signal);
 try{
  observation=new OperationalReadCancellation(selected.signal);if(extra)await read.prepare();check();const integrity=prepareArchiveIntegrity({wasm:s.options.wasm,checkAuthority:check});
  const verifyRoot=async()=>{check();const record=await s.intent.readFresh(s.record,check,selected.signal);check();if(JSON.stringify(record)!==JSON.stringify(s.record))throw fail('physical_operation_v3_diverged');const saved=await readPhysicalCatalogV3Database(s.held.db,check,s.held.state.manifest);check();if(await integrity.digest(new Blob([saved.record.manifest]))!==s.held.state.selection.sha256)throw fail('physical_operation_v3_diverged');
   // These expected immutable Blob copies were fully admitted when the genuine
   // catalog was acquired. Reread/hash every actual stored file; do not reuse a
   // cached phase, source DTO or the old per-family catalog read policies.
   if(saved.files.size!==s.held.state.files.size)throw fail('physical_operation_v3_diverged');for(const[name,file]of saved.files){const expected=s.held.state.files.get(name);if(!expected||file.size!==expected.size||file.type!==expected.type||await integrity.digest(file)!==await integrity.digest(expected))throw fail('physical_operation_v3_diverged');check();}
   return saved.files.size;
  };
  await verifyRoot();if(!extra)await read.prepare();await read.verify();let value:T|undefined,uploads:Awaited<ReturnType<NonNullable<typeof uploadRead>['captureUploads']>>|undefined;
  if(extra){uploads=await uploadRead!.captureUploads(512*1024*1024);check();value=await extra.visit({history:read.metadata(),uploads,check,digest:integrity.digest,signal:selected.signal,...(extra.mode?{root:frozen({operationDatabase:s.database,catalogDatabase:s.held.database,record:structuredClone(s.record),files:[...s.held.state.files].map(([name,file])=>({name,file:new Blob([file],{type:file.type})}))}),recordPayloads:()=>uploadRead!.recordPayloads()}:{})});check();await read.verify();const after=await uploadRead!.captureUploads(512*1024*1024);if(after.length!==uploads.length)throw fail('physical_operation_v3_diverged');for(const[i,row]of uploads.entries()){const actual=after[i];if(!actual||actual.id!==row.id||actual.family!==row.family||actual.file.size!==row.file.size||await integrity.digest(actual.file)!==await integrity.digest(row.file))throw fail('physical_operation_v3_diverged');check();}}
  const catalogFilesVerified=await verifyRoot();check();const ids=new Set(s.children.map(child=>child.selected.target.id)),history:PhysicalOperationV3HistoryRead=frozen(structuredClone({format:'breditor/physical-operation-v3-history-read',formatVersion:1,scope:'held-client-history-and-retained-catalog-bytes',selection:s.held.state.selection,catalogFilesVerified,history:read.metadata(),unreconciledParticipants:s.held.state.metadata.participants.filter(row=>!ids.has(row.id)).map(row=>row.id)}));const result=extra?extra.project(history,value as T):history;current();return result;
 }finally{try{if(cleanup){await cleanup.rollback();
   // A successful snapshot is not published until actual lock cleanup settles.
   // The child readers are now closed, but the genuine root and observed fresh
   // cancellation remain checkable without a callback or a caller signal getter.
   // Abort/close during this await must override a prepared return value too.
   rootCurrent();
  }else read.close();}finally{observation?.close();}}
}
/** Original history-only request, authority and storage semantics remain intact. */
export function readPhysicalOperationV3History<P extends SharedSelectionPolicy>(s:PhysicalOperationV3Custody,held:()=>void,input:PhysicalOperationV3HistoryReadOptions<P>):Promise<PhysicalOperationV3HistoryRead>{return projectPhysicalOperationV3History<P,never,never>(s,held,input,undefined);}
