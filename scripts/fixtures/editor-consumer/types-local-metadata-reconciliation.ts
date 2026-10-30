import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {LocalMetadataReconciliationInput,LocalMetadataReconciliationRead} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/reconciliation_contract.js';
declare const owner:SelectedLocalMetadataDelivery,input:LocalMetadataReconciliationInput,read:LocalMetadataReconciliationRead;
void owner.captureReconciliation(input).then(value=>{
 const scope:'same-held-native-room-local-review-bindings-all-metadata-and-provider'=value.scope;void scope;
 const kind:'checked'|'pending'=value.kind;void kind;
 for(const item of value.pending)if(item.kind==='head'){
  const lane:'document'|'review'=item.requirement.lane;void lane;
 }
 // @ts-expect-error Reconciliation does not grant serving or activate a room.
 value.activate();
 // @ts-expect-error A read cannot mutate either a client queue or metadata.
 value.flush();
});
// @ts-expect-error A saved controller selection is not an authenticated owner.
void owner.captureReconciliation({...input,host:read.legacy.native.control});
// @ts-expect-error A copied inventory facade cannot supply its private lifetime.
void owner.captureReconciliation({...input,inventory:{file:()=>new Blob(),identity:()=>read.legacy.native.inventory}});
// @ts-expect-error The actual source's integrity runtime cannot be supplied here.
void owner.captureReconciliation({...input,wasm:{}});
// @ts-expect-error A data report cannot reopen a native writer.
read.createDelivery();
