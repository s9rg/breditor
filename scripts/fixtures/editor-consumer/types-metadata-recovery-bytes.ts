import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {LocalMetadataRecoveryBytesInput,LocalMetadataRecoveryBytesBundle,LocalMetadataRecoveryBytesInspection} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/recovery_bytes_contract.js';
declare const owner:SelectedLocalMetadataDelivery,input:LocalMetadataRecoveryBytesInput,bundle:LocalMetadataRecoveryBytesBundle,read:LocalMetadataRecoveryBytesInspection;
void owner.captureRecoveryBytes(input).then(value=>{
 if(value.kind==='ready')void owner.inspectRecoveryBytes(value.bundle);
 else{
  // @ts-expect-error A Pending capture cannot return a partial complete server bundle.
  void value.bundle;
 }
});
void owner.inspectRecoveryBytes(bundle).then(value=>{
 const scope:'native-client-cut-and-recorded-server-byte-selection'=value.scope;void scope;
 // @ts-expect-error Admitted archive bytes do not grant a live serving role.
 value.activate();
 // @ts-expect-error Server byte integrity is not browser-side Native server replay.
 value.server.nativeReplayed;
});
// @ts-expect-error Copied reader methods are not the actual selected server reader.
void owner.captureRecoveryBytes({...input,server:{file:()=>bundle.server.file,identity:()=>bundle.server.identity}});
// @ts-expect-error A caller cannot supply the digest module used by a genuine source owner.
void owner.captureRecoveryBytes({...input,wasm:{}});
// @ts-expect-error A historical control selection is not a current authenticated host.
void owner.captureRecoveryBytes({...input,host:read.recoverable.recordedAvailability.control});
// @ts-expect-error No whole-room writer admission is returned by inspection.
read.createDelivery();
