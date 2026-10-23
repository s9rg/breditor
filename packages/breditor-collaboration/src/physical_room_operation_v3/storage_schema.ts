/** Intent has its own absent-only schema; existing catalog stores never change. */
import {physicalOperationV3Failure as fail} from './policy.js';
export const physicalOperationV3Store='physical_room_catalog_operation_v3';
export function checkOperationV3Schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].join(',')!==physicalOperationV3Store)throw fail('physical_operation_v3_diverged');}
export function checkOperationV3Store(store:IDBObjectStore):void{if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail('physical_operation_v3_diverged');}
