/** Canonical detached manifest/choice DATA. A stored choice cannot donate
 * live owner resources, an operator endpoint or an affirmative decision. */
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {physicalControlSelection} from '../physical_recovery_control/identity.js';
import {physicalAcceptedChoices} from '../physical_recovery_control/accepted_request.js';
import {MAX_PHYSICAL_RECOVERY_ACCEPTED_BYTES} from '../physical_recovery_control/accepted_contract.js';
import {database} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,rows,integer,hash,fail,MAX_NATIVE_IMPORT_BYTES,MAX_NATIVE_IMPORT_PAGES} from './policy.js';
import type {SelectedNativeImportSelection,SelectedNativeImportChoice,SelectedNativeImportManifest} from './contract.js';
export function nativeImportSelection(value:unknown):SelectedNativeImportSelection{const r=fields(value,['format','formatVersion','bytes','sha256']);if(r['format']!=='breditor/selected-native-import-selection'||r['formatVersion']!==1)throw fail('native_import_policy');return frozen({format:'breditor/selected-native-import-selection',formatVersion:1,bytes:integer(r['bytes'],MAX_NATIVE_IMPORT_BYTES,1),sha256:hash(r['sha256'])});}
export function nativeImportChoice(value:unknown):SelectedNativeImportChoice{const r=fields(value,['format','formatVersion','database','input']);if(r['format']!=='breditor/selected-native-import-choice'||r['formatVersion']!==1)throw fail('native_import_policy');return frozen({format:'breditor/selected-native-import-choice',formatVersion:1,database:database(r['database']),input:nativeImportSelection(r['input'])});}
export function nativeImportManifest(value:unknown):SelectedNativeImportManifest{
 const r=fields(value,['format','formatVersion','server','before','pages']);if(r['format']!=='breditor/selected-native-import-input'||r['formatVersion']!==1)throw fail('native_import_policy');const before=selectedRoomCurrentSelection(r['before']),pages=rows(r['pages'],MAX_NATIVE_IMPORT_PAGES).map(value=>{const row=fields(value,['request','bytes','sha256']);return{request:physicalAcceptedChoices(row['request']),bytes:integer(row['bytes'],MAX_PHYSICAL_RECOVERY_ACCEPTED_BYTES,1),sha256:hash(row['sha256'])};});if(!pages.length)throw fail();if(before.bytes+pages.reduce((n,row)=>n+row.bytes,0)>MAX_NATIVE_IMPORT_BYTES)throw fail('native_import_budget');
 return frozen({format:'breditor/selected-native-import-input',formatVersion:1,server:physicalControlSelection(r['server']),before,pages});
}
