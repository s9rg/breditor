/** Closed preview DATA admission; reflection runs only while the actual
 * attempt is already reserved against reentry. */
import {fields,integer,hash,immutable,fail} from '../native_room_execution/policy.js';
import {roomRunIdentity,MAX_ROOM_RUN_EVENTS} from '../native_room_execution_run/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import type {ColdRoomExecutionChoice} from './contract.js';
export function coldRoomExecutionChoice(input:unknown):ColdRoomExecutionChoice{const row=fields(input,['format','formatVersion','identity','head','original']),head=fields(row['head'],['sequence','sha256']);if(row['format']!=='breditor/cold-room-execution-choice'||row['formatVersion']!==1)throw fail('room_execution_policy');return immutable({format:'breditor/cold-room-execution-choice',formatVersion:1,identity:roomRunIdentity(row['identity']),head:{sequence:integer(head['sequence'],MAX_ROOM_RUN_EVENTS-1),sha256:hash(head['sha256'])},original:selectedRoomCurrentSelection(row['original'])});}
