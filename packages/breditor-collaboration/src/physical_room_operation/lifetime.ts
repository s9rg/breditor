/** Fresh bounded digest and authority, tied to the actual retained IndexedDB/lock context. */
import {prepareArchiveIntegrity} from "../archive_integrity/context.js";
import type {SharedArchiveIntegrityOptions} from "../archive_integrity/contract.js";
import {physicalOperationFailure as fail} from "./policy.js";
export interface PhysicalOperationLife {closing:boolean;closed:boolean;changed:boolean;released:boolean;committed:boolean}
export function physicalOperationLifetime(options:SharedArchiveIntegrityOptions,factory:IDBFactory,locks:LockManager){
 const life:PhysicalOperationLife={closing:false,closed:false,changed:false,released:false,committed:false};
 const local=()=>{if(life.closing||life.closed||life.changed||globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail("physical_operation_closed");if(options.signal?.aborted)throw fail("physical_operation_aborted");};
 local();const context=prepareArchiveIntegrity(options),guard=()=>{local();context.guard();local();};guard();return{life,guard,local,context};
}
export function physicalOperationFence(db:IDBDatabase,life:PhysicalOperationLife):void{db.onversionchange=()=>{life.changed=true;db.close();};}
