/** Genuine generation origin/current admission. No physical ancestor adapter
 * or relabeled host/report is accepted, even when visible documents match. */
import {generationRecoveryHostPort,type SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import type {SelectedGenerationProviderRead} from './generation_contract.js';
import {projectSelectedRoomProvider} from '../selected_room_provider/projection.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail} from '../physical_room_asset_adoption/policy.js';
export function selectedGenerationProvider(host:SharedServerLogGenerationRecoveryHost,catalog:PhysicalRoomCatalogV3Metadata,record:RoomAssetAdoptionRecord){
 const port=generationRecoveryHostPort(host),source=port.selection.source;
 if(JSON.stringify(source.origin)!==JSON.stringify(catalog.origin.identity)||JSON.stringify(source.server)!==JSON.stringify(catalog.current.server.identity)||JSON.stringify(source.participants)!==JSON.stringify(catalog.current.participants.identity))throw fail('asset_adoption_diverged');
 return projectSelectedRoomProvider(port,record,(cut,scope,pins,provider):SelectedGenerationProviderRead=>frozen(structuredClone({format:'breditor/selected-generation-provider-read',formatVersion:1,scope:'held-current-native-selected-and-origin-whole-uploads',kind:provider!==null&&!provider.missing.length?'checked':'pending',control:port.selection,approval:cut.approval.selection,current:cut.root.selection,history:scope.history,uploads:pins,provider})));
}
