/** One distinct intent store; immutable physical source databases are never upgraded. */
import {physicalStageFailure as fail} from "./policy.js";
export const physicalStageStore="physical_room_stage_state";
export function physicalStageSchema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].join(",")!==physicalStageStore)throw fail("physical_stage_diverged");}
export function physicalStageShape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail("physical_stage_diverged");}
