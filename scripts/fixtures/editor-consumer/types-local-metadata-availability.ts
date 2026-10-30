import {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {SharedServerLogGenerationRecoveryHost} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {SharedServerLogGenerationDeliveryRecoveryHost} from '../../../packages/breditor-collaboration/dist/generation_delivery_control/host.js';
import type {LocalMetadataAssetAvailabilityRead} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/availability_contract.js';
import type {LocalMetadataReferenceBundle} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/room_contract.js';
declare const owner:SelectedLocalMetadataDelivery;declare const host:SharedServerLogGenerationRecoveryHost;declare const continued:SharedServerLogGenerationDeliveryRecoveryHost;declare const read:LocalMetadataAssetAvailabilityRead;
void owner.captureAssetAvailability(continued);
void owner.captureAssetAvailability(host).then(value=>{
 const reference:LocalMetadataReferenceBundle=value.references;void reference;
 if(value.availability.kind==='checked')void value.availability.provider.assets;
 // @ts-expect-error Availability DATA cannot activate a room or create an actor.
 value.activate();
 // @ts-expect-error No upload writer is returned with a read observation.
 value.availability.uploader();
 // @ts-expect-error The complete inventory is immutable.
 value.availability.uploads.pop();
});
// @ts-expect-error A controller DATA selection is not the actual host instance.
void owner.captureAssetAvailability({selection:()=>host});
// @ts-expect-error No caller option can omit old metadata or upload roles.
void owner.captureAssetAvailability(host,{includeOrigin:false});
// @ts-expect-error Checked always requires an actual provider read.
const falseReady:LocalMetadataAssetAvailabilityRead={...read,kind:'checked',provider:null};void falseReady;
