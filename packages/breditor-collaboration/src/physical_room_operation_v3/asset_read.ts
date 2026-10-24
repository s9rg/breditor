/** Reserve all genuine children before callbacks, then bind exact native and
 * whole-upload cuts to the actual held root. No child/store/lease can escape. */
import {checkRichAssetLimits,RichAssetArchive} from '@breditor/experimental-rich-content';
import {borrowCompleteNativeRead} from '../complete_operation_cohort/native_read.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {PhysicalOperationV3Participant} from './contract.js';
import type {PhysicalAssetReadOptions,PhysicalAssetReadScope,PhysicalAssetReadParticipant} from './asset_read_contract.js';
import {physicalOperationV3Failure as fail} from './policy.js';
const readArchive=RichAssetArchive.read,disposeArchive=RichAssetArchive.prototype.dispose;
/** Limits come from the root's private preflight snapshot, not writable facade
 * fields or an incoming file's advertised policy. */
function limits(input:PhysicalOperationV3Participant){
 return checkRichAssetLimits(input.family==='original'||input.family==='generation'?input.recovery.limits:input.family==='independent-local'||input.family==='independent-delivery'?input.options.recovery.limits:input.options.limits);
}
export async function readPhysicalOperationV3Assets<T>(s:PhysicalOperationV3Custody,held:()=>void,verifyRoot:()=>Promise<void>,input:PhysicalAssetReadOptions,visit:(scope:PhysicalAssetReadScope)=>Promise<T>):Promise<T>{
 if(s.pending||s.record.phase!=='operational'||s.children.some(child=>!child.live))throw fail('physical_operation_v3_restore');
 const authority=participantAuthority(input.checkAuthority),signal=input.signal,read=borrowCompleteNativeRead(s.children.map(child=>child.live!));let observation:OperationalReadCancellation|undefined,prepared=false,closed=false;
 const current=()=>{held();s.local();if(closed||s.life.released||s.archiveDisposed)throw fail('physical_operation_v3_closed');observation?.check(()=>fail('physical_operation_v3_aborted'));if(prepared)read.checkCurrent();},check=()=>{current();authority();current();};
 try{
  // Construction above reserved every real parent without an authority hook.
  observation=new OperationalReadCancellation(signal);await read.prepare(check);prepared=true;check();const integrity=prepareArchiveIntegrity({wasm:s.options.wasm,checkAuthority:check});await verifyRoot();await read.verify();check();
  const source=frozen({operationDatabase:s.database,catalogDatabase:s.held.database,catalog:s.held.state.selection,intentSha256:await integrity.digest(new Blob([JSON.stringify(s.record)]))});
  const files=await read.captureUploads(512*1024*1024),participants:PhysicalAssetReadParticipant[]=[];
  for(const selected of s.children){const id=selected.selected.target.id,native=read.participants.find(row=>row.id===id)?.native,file=files.find(row=>row.id===id)?.file,sourceDatabase=selected.selected.target.namespaces.find(row=>row.role==='uploads')?.database;if(!native||!file||!sourceDatabase)throw fail('physical_operation_v3_diverged');const policy=limits(selected.selected.input),archive=await readArchive.call(RichAssetArchive,file,{limits:policy,...(signal?{signal}:{})});try{check();}finally{disposeArchive.call(archive);}
   const document={kind:native.document.kind,sha256:await integrity.digest(new Blob([native.document.checkpointJson()]))},review=native.review.kind==='absent'?{kind:'absent' as const}:native.review.kind==='unselected'?{kind:'unselected' as const,nativeKind:native.review.nativeKind}:{kind:native.review.kind,sha256:await integrity.digest(new Blob([native.review.checkpointJson()]))};
   participants.push(frozen({id,family:selected.selected.target.family,sourceDatabase,native:{document,review},limits:policy,uploads:file,uploadsSha256:await integrity.digest(file)}));check();
  }
  participants.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);const chosen=new Set(participants.map(row=>row.id)),scope:PhysicalAssetReadScope=Object.freeze({source,namespaces:Object.freeze([s.database,s.held.database,...s.record.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))]),participants:Object.freeze(participants),unreconciledParticipants:Object.freeze(s.held.state.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id)),check,digest:integrity.digest});
  check();const result=await visit(scope);check();await verifyRoot();await read.verify();const after=await read.captureUploads(512*1024*1024);for(const row of participants){const file=after.find(value=>value.id===row.id)?.file;if(!file||await integrity.digest(file)!==row.uploadsSha256)throw fail('physical_operation_v3_diverged');check();}check();return result;
 }finally{try{await read.close();}finally{closed=true;observation?.close();}}
}
