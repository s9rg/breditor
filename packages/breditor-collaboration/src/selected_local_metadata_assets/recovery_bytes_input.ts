/** Closed actual-instance capture inputs. Called only inside the owner's
 * already registered busy task; Blob hooks cannot create a reentry gap. */
import type {SharedRelayAssets} from '../relay/assets.js';
import {sharedRelayAssetReadPort} from '../relay/assets.js';
import type {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {localMetadataAvailabilityHost,type LocalMetadataAssetAvailabilityHost} from './availability_host.js';
import {localMetadataMaterializationLimits} from './materialized_bundle.js';
import {prepareRecoveryServerInputs} from './recovery_server_inputs.js';
import type {LocalMetadataRecoveryBytesInput} from './recovery_bytes_contract.js';
export function prepareLocalMetadataRecoveryBytesInput(input:LocalMetadataRecoveryBytesInput){
 const row=fields(input,['host','transport','server','inventory'],['limits']),host=row['host'] as LocalMetadataAssetAvailabilityHost,transport=row['transport'] as SharedRelayAssets,port=localMetadataAvailabilityHost(host);sharedRelayAssetReadPort(transport);
 const selected=prepareRecoveryServerInputs(row['server'] as SharedServerLogGenerationRoomArchive,row['inventory'] as SharedServerLogGenerationParticipantInventory,port.control),limits=localMetadataMaterializationLimits(row['limits']===undefined?{}:{limits:row['limits'] as NonNullable<LocalMetadataRecoveryBytesInput['limits']>});
 return Object.freeze({host,transport,selected,options:Object.freeze({limits})});
}
