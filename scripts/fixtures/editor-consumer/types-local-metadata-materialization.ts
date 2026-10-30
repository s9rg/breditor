import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {SharedServerLogGenerationRecoveryHost} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {SharedRelayAssets} from '../../../packages/breditor-collaboration/dist/relay/assets.js';
import type {SharedRelayAssetBytes} from '../../../packages/breditor-collaboration/dist/relay/asset_types.js';
import type {LocalMetadataMaterializedBundle,LocalMetadataMaterializedInspection} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/materialization_contract.js';
declare const owner:SelectedLocalMetadataDelivery,host:SharedServerLogGenerationRecoveryHost,transport:SharedRelayAssets,bundle:LocalMetadataMaterializedBundle,read:LocalMetadataMaterializedInspection;
void transport.readBytes('sha256:'+'a'.repeat(64)).then(value=>{const bytes:SharedRelayAssetBytes|undefined=value;void bytes;});
void owner.captureMaterializedAssets(host,transport,{limits:{maxFileBytes:1024}}).then(value=>{
 if(value.kind==='ready')void owner.inspectMaterializedAssets(value.bundle);
 else{
  void value.availability;void value.missing;
  // @ts-expect-error A Pending capture never returns a partial complete bundle.
  void value.bundle;
 }
});
void owner.inspectMaterializedAssets(bundle,{limits:{maxStoredBytes:1024}}).then(value=>{
 const scope:'native-client-cut-and-recorded-raster-payloads'=value.scope;void scope;
 // @ts-expect-error An old provider record cannot activate a room.
 value.activate();
 // @ts-expect-error Inspection data cannot act as a current authenticated host.
 value.recordedAvailability.checkAssets({references:[],uploads:[]});
 // @ts-expect-error A caller cannot remove admitted payloads.
 value.rasters.payloads.pop();
});
// @ts-expect-error A copied DTO is not the actual branded raster transport.
void owner.captureMaterializedAssets(host,{readBytes:()=>transport.readBytes('x')});
// @ts-expect-error Complete capture cannot omit original upload archives.
void owner.captureMaterializedAssets(host,transport,{includeOrigin:false});
// @ts-expect-error A raw raster file lacks the required original reference bundle.
void owner.inspectMaterializedAssets(bundle.rasters);
// @ts-expect-error Historical inspection is not an upload receipt.
void read.acknowledge();
