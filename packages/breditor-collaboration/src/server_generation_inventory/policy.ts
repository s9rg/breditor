/** Exact native physical-family ceilings, not changes to original single-log readers. */
import {SharedRoomParticipantInventoryError,MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES,invalid} from "../room_participant_inventory/policy.js";
export const MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES=MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES+128*1024;
export const MAX_SHARED_SERVER_LOG_GENERATION_RECORDS=64*4096;
export const closed=()=>new SharedRoomParticipantInventoryError("inventory_closed","The generation inventory is disposed or was not admitted by this SDK");
/** Exact keys rather than joining names: a comma in a foreign field cannot stand for two fields. */
export function generationInventoryObject(value:unknown,fields:string):Record<string,unknown>{const names=fields.split(",");if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))throw invalid();return value as Record<string,unknown>;}
