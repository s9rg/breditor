/** SDK-private authenticated availability while actual current native parents,
 * selected queues and inherited whole-origin stores remain held. No data report
 * selects a store, settles a queue, covers a registration or activates a room. */
import {physicalRecoveryHostPort,type SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail} from '../physical_room_asset_adoption/policy.js';
import type {SelectedRoomProviderRead} from './contract.js';
import {projectSelectedRoomProvider} from './projection.js';
/** Resolve the actual brand and complete independent host pin before read
 * callbacks. A catalog cannot relabel the host's separately selected local origin. */
export function selectedRoomProvider(host:SharedPhysicalRoomRecoveryHost,catalog:PhysicalRoomCatalogV3Metadata,record:RoomAssetAdoptionRecord){
 const port=physicalRecoveryHostPort(host),source=port.selection.source;
 if(JSON.stringify(source.ancestor)!==JSON.stringify(catalog.origin.identity)||JSON.stringify(source.server)!==JSON.stringify(catalog.current.server.identity)||JSON.stringify(source.participants)!==JSON.stringify(catalog.current.participants.identity))throw fail('asset_adoption_diverged');
 return projectSelectedRoomProvider(port,record,(cut,scope,pins,provider):SelectedRoomProviderRead=>frozen(structuredClone({format:'breditor/selected-room-provider-read' as const,formatVersion:1 as const,scope:'held-current-native-selected-and-origin-whole-uploads' as const,kind:provider!==null&&!provider.missing.length?'checked' as const:'pending' as const,control:port.selection,approval:cut.approval.selection,current:cut.root.selection,history:scope.history,uploads:pins,provider})));
}
