import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {SharedRelayAssets} from '../../../packages/breditor-collaboration/dist/relay/assets.js';
import {SharedServerLogGenerationRecoveryHost} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {LocalMetadataRasterArchive} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/raster_archive.js';
import {LocalMetadataRecoverableRasterArchive} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/recoverable_raster_archive.js';
import type {LocalMetadataRecoverableBundle,LocalMetadataRecoverableInspection} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/recoverable_contract.js';
declare const owner:SelectedLocalMetadataDelivery,host:SharedServerLogGenerationRecoveryHost,transport:SharedRelayAssets,bundle:LocalMetadataRecoverableBundle,read:LocalMetadataRecoverableInspection,v1:LocalMetadataRasterArchive,v2:LocalMetadataRecoverableRasterArchive;
const original:1=v1.metadata().formatVersion,current:2=v2.metadata().formatVersion;void original;void current;
void owner.captureRecoverableAssets(host,transport).then(result=>{
 if(result.kind==='ready')void owner.inspectRecoverableAssets(result.bundle);
 else{
  // @ts-expect-error Incomplete dependencies cannot supply a partial complete bundle.
  void result.bundle;
 }
});
if(read.recordedAvailability.kind==='pending')void read.recordedAvailability.provider.missing;
// @ts-expect-error V2 cannot be relabeled as the original V1 complete provider-checked scope.
void owner.inspectMaterializedAssets(bundle);
// @ts-expect-error Recoverable bytes are not a server upload receipt.
read.acknowledge();
// @ts-expect-error No fresh host authority is created by old provider data.
read.recordedAvailability.checkAssets({references:[],uploads:[]});
// @ts-expect-error The complete payload set is immutable.
read.rasters.payloads.pop();
