
/** Genuine source knowledge. Parsed/copied records can never register a live
 * server check or authorize client edits, ACK installation or activation. */
import {SharedServerLogGenerationRecoveryHost,generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {SharedPhysicalRoomRecoveryHost,physicalRecoveryHostPort} from '../physical_recovery_control/host.js';
import {SharedServerLogGenerationDeliveryRecoveryHost,generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedPhysicalRecoveryControlSelection} from '../physical_recovery_control/contract.js';
import type {SelectedServerNativeDependencies} from './contract.js';
import {fail} from './policy.js';
type Selection=SharedServerLogGenerationRecoveryControlSelection|SharedPhysicalRecoveryControlSelection;
const held=new WeakMap<object,{check:()=>Promise<void>}>(),active=new WeakSet<object>();
function genuine(host:unknown){
 try{return generationRecoveryHostPort(host as SharedServerLogGenerationRecoveryHost);}catch{/* Private brand only. */}
 try{return physicalRecoveryHostPort(host as SharedPhysicalRoomRecoveryHost);}catch{/* Private brand only. */}
 try{const port=generationDeliveryRecoveryHostPort(host as SharedServerLogGenerationDeliveryRecoveryHost);return{selection:port.selection.current,check:port.check,readNativeDependencies:port.readNativeDependencies};}catch{throw fail('native_dependencies_policy');}
}
export function captureSelectedServerNativeDependencies(host:SharedServerLogGenerationRecoveryHost,signal?:AbortSignal):Promise<SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>>;
export function captureSelectedServerNativeDependencies(host:SharedPhysicalRoomRecoveryHost,signal?:AbortSignal):Promise<SelectedServerNativeDependencies<SharedPhysicalRecoveryControlSelection>>;
export function captureSelectedServerNativeDependencies(host:SharedServerLogGenerationDeliveryRecoveryHost,signal?:AbortSignal):Promise<SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>>;
export async function captureSelectedServerNativeDependencies(host:SharedServerLogGenerationRecoveryHost|SharedPhysicalRoomRecoveryHost|SharedServerLogGenerationDeliveryRecoveryHost,signal?:AbortSignal):Promise<SelectedServerNativeDependencies<Selection>>{
 const port=genuine(host);if(active.has(host))throw fail('native_dependencies_busy');active.add(host);
 try{const check=()=>port.check(signal);await check();const read=await port.readNativeDependencies(signal);await check();if(JSON.stringify(read.selection)!==JSON.stringify(port.selection))throw fail();held.set(read,{check});return read;}finally{active.delete(host);}
}
/** Server-only Native dependency evidence at this selected source, never an
 * implicit permission to advance a client or settle its pending publication. */
export async function withCheckedServerNativeDependencies<T>(read:object,visit:()=>Promise<T>):Promise<T>{const source=held.get(read);if(!source||typeof visit!=='function')throw fail('native_dependencies_policy');await source.check();const value=await visit();await source.check();return value;}
