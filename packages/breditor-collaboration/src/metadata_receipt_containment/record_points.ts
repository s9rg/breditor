/** Literal current, pending, attempted and original store facts. No LIVE-only projection. */
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import {checkRecordCutSource} from '../physical_room_record_cut/manifest.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {generationReferenceRecordStates} from '../generation_source/record_reference_capture.js';
import {generationIdentity} from '../generation_source/identity.js';
import type {GenerationRecordMetadata} from '../persistence/generation_record_read.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {deliveryRetainedRecords} from '../delivery_state/retained.js';
import type {SharedSegmentedRetainedBinding} from '../segmented_relay/retained_contract.js';
import {unwrapOperationHead} from '../independent_operation/operation_head.js';
import type {IndependentOperationJournalIdentity} from '../independent_operation/cut_intent.js';
import {object,text,fail,same} from './policy.js';
export interface ReceiptRecordPoint {readonly point:string;readonly records:SegmentedRetainedRecords}
const empty=():SegmentedRetainedRecords=>({versions:null,suggestions:null,revisions:null});
function variants(input:unknown):readonly(readonly[string,unknown])[]{const r=object(input);if(!Object.hasOwn(r,'committed')||!Object.hasOwn(r,'pending')||!Object.hasOwn(r,'live'))throw fail();return[['committed',r['committed']],...(r['pending']===null?[]:[['pending',r['pending']] as const]),['live',r['live']]];}
export function metadataRecordPoints(family:RecordPayloadFamily,payload:unknown):readonly ReceiptRecordPoint[]{
 checkRecordCutSource(payload,family);const source=object(object(payload)['source']),result:ReceiptRecordPoint[]=[];
 if(family==='original'){
  for(const kind of ['versions','suggestions','revisions'] as const){const selected=kind==='suggestions'&&source['suggestions']===null&&source['revisions']!==null?object(source['revisions'])['queue']:source[kind];if(selected===null)continue;for(const[slot,value]of variants(selected)){const records=empty();records[kind]=value as never;result.push({point:kind+':'+slot,records});}}
  return result;
 }
 if(family==='generation'){
  const identity=generationIdentity(source['identity']);for(const state of generationReferenceRecordStates(identity,source['records'] as GenerationRecordMetadata)){
   const records=empty();for(const row of state.records){const kind=row.kind==='versions'?'versions':row.kind==='revisions'?'revisions':row.kind==='suggestions'?'suggestions':null;if(kind){if(records[kind]!==null)throw fail();records[kind]=JSON.parse(row.json);}}result.push({point:state.slot,records});
  }return result;
 }
 if(family==='independent-delivery'||family==='restored-graph'){
  const live=source['live'] as SharedIndependentDeliveryRecovery;if(live.format!=='breditor/shared-independent-delivery-recovery'||live.formatVersion!==1)throw fail();
  const snapshot=object(source['snapshot']),named=new Map<string,unknown>();
  for(const slot of ['current','pending'] as const)if(snapshot[slot]!==null){const cut=object(snapshot[slot]);named.set(text(cut['head']),cut);result.push({point:slot,records:deliveryCutMetadata(cut['head'],source['identity'],live.retainedBinding)});}
  if(!Array.isArray(snapshot['retained']))throw fail();for(const raw of snapshot['retained']){const row=object(raw),cut=object(row['cut']),head=text(cut['head']);if(![...named.values()].some(value=>same(value,cut)))throw fail();result.push({point:'retained:'+text(row['id']),records:deliveryCutMetadata(head,source['identity'],live.retainedBinding)});}
  result.push({point:'live',records:deliveryRetainedRecords(live.retained,live.retainedBinding)});return result;
 }
 // Unbound local families store native/local version history only. Their
 // additional server-bound records live in the metadata owner's before/current.
 if(family==='independent-local'||family==='local-operation-snapshot'||family==='local-operation-flat')return[{point:'unbound-native-source',records:empty()}];
 throw fail();
}
function deliveryCutMetadata(head:unknown,identity:unknown,binding:SharedSegmentedRetainedBinding):SegmentedRetainedRecords{
 const source=object(JSON.parse(unwrapOperationHead(text(head),identity as IndependentOperationJournalIdentity)));
 if(source['format']!=='breditor/shared-independent-delivery-head'||source['formatVersion']!==1||!same(source['retainedBinding'],binding))throw fail();
 return deliveryRetainedRecords(source['retained'],binding);
}
/** Original participant records have no new framing or inferred defaults. */
export function participantMetadataRecords(rows:readonly {kind:string;json:string}[]):SegmentedRetainedRecords{
 const result=empty();for(const row of rows){const kind=row.kind==='versions'||row.kind==='version-catalog'?'versions':row.kind==='revisions'||row.kind==='suggestion-revisions'?'revisions':row.kind==='suggestions'?'suggestions':null;if(kind){if(result[kind]!==null)throw fail();result[kind]=JSON.parse(row.json);}}return result;
}
