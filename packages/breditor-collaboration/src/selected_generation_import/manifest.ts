/** Canonical detached manifest/choice DATA. A stored choice cannot donate
 * live owner resources, an operator endpoint or an affirmative decision. */
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {generationAcceptedChoices} from '../generation_recovery_control/accepted_request.js';
import {MAX_SERVER_GENERATION_RECOVERY_ACCEPTED_BYTES} from '../generation_recovery_control/accepted_contract.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,rows,integer,hash,fail,MAX_GENERATION_NATIVE_IMPORT_BYTES,MAX_GENERATION_NATIVE_IMPORT_PAGES} from './policy.js';
import type {SelectedGenerationNativeImportSelection,SelectedGenerationNativeImportChoice,SelectedGenerationNativeImportManifest} from './contract.js';
export function generationNativeImportSelection(value:unknown):SelectedGenerationNativeImportSelection{const r=fields(value,['format','formatVersion','bytes','sha256']);if(r['format']!=='breditor/selected-generation-native-import-selection'||r['formatVersion']!==1)throw fail('generation_native_import_policy');return frozen({format:'breditor/selected-generation-native-import-selection',formatVersion:1,bytes:integer(r['bytes'],MAX_GENERATION_NATIVE_IMPORT_BYTES,1),sha256:hash(r['sha256'])});}
export function generationNativeImportChoice(value:unknown):SelectedGenerationNativeImportChoice{const r=fields(value,['format','formatVersion','database','input']);if(r['format']!=='breditor/selected-generation-native-import-choice'||r['formatVersion']!==1)throw fail('generation_native_import_policy');return frozen({format:'breditor/selected-generation-native-import-choice',formatVersion:1,database:database(r['database']),input:generationNativeImportSelection(r['input'])});}
export function generationNativeImportManifest(value:unknown):SelectedGenerationNativeImportManifest{
 const r=fields(value,['format','formatVersion','server','before','pages']);if(r['format']!=='breditor/selected-generation-native-import-input'||r['formatVersion']!==1)throw fail('generation_native_import_policy');const before=selectedRoomCurrentSelection(r['before']),pages=rows(r['pages'],MAX_GENERATION_NATIVE_IMPORT_PAGES).map(value=>{const row=fields(value,['request','bytes','sha256']);return{request:generationAcceptedChoices(row['request']),bytes:integer(row['bytes'],MAX_SERVER_GENERATION_RECOVERY_ACCEPTED_BYTES,1),sha256:hash(row['sha256'])};});if(!pages.length)throw fail();if(before.bytes+pages.reduce((n,row)=>n+row.bytes,0)>MAX_GENERATION_NATIVE_IMPORT_BYTES)throw fail('generation_native_import_budget');
 return frozen({format:'breditor/selected-generation-native-import-input',formatVersion:1,server:generationControlSelection(r['server']),before,pages});
}
