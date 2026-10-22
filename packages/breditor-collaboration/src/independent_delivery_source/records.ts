/** Closed outer shapes/bounds. Native replay and packet admission still precede real recovery. */
import type {SharedIndependentDeliveryIdentity,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {MAX_INDEPENDENT_DELIVERY_RECOVERY_BYTES} from '../independent_delivery/contract.js';
import {readIndependentDeliveryIdentity} from '../independent_delivery/identity.js';
import {independentRecordLimit,independentRecords,independentRecovery,checkIndependentRecords} from '../independent_source/records.js';
import type {SharedIndependentSourceRecord} from '../independent_source/contract.js';
import {relayProgress} from '../segmented_relay/validation.js';
import {deliveryRetainedRecords} from '../delivery_state/retained.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {generationFields} from '../generation_source/identity.js';
import {MAX_INDEPENDENT_DELIVERY_SOURCE_BYTES,MAX_INDEPENDENT_DELIVERY_SOURCE_RECORDS,type SharedIndependentDeliverySourceRecord,type SharedIndependentDeliverySourceRecordKind} from './contract.js';
import {independentDeliverySourceFailure as fail} from './admission.js';
export function independentDeliveryRecordLimit(kind:SharedIndependentDeliverySourceRecordKind,identity:SharedIndependentDeliveryIdentity):number{return kind==='document'||kind==='review'||kind==='version'?independentRecordLimit(kind,identity.history):kind==='relay'?16*1024:32*1024*1024;}
export function independentDeliveryRecords(recovery:SharedIndependentDeliveryRecovery):readonly SharedIndependentDeliverySourceRecord[]{
 const rows:SharedIndependentDeliverySourceRecord[]=[...independentRecords(recovery.source),{kind:'relay',index:0,json:JSON.stringify(recovery.relay)}];
 for(const kind of ['suggestions','revisions','versions'] as const)if(recovery.retained[kind]!==null)rows.push({kind,index:0,json:JSON.stringify(recovery.retained[kind])});return Object.freeze(rows.map(row=>Object.freeze(row)));
}
export function independentDeliveryRecovery(identityInput:SharedIndependentDeliveryIdentity,input:readonly SharedIndependentDeliverySourceRecord[]):SharedIndependentDeliveryRecovery{
 const identity=readIndependentDeliveryIdentity(identityInput);if(!Array.isArray(input)||input.length<3||input.length>MAX_INDEPENDENT_DELIVERY_SOURCE_RECORDS)throw fail();let at=0,total=0;
 const take=(kind:SharedIndependentDeliverySourceRecordKind,index=0):string=>{const row=input[at++];if(!generationFields(row,'index,json,kind')||row['kind']!==kind||row['index']!==index||typeof row['json']!=='string'||!row['json'])throw fail();const encoded=new TextEncoder().encode(row['json']);if(encoded.length>independentDeliveryRecordLimit(kind,identity)||new TextDecoder('utf-8',{fatal:true}).decode(encoded)!==row['json']||(total+=encoded.length)>MAX_INDEPENDENT_DELIVERY_SOURCE_BYTES)throw fail('independent_delivery_source_budget');return row['json'];};
 const native:SharedIndependentSourceRecord[]=[{kind:'document',index:0,json:take('document')},{kind:'review',index:0,json:take('review')}];while(input[at]?.kind==='version'){const index=native.length-2;if(index>=32)throw fail();native.push({kind:'version',index,json:take('version',index)});}
 const source=independentRecovery(identity.history,native),rawRelay=take('relay'),relay=relayProgress(JSON.parse(rawRelay),identity.binding);if(JSON.stringify(relay)!==rawRelay)throw fail();
 const retained:SegmentedRetainedRecords={suggestions:null,revisions:null,versions:null};for(const kind of ['suggestions','revisions','versions'] as const)if(identity.retained[kind]!==null)retained[kind]=JSON.parse(take(kind));if(at!==input.length)throw fail();
 const admitted=deliveryRetainedRecords(retained,identity.retained);if(JSON.stringify(retained)!==JSON.stringify(admitted))throw fail();
 const recovery:SharedIndependentDeliveryRecovery={format:'breditor/shared-independent-delivery-recovery',formatVersion:1,source,relay,retainedBinding:identity.retained,retained:admitted};if(new TextEncoder().encode(JSON.stringify(recovery)).length>MAX_INDEPENDENT_DELIVERY_RECOVERY_BYTES)throw fail('independent_delivery_source_budget');return recovery;
}
export async function checkIndependentDeliveryRecords(identity:SharedIndependentDeliveryIdentity,records:readonly SharedIndependentDeliverySourceRecord[]):Promise<SharedIndependentDeliveryRecovery>{
 const recovery=independentDeliveryRecovery(identity,records);await checkIndependentRecords(identity.history,independentRecords(recovery.source));return recovery;
}
