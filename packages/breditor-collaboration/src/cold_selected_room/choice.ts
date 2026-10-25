/** Exact outside choice admission before any host decision or storage write. */
import {fields,database,fail} from '../physical_room_asset_adoption/policy.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {ColdSelectedRoomChoice} from './contract.js';
export function coldSelectedRoomChoice(value:unknown):ColdSelectedRoomChoice{
 const r=fields(value,['format','formatVersion','basis','current','intentDatabase']);if(r['format']!=='breditor/cold-selected-room-choice'||r['formatVersion']!==1)throw fail('asset_adoption_policy');
 return frozen({format:'breditor/cold-selected-room-choice',formatVersion:1,basis:selectedRoomCurrentSelection(r['basis']),current:selectedRoomCurrentSelection(r['current']),intentDatabase:database(r['intentDatabase'])});
}
