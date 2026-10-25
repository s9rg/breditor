/** Closed, canonical bounded framing; none of the old persisted families widen. */
import {fields,integer,hash,rows,text} from '../physical_room_record_cut/policy.js';
import {recordCutSelection} from '../physical_room_record_cut/archive.js';
import {approvalSelection} from '../physical_room_asset_approval/choice.js';
import {database,identifier} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SelectedRoomCurrentSelection,SelectedRoomCurrentManifest} from './contract.js';
export const MAX_SELECTED_ROOM_CURRENT_BYTES=1024*1024*1024;
export const MAX_SELECTED_ROOM_CURRENT_HEADER_BYTES=16*1024*1024;
export const SELECTED_ROOM_CURRENT_MAGIC='BREDITOR-SELECTED-ROOM-CURRENT1\n';
export const SELECTED_ROOM_CURRENT_MIME='application/vnd.breditor.selected-room-current';
export class SelectedRoomCurrentError extends Error{constructor(readonly code:'selected_current_policy'|'selected_current_integrity'|'selected_current_budget'|'selected_current_closed'|'selected_current_aborted'){super('Retain the complete approved baseline, current source cut and selected upload state; data grants no ownership');this.name='SelectedRoomCurrentError';}}
export const fail=(code:SelectedRoomCurrentError['code']='selected_current_integrity')=>new SelectedRoomCurrentError(code);
export function selectedRoomCurrentSelection(input:unknown):SelectedRoomCurrentSelection{const r=fields(input,['format','formatVersion','bytes','sha256']);if(r['format']!=='breditor/selected-room-current-selection'||r['formatVersion']!==1)throw fail('selected_current_policy');return frozen({format:'breditor/selected-room-current-selection',formatVersion:1,bytes:integer(r['bytes'],MAX_SELECTED_ROOM_CURRENT_BYTES,1),sha256:hash(r['sha256'])});}
export function selectedRoomCurrentManifest(input:unknown):SelectedRoomCurrentManifest{
 const r=fields(input,['format','formatVersion','approval','current','uploads']);if(r['format']!=='breditor/selected-room-current'||r['formatVersion']!==1)throw fail('selected_current_policy');let previous='';const names=new Set<string>();
 const uploads=rows(r['uploads'],1024).map(value=>{const row=fields(value,['id','database','bytes','sha256']),id=identifier(row['id']),name=database(row['database']);text(id,200);if(id<=previous||names.has(name))throw fail();previous=id;names.add(name);return{id,database:name,bytes:integer(row['bytes'],MAX_SELECTED_ROOM_CURRENT_BYTES,1),sha256:hash(row['sha256'])};});if(!uploads.length)throw fail();
 const result:SelectedRoomCurrentManifest={format:'breditor/selected-room-current',formatVersion:1,approval:approvalSelection(r['approval']),current:recordCutSelection(r['current']),uploads};if(result.approval.bytes+result.current.bytes+uploads.reduce((n,row)=>n+row.bytes,0)>MAX_SELECTED_ROOM_CURRENT_BYTES)throw fail('selected_current_budget');return frozen(result);
}
