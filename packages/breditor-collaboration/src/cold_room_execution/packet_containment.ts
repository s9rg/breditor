/** Reopened storage can acknowledge a captured pending record. Compare packet
 * CONTENT, not save-slot labels. Every actual variant must conserve its whole
 * rows in the retained output, or be an exact already-admitted captured variant.
 * Timestamps and facade revisions never order decisions. This is not a merge. */
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {originalReferenceNativeStates} from '../persistence/original_record_reference_capture.js';
import type {OriginalNativeRecords} from '../persistence/original_record_read.js';
import type {PersistentPairedMetadata} from '../persistence/paired_record_read.js';
import {generationReferenceRecordStates} from '../generation_source/record_reference_capture.js';
import type {GenerationRecordMetadata} from '../persistence/generation_record_read.js';
import {checkGenerationRecords} from '../generation_source/validate_records.js';
import type {SharedGenerationSourceIdentity} from '../generation_source/contract.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import type {IndependentOperationJournalIdentity} from '../independent_operation/cut_intent.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {verifyRetainedReconstructionPackets} from '../selected_native_reconstruction/retained_packets.js';
import type {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {fields} from '../native_room_execution/policy.js';
import {coldSourceRequiresReconciliation} from './failure.js';
import type {SharedSegmentedRetainedRecovery} from '../segmented_relay/retained_contract.js';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),refuse=()=>{throw coldSourceRequiresReconciliation();};
const source=(record:unknown)=>fields(fields(record,['parent','source'])['source'],['format','formatVersion'],['native','versions','suggestions','revisions','identity','records','original','snapshot','live','retainedReferences','input','inputKind','inputBindings']);
function variants(raw:unknown):readonly unknown[]{if(raw===null)return[null];const row=raw as {committed:unknown;pending:unknown;live:unknown};return[row.committed,...(row.pending===null?[]:[row.pending]),row.live];}
/** Pure exact captured-state membership, including every retry, receipt, intent
 * and conflict field. Save acknowledgement itself is not packet content. */
function captured(actual:readonly unknown[],known:readonly unknown[]):void{const values=new Set(known.map(value=>JSON.stringify(value)));if(actual.some(value=>!values.has(JSON.stringify(value))))refuse();}
const paired=(raw:unknown)=>originalReferenceNativeStates(raw as OriginalNativeRecords|PersistentPairedMetadata).map(row=>{if(!row.paired)return null;const{documentCheckpointJson,reviewCheckpointJson,versions,...rest}=row.paired;return rest;});
function retainedPacketView(value:Parameters<typeof verifyRetainedReconstructionPackets>[0]){return{retainedBinding:value.retainedBinding,retained:value.retained,versions:value.source.versions};}
function retained(actual:readonly Parameters<typeof verifyRetainedReconstructionPackets>[0][],known:readonly Parameters<typeof verifyRetainedReconstructionPackets>[0][],output:Parameters<typeof verifyRetainedReconstructionPackets>[0]):void{
 const remembered=new Set(known.map(value=>JSON.stringify(retainedPacketView(value))));
 for(const value of actual){if(remembered.has(JSON.stringify(retainedPacketView(value))))continue;
  // Do not swallow programming/authority failures as a successful fallback.
  // This pure check throws only when whole packet conservation needs a merge.
  verifyRetainedReconstructionPackets(value,output);
 }
}
async function deliveryVariants(raw:Record<string,unknown>,factory:SharedIndependentDeliveryOptions,check:()=>void):Promise<readonly SharedIndependentDeliveryRecovery[]>{
 const snapshot=raw['snapshot'] as {current:IndependentHistoryCut|null;pending:IndependentHistoryCut|null},rows:SharedIndependentDeliveryRecovery[]=[];
 for(const cut of[snapshot.current,snapshot.pending])if(cut!==null){rows.push(await portableCutRecovery(factory,raw['identity'] as IndependentOperationJournalIdentity,cut));check();}
 rows.push(raw['live'] as SharedIndependentDeliveryRecovery);return rows;
}
export async function verifyColdCapturedPackets(id:string,current:Loaded,before:Loaded,after:Loaded,scope:RoomExecutionReadScope):Promise<void>{
 const entry=after.participant(id),aRecord=await current.records(id),bRecord=await before.records(id),rRecord=await after.records(id);scope.check();
 if(current.participant(id).family!==entry.family||before.participant(id).family!==entry.family)refuse();
 const a=source(aRecord),b=source(bRecord),r=source(rRecord);
 if(entry.family==='original'){
  for(const name of['versions','suggestions'] as const)captured(variants(a[name]),[...variants(b[name]),...variants(r[name])]);
  const revision=(value:unknown)=>value===null?null:fields(value,['format','formatVersion','scope','committed','pending','live','queue']);
  const aa=revision(a['revisions']),bb=revision(b['revisions']),rr=revision(r['revisions']);if((aa===null)!==(bb===null)||(bb===null)!==(rr===null))refuse();
  if(aa&&bb&&rr){captured(variants(aa),[...variants(bb),...variants(rr)]);captured(variants(aa['queue']),[...variants(bb['queue']),...variants(rr['queue'])]);}
  captured(paired(a['native']),[...paired(b['native']),...paired(r['native'])]);
 }else if(entry.family==='generation'){
  const identity=entry.selection.identity.source,states=(row:Record<string,unknown>)=>{if(!same(row['identity'],identity))refuse();return generationReferenceRecordStates(identity as SharedGenerationSourceIdentity,row['records'] as GenerationRecordMetadata).map(state=>checkGenerationRecords(identity,state.records).recovery);};
  if(identity.kind==='retained')retained(states(a) as SharedSegmentedRetainedRecovery[],[...states(b),...states(r)] as SharedSegmentedRetainedRecovery[],checkGenerationRecords(identity,recordLiveBasis('generation',rRecord) as Parameters<typeof checkGenerationRecords>[1]).recovery as SharedSegmentedRetainedRecovery);
 }else if(entry.family==='independent-delivery'||entry.family==='restored-graph'){
  const read=scope.reads.find(row=>row.id===id)!.read as {session:SharedIndependentDeliveryOptions},aa=await deliveryVariants(a,read.session,scope.check),bb=await deliveryVariants(b,read.session,scope.check),rr=await deliveryVariants(r,read.session,scope.check);scope.check();retained(aa,[...bb,...rr],r['live'] as SharedIndependentDeliveryRecovery);
 }
 // Local-only histories carry no retained packet store. Their immutable local
 // versions are checked by the separate actual native-continuation proof.
 scope.check();
}
