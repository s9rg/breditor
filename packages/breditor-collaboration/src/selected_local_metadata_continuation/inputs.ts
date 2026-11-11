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
import {continuationChoice,equal,fail} from './policy.js';
import {generationDeliveryPathRecoveryHostPort} from '../generation_delivery_path_control/host.js';
import {handoverMetadataContinuationChoice} from './handover_choice.js';
import type {HandoverMetadataContinuationInspectionInput,HandoverMetadataContinuationInput} from './handover_contract.js';
export interface MetadataContinuationInspectionInput extends MetadataContinuationDestinations{readonly origin:LocalMetadataRoomBundle;readonly host:SharedServerLogGenerationDeliveryRecoveryHost;readonly inventory:SharedServerLogGenerationParticipantInventory;readonly checkAuthority:()=>void}
export interface MetadataContinuationInput extends MetadataContinuationInspectionInput{readonly expected:MetadataContinuationChoice;readonly approve:(choice:MetadataContinuationChoice)=>boolean|Promise<boolean>}
const commonFields=['database','preparationDatabase','reviewDatabase','metadataDatabase','origin','inventory','checkAuthority'];

function common(row:Record<string,unknown>){
 const authority=participantAuthority(row['checkAuthority'] as ()=>void);
 const names={
  database:database(row['database']),
  preparationDatabase:database(row['preparationDatabase']),
  reviewDatabase:database(row['reviewDatabase']),
  metadataDatabase:database(row['metadataDatabase']),
 };
 if(new Set(Object.values(names)).size!==4)throw fail();
 const origin=detachLocalMetadataBundle(row['origin']);
 const inventory=row['inventory'] as SharedServerLogGenerationParticipantInventory;
 return {...names,origin,inventory,authority};
}

export function readMetadataContinuationInputs(raw:MetadataContinuationInspectionInput|MetadataContinuationInput,run:boolean){
 const row=fields(raw,[...commonFields,'host',...(run?['expected','approve']:[])]);
 const input=common(row);
 const host=row['host'] as SharedServerLogGenerationDeliveryRecoveryHost;
 const expected=run?continuationChoice(row['expected']):undefined;
 const approve=row['approve'] as MetadataContinuationInput['approve'];
 if(run&&typeof approve!=='function')throw fail();
 return {...input,host,expected,approve};
}

export function readHandoverMetadataContinuationInputs(raw:HandoverMetadataContinuationInspectionInput|HandoverMetadataContinuationInput,run:boolean){
 const row=fields(raw,[...commonFields,'path',...(run?['expected','approve']:[])]);
 const path=row['path'] as HandoverMetadataContinuationInspectionInput['path'];
 const port=generationDeliveryPathRecoveryHostPort(path);
 const handover=port.handover;
 if(!handover)throw fail();
 const input=common(row);
 const expected=run?handoverMetadataContinuationChoice(row['expected']):undefined;
 const approve=row['approve'] as HandoverMetadataContinuationInput['approve'];
 if(run&&typeof approve!=='function')throw fail();
 if(expected&&!equal(expected.handover,handover))throw fail('metadata_continuation_stale');
 return {...input,path,port,handover,expected,approve};
}
