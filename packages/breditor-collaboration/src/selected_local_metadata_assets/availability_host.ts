/** Actual controller brands only. A newer server must prove native
 * continuation from the archive's selected server; it cannot be relabeled as
 * the old source or admitted merely because it has the same room name. */
import {generationRecoveryHostPort,type SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import {generationDeliveryRecoveryHostPort,type SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import {fail} from './error.js';
export type LocalMetadataAssetAvailabilityHost=SharedServerLogGenerationRecoveryHost|SharedServerLogGenerationDeliveryRecoveryHost;
export function localMetadataAvailabilityHost(host:LocalMetadataAssetAvailabilityHost){
 let source:ReturnType<typeof generationRecoveryHostPort>|undefined;
 try{source=generationRecoveryHostPort(host as SharedServerLogGenerationRecoveryHost);}catch{/* Try the other actual private controller brand; never a supplied port. */}
 if(source){const port=source;return Object.freeze({control:Object.freeze({kind:'source' as const,selection:port.selection}),check:port.check,checkAssets:port.checkAssets,readRaster:port.readRaster,admit(catalog:PhysicalRoomCatalogV3Metadata){const selected=port.selection.source;if(!equal(selected.origin,catalog.origin.identity)||!equal(selected.server,catalog.current.server.identity)||!equal(selected.participants,catalog.current.participants.identity))throw fail('local_metadata_assets_state');}});}
 const port=generationDeliveryRecoveryHostPort(host as SharedServerLogGenerationDeliveryRecoveryHost);
 return Object.freeze({control:Object.freeze({kind:'native-continuation' as const,selection:port.selection}),check:port.check,checkAssets:port.checkAssets,readRaster:port.readRaster,admit(catalog:PhysicalRoomCatalogV3Metadata){const continuation=port.selection.continuation;if(!equal(continuation.previous,catalog.current.server.identity)||!equal(continuation.current.origin,catalog.origin.identity)||!equal(continuation.current,port.selection.current.source))throw fail('local_metadata_assets_state');}});
}
