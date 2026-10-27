/** Bounded serialized inputs retain exact bytes while existing codecs admit all original records. */
import{MAX_INDEPENDENT_DELIVERY_RECOVERY_BYTES,type SharedIndependentDeliveryRecovery}from'../independent_delivery/contract.js';
import{independentDeliveryIdentity}from'../independent_delivery/identity.js';
import{checkIndependentDeliveryRecords,independentDeliveryRecords}from'../independent_delivery_source/records.js';
import{unionFailure as fail,unionFields as fields}from'./policy.js';
export async function readDeliveryUnionInput(json:unknown,check:()=>void):Promise<SharedIndependentDeliveryRecovery>{
 if(typeof json!=='string'||!json.length||new TextEncoder().encode(json).length>MAX_INDEPENDENT_DELIVERY_RECOVERY_BYTES)throw fail('independent_delivery_union_input');
 const raw=fields(JSON.parse(json),['format','formatVersion','source','relay','retainedBinding','retained']);
 if(raw['format']!=='breditor/shared-independent-delivery-recovery'||raw['formatVersion']!==1)throw fail();
 const source=fields(raw['source'],['format','formatVersion','identity','documentCheckpoint','reviewCheckpoint','versions']);
 if(source['format']!=='breditor/shared-independent-history-recovery'||source['formatVersion']!==1)throw fail();
 const relay=fields(raw['relay'],['binding','document','review','reviewReceipt']);
 const identity=independentDeliveryIdentity(source['identity'] as SharedIndependentDeliveryRecovery['source']['identity'],relay['binding'],raw['retainedBinding']);
 const recovery=raw as unknown as SharedIndependentDeliveryRecovery,admitted=await checkIndependentDeliveryRecords(identity,independentDeliveryRecords(recovery));check();
 // Projection may not erase extra fields, reorder or relabel malformed nested records.
 if(JSON.stringify(admitted)!==JSON.stringify(recovery))throw fail('independent_delivery_union_input');return admitted;
}
