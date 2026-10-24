/** Immutable evidence retention under actual namespace custody. Re-reading a
 * stored approval never replays the host's decision or creates native custody. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {fields,database,fail} from '../physical_room_asset_adoption/policy.js';
import {RoomAssetApprovalStore,type RetainedRoomAssetApproval} from './storage.js';
import {RoomAssetApprovalArchive} from './archive.js';
import {approvalSelection} from './choice.js';
import type {RoomAssetApprovalSelection,RoomAssetApprovalFile} from './contract.js';
const errors={policy:()=>fail('asset_adoption_policy'),busy:()=>fail('asset_adoption_busy'),storage:()=>fail()};
interface Scope{readonly check:()=>void;readonly digest:(file:Blob)=>Promise<string>;readonly signal:AbortSignal|undefined;readonly cleanup:RecoveryCleanupScope}
async function retained<T>(name:string,initial:RetainedRoomAssetApproval|undefined,scope:Scope,visit:(value:RetainedRoomAssetApproval)=>Promise<T>):Promise<T>{
 const factory=recoveryOpeningContext(),locks=navigator.locks;let store:RoomAssetApprovalStore|undefined,lease:RecoveryLease|undefined,opening:RecoveryOpeningCustody|undefined,ticket:ReturnType<RecoveryCleanupScope['retain']>|undefined;const current=()=>{if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('asset_adoption_policy');lease?.checkHeld();},check=()=>{current();scope.check();current();},close=async()=>{await store?.close();await lease?.close();};
 try{check();opening=await RecoveryOpeningCustody.reserve(factory,[name],close,errors);ticket=scope.cleanup.retain(()=>opening!.rollback());check();lease=await RecoveryLease.acquire(JSON.stringify(name));check();store=new RoomAssetApprovalStore(factory,name,check,scope.signal);await store.open(initial);check();const saved=await store.read();check();const result=await visit(saved);check();await close();if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('asset_adoption_policy');scope.check();if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('asset_adoption_policy');opening.complete();ticket.complete();return result;
 }catch(error){if(ticket){try{await ticket.rollback();}catch{/* Parent and global opening custody retain actual cleanup. */}}else if(opening){try{await opening.rollback();}catch{/* Actual request remains owned by the opening ledger. */}}throw error;}
}
/** Called only after matching an independent choice AND a fresh affirmative
 * decision inside the same genuine complete native/history/upload reservation. */
export function retainRoomAssetApproval(name:string,file:RoomAssetApprovalFile,scope:Scope):Promise<RoomAssetApprovalFile>{
 const selected=approvalSelection(file.selection);return retained(database(name),{format:'breditor/retained-room-asset-approval',formatVersion:1,selection:selected,file:file.file},scope,async saved=>{if(JSON.stringify(saved.selection)!==JSON.stringify(selected)||await scope.digest(saved.file)!==selected.sha256)throw fail('asset_adoption_diverged');scope.check();return Object.freeze({...file,file:saved.file,selection:saved.selection});});
}
export async function readRetainedRoomAssetApproval(name:string,provided:RoomAssetApprovalSelection,input:SharedArchiveIntegrityOptions):Promise<RoomAssetApprovalArchive>{
 const chosen=database(name),selection=approvalSelection(provided),raw=fields(input,['wasm','checkAuthority'],['signal']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),signal=raw['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal),cleanup=new RecoveryCleanupScope(()=>fail());let archive:RoomAssetApprovalArchive|undefined;
 const check=()=>{observation.check(()=>fail('asset_adoption_aborted'));authority();observation.check(()=>fail('asset_adoption_aborted'));};
 try{const context=prepareArchiveIntegrity({wasm:raw['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check});await retained(chosen,undefined,{check,digest:context.digest,signal,cleanup},async saved=>{if(JSON.stringify(saved.selection)!==JSON.stringify(selection))throw fail('asset_adoption_diverged');archive=await RoomAssetApprovalArchive.read(saved.file,selection,{wasm:context.wasm,checkAuthority:check,...(signal?{signal}:{})});check();});check();if(!archive)throw fail();return archive;}catch(error){archive?.dispose();throw error;}finally{observation.close();}
}
