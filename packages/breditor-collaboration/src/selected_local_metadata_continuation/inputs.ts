/** Closed DATA/configuration admission. This parser supplies no target witness,
 * source, actor, receipt or serving authority; the actual coordinator admits
 * its genuine target before invoking it. */
import type {SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {MetadataContinuationDestinations,MetadataContinuationChoice} from './contract.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {detachLocalMetadataBundle} from '../selected_local_metadata_delivery/bundle.js';
import {continuationChoice,fail} from './policy.js';
export interface MetadataContinuationInspectionInput extends MetadataContinuationDestinations{readonly origin:LocalMetadataRoomBundle;readonly host:SharedServerLogGenerationDeliveryRecoveryHost;readonly inventory:SharedServerLogGenerationParticipantInventory;readonly checkAuthority:()=>void}
export interface MetadataContinuationInput extends MetadataContinuationInspectionInput{readonly expected:MetadataContinuationChoice;readonly approve:(choice:MetadataContinuationChoice)=>boolean|Promise<boolean>}
export function readMetadataContinuationInputs(raw:MetadataContinuationInspectionInput|MetadataContinuationInput,run:boolean){const r=fields(raw,['database','preparationDatabase','reviewDatabase','metadataDatabase','origin','host','inventory','checkAuthority',...(run?['expected','approve']:[])]),authority=participantAuthority(r['checkAuthority'] as ()=>void),names={database:database(r['database']),preparationDatabase:database(r['preparationDatabase']),reviewDatabase:database(r['reviewDatabase']),metadataDatabase:database(r['metadataDatabase'])},origin=detachLocalMetadataBundle(r['origin']),host=r['host'] as SharedServerLogGenerationDeliveryRecoveryHost,inventory=r['inventory'] as SharedServerLogGenerationParticipantInventory,expected=run?continuationChoice(r['expected']):undefined,approve=r['approve'] as MetadataContinuationInput['approve'];if(run&&typeof approve!=='function')throw fail();if(new Set(Object.values(names)).size!==4)throw fail();return{...names,origin,host,inventory,authority,expected,approve};}
