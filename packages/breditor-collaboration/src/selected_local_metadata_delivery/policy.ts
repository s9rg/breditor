/** Closed nonsecret bindings and full retained data. Native replay, server
 * authentication, actual source ownership and activation remain separate. */
import {fields,integer,rows,hash} from '../physical_room_record_cut/policy.js';
import {database,identifier} from '../physical_room_asset_adoption/policy.js';
import {localChoice,emptyRelay} from '../selected_local_review_delivery/policy.js';
import {deliveryRetainedBinding,deliveryRetainedRecords} from '../delivery_state/retained.js';
import {relayProgress,forwardProgress} from '../segmented_relay/validation.js';
import {canonicalIndependentHistoryIdentity} from '../independent_history/cut.js';
import {independentRecords,checkIndependentRecords} from '../independent_source/records.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {metadataData,metadataJson,equal} from './data.js';
import {fail} from './error.js';
import {requireMetadataRecordsForward} from './forward.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {LocalReviewDeliveryChoice} from '../selected_local_review_delivery/contract.js';
import type {SharedSegmentedRetainedBinding,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import type {LocalMetadataDeliveryChoice,LocalMetadataDeliveryState,LocalMetadataDeliverySnapshot} from './contract.js';
export {metadataJson,equal} from './data.js';
export {fail,LocalMetadataDeliveryError} from './error.js';
export function metadataBinding(input:unknown,parent:LocalReviewDeliveryChoice['lanes'][number]):SharedSegmentedRetainedBinding{return deliveryRetainedBinding(metadataData(input) as SharedSegmentedRetainedBinding,emptyRelay(parent.binding).binding,parent.source.native.reviewedHistory);}
export function metadataChoice(input:unknown):LocalMetadataDeliveryChoice{
 const r=fields(input,['format','formatVersion','database','parent','lanes']);if(r['format']!=='breditor/selected-local-metadata-delivery'||r['formatVersion']!==1)throw fail('local_metadata_delivery_policy');
 const parent=localChoice(metadataData(r['parent'])),lanes=rows(r['lanes'],1024).map((value,i)=>{const row=fields(value,['id','binding','initial']),p=parent.lanes[i],initial=fields(row['initial'],['bytes','sha256']);if(!p||identifier(row['id'])!==p.id)throw fail();return{id:p.id,binding:metadataBinding(row['binding'],p),initial:{bytes:integer(initial['bytes'],1024*1024*1024,1),sha256:hash(initial['sha256'])}};});
 if(lanes.length!==parent.lanes.length)throw fail();return frozen({format:'breditor/selected-local-metadata-delivery',formatVersion:1,database:database(r['database']),parent,lanes});
}
/** First binding may retain captured local packets, never incoming assertions
 * of server publication, final decisions, accepted effects or discovery feeds.
 * Existing metadata is resumed through the full current snapshot instead. */
export function initialMetadataRecords(input:unknown,binding:SharedSegmentedRetainedBinding):SegmentedRetainedRecords{
 const r=deliveryRetainedRecords(metadataData(input),binding);
 if(r.suggestions?.retained.some(row=>row.origin!=='local'||row.publication!==null||row.decision!==null||row.intent!==null)||r.revisions?.retained.some(row=>!row.retry||row.receipt!==null||row.conflict!==null)||r.versions&&(r.versions.catalog!==null||r.versions.packets.some(row=>row.origin!=='local'||row.accepted!==null)))throw fail('local_metadata_delivery_initial');
 return r;
}
export async function metadataRecordsDigest(input:unknown,binding:SharedSegmentedRetainedBinding):Promise<{bytes:number;sha256:string}>{const records=deliveryRetainedRecords(metadataData(input),binding),text=metadataJson(records);return{bytes:new TextEncoder().encode(text).length,sha256:await segmentedDigest(text)};}
export async function metadataState(input:unknown,expected:LocalMetadataDeliveryChoice):Promise<LocalMetadataDeliveryState>{
 const r=fields(input,['format','formatVersion','choice','revision','lanes']);if(r['format']!=='breditor/selected-local-metadata-delivery-state'||r['formatVersion']!==1||!equal(metadataChoice(r['choice']),expected))throw fail();
 const lanes=[];for(const [i,value]of rows(r['lanes'],1024).entries()){
  const row=fields(value,['id','source','relay','records']),choice=expected.lanes[i],parent=expected.parent.lanes[i];if(!choice||!parent||row['id']!==choice.id)throw fail();
  const src=fields(row['source'],['format','formatVersion','identity','documentCheckpoint','reviewCheckpoint','versions']);if(src['format']!=='breditor/shared-independent-history-recovery'||src['formatVersion']!==1||!equal(canonicalIndependentHistoryIdentity(metadataData(src['identity']) as SharedIndependentHistoryRecovery['identity']),parent.source))throw fail();
  const source=await checkIndependentRecords(parent.source,independentRecords(metadataData(src) as SharedIndependentHistoryRecovery)),relay=relayProgress(metadataData(row['relay']),emptyRelay(parent.binding).binding),records=deliveryRetainedRecords(metadataData(row['records']),choice.binding);
  if(relay.document.accepted!==null||relay.document.receipt!==null)throw fail();lanes.push({id:choice.id,source,relay,records});
 }if(lanes.length!==expected.lanes.length)throw fail();return frozen({format:'breditor/selected-local-metadata-delivery-state',formatVersion:1,choice:expected,revision:integer(r['revision'],Number.MAX_SAFE_INTEGER),lanes});
}
export async function metadataSnapshot(input:unknown,choice:LocalMetadataDeliveryChoice):Promise<LocalMetadataDeliverySnapshot>{
 const r=fields(input,['before','current']),before=await metadataState(r['before'],choice),current=await metadataState(r['current'],choice);if(before.revision!==0||current.revision===0&&!equal(before,current))throw fail();
 for(let i=0;i<before.lanes.length;i++){const old=before.lanes[i]!,now=current.lanes[i]!,chosen=choice.lanes[i]!;initialMetadataRecords(old.records,chosen.binding);if(!equal(await metadataRecordsDigest(old.records,chosen.binding),chosen.initial))throw fail();forwardProgress(old.relay,now.relay);requireMetadataRecordsForward(old.records,now.records);if(old.source.versions.length>now.source.versions.length||old.source.versions.some((packet,j)=>packet!==now.source.versions[j]))throw fail();}
 return frozen({before,current});
}
