/** A separate intent store; source catalog and staging schemas never change. */
import {physicalOperationFailure as fail} from "./policy.js";
export const physicalOperationStore="physical_room_client_operation";
export function physicalOperationSchema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].join(",")!==physicalOperationStore)throw fail("physical_operation_diverged");}
export function physicalOperationShape(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail("physical_operation_diverged");}
