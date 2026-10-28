/** Closed preview DATA admission; reflection runs only while the actual
 * attempt is already reserved against reentry. */
import {fields,integer,hash,immutable,fail} from '../native_room_union_run/policy.js';
import {unionRunIdentity,MAX_UNION_RUN_EVENTS} from '../native_room_union_run/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import type {ColdNativeRoomUnionExecutionChoice} from './contract.js';
export function coldNativeRoomUnionExecutionChoice(input:unknown):ColdNativeRoomUnionExecutionChoice{const row=fields(input,['format','formatVersion','identity','head','original']),head=fields(row['head'],['sequence','sha256']);if(row['format']!=='breditor/cold-native-room-union-execution-choice'||row['formatVersion']!==1)throw fail('room_union_run_policy');return immutable({format:'breditor/cold-native-room-union-execution-choice',formatVersion:1,identity:unionRunIdentity(row['identity']),head:{sequence:integer(head['sequence'],MAX_UNION_RUN_EVENTS-1),sha256:hash(head['sha256'])},original:selectedRoomCurrentSelection(row['original'])});}
