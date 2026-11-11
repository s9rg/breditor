/** Keep ordinary restore-origin admission strict. A separate, same-visit proof
 * authenticates the complete sealed path before inspecting a handover capture. */
import {fields} from '../physical_room_record_cut/policy.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {deliveryControlSelection} from '../generation_delivery_control/identity.js';
import type {SharedServerLogGenerationDeliveryRecoveryControlSelection} from '../generation_delivery_control/contract.js';
import {generationDeliveryPathRecoveryHostPort,type SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import {handoverDeliveryPathSelection,type SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';
import {containsOrderedDeliveryCuts,continuesSealedDeliverySelection,handoverDeliveryCuts} from '../generation_delivery_path_control/retained_cuts.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
declare const brand:unique symbol;
export interface RecordedBaseHandoverInspection {readonly [brand]:true}
const visits=new WeakMap<RecordedBaseHandoverInspection,{
 path:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection['path'];
 recorded:SharedServerLogGenerationDeliveryRecoveryControlSelection;
 check:()=>void;
}>();
/** The proof expires with this finite visit. Detached path JSON and copied
 * proofs cannot admit a changed restore origin or grant a provider read.
 * A retained capture can name its original controller when a fresh process
 * proves the same sealed lineage and retains the exact recorded predecessor. */
export async function withRecordedBaseHandoverInspection<T>(
 host:SharedServerLogGenerationDeliveryPathRecoveryHost,
 signal:AbortSignal|undefined,
 check:()=>void,
 visit:(proof:RecordedBaseHandoverInspection)=>Promise<T>,
 recordedPath?:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection,
):Promise<T>{
 const port=generationDeliveryPathRecoveryHostPort(host),live=port.handover;if(!live)throw fail();
 const guard=()=>{check();port.guard(signal);check();};guard();
 const recorded=recordedPath===undefined?live:handoverDeliveryPathSelection(recordedPath);
 if(!continuesSealedDeliverySelection(recorded,live))throw fail();
 await port.check(signal);guard();
 const proof=Object.freeze({}) as RecordedBaseHandoverInspection;
 visits.set(proof,{path:live.path,recorded:recorded.current.current,check:guard});
 try{const result=await visit(proof);guard();await port.check(signal);guard();return result;}
 finally{visits.delete(proof);}
}
/** Return only the recorded provider selection; actual Native/provider checks
 * remain mandatory in the caller. No saved receipt or selection mints a proof. */
export function recordedBaseProviderSelection(input:unknown,catalog:PhysicalRoomCatalogV3Metadata,handover?:RecordedBaseHandoverInspection){
 const control=fields(input,['kind','selection']);
 if(control['kind']==='source'){
  if(handover)throw fail();
  const selected=generationControlSelection(control['selection']);
  if(!same(selected.source.origin,catalog.origin.identity)||!same(selected.source.server,catalog.current.server.identity)||!same(selected.source.participants,catalog.current.participants.identity))throw fail();
  return selected;
 }
 if(control['kind']!=='native-continuation')throw fail();
 const selected=deliveryControlSelection(control['selection']);
 if(handover){
  const held=visits.get(handover);if(!held)throw fail();held.check();
  if(!same(selected,held.recorded))throw fail();
  const origin=catalog.origin.identity,current=catalog.current.server.identity;
  if(!containsOrderedDeliveryCuts(handoverDeliveryCuts(held.path),same(origin,current)?[origin]:[origin,current]))throw fail();
  held.check();
 }else if(!same(selected.continuation.previous,catalog.current.server.identity)||!same(selected.continuation.current.origin,catalog.origin.identity))throw fail();
 return selected.current;
}
