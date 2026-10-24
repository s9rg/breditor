/** Actual append-only namespace custody, held through byte verification and
 * actual cleanup acknowledgements. A retained cut is DATA, not approval,
 * native admission, an editable successor or an authenticated room activation. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {physicalCatalogDatabase} from '../physical_room_catalog/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {RoomRecordCutStore,type RetainedRoomRecordCut} from './storage.js';
import {PhysicalRoomRecordCutArchive,recordCutSelection} from './archive.js';
import type {PhysicalRoomRecordCutFile,PhysicalRoomRecordCutSelection} from './contract.js';
import {fields,fail} from './policy.js';
const errors={policy:()=>fail('record_cut_policy'),busy:()=>fail('record_cut_busy'),storage:()=>fail('record_cut_storage')};
export function roomRecordCutDatabase(value:unknown):string{try{return physicalCatalogDatabase(value);}catch{throw fail('record_cut_policy');}}
interface StorageRead{readonly name:string;readonly initial:RetainedRoomRecordCut|undefined;readonly check:()=>void;readonly signal:AbortSignal|undefined;readonly cleanup:RecoveryCleanupScope}
/** Internal I/O seam: an opening entry owns every actual failed handle, while
 * the genuine root additionally retains its rollback closure until drained. */
async function withRetainedCut<T>(p:StorageRead,visit:(saved:RetainedRoomRecordCut)=>Promise<T>):Promise<T>{
 const factory=recoveryOpeningContext(),locks=navigator.locks;let store:RoomRecordCutStore|undefined,lease:RecoveryLease|undefined,opening:RecoveryOpeningCustody|undefined,ticket:ReturnType<RecoveryCleanupScope['retain']>|undefined;
 const current=()=>{if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('record_cut_policy');lease?.checkHeld();},check=()=>{current();p.check();current();},closeOwned=async()=>{await store?.close();await lease?.close();};
 try{check();opening=await RecoveryOpeningCustody.reserve(factory,[p.name],closeOwned,errors);ticket=p.cleanup.retain(()=>opening!.rollback());check();lease=await RecoveryLease.acquire(JSON.stringify(p.name));check();store=new RoomRecordCutStore(factory,p.name,check,p.signal);await store.open(p.initial);check();const saved=await store.read();check();const result=await visit(saved);check();await closeOwned();
  // The namespace lease is closed now. Do not call its held check again; all
  // source/signal/context fences still must survive the REAL release await.
  if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('record_cut_policy');p.check();if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('record_cut_policy');opening.complete();ticket.complete();return result;
 }catch(error){if(ticket){try{await ticket.rollback();}catch{/* Both parent and opening ledger retain the actual failed cleanup. */}}else if(opening){try{await opening.rollback();}catch{/* Opening ledger owns pending requests even before a parent ticket exists. */}}throw error;}
}
/** Persist the complete selected bytes while the genuine full-cut source
 * reservation remains held. Idempotence means exact existing bytes, not put. */
export async function retainPhysicalRoomRecordCut(database:string,file:PhysicalRoomRecordCutFile,scope:Readonly<{check:()=>void;digest:(file:Blob)=>Promise<string>;signal:AbortSignal|undefined;cleanup:RecoveryCleanupScope}>):Promise<PhysicalRoomRecordCutFile>{
 const name=roomRecordCutDatabase(database),selection=recordCutSelection(file.selection),initial:RetainedRoomRecordCut={format:'breditor/retained-room-record-cut',formatVersion:1,selection,file:file.file};
 return withRetainedCut({name,initial,...scope},async saved=>{if(JSON.stringify(saved.selection)!==JSON.stringify(selection)||await scope.digest(saved.file)!==selection.sha256)throw fail('record_cut_integrity');scope.check();return{selection:saved.selection,file:saved.file};});
}
/** Cold data read requires an independently retained exact pin and a NEW host
 * grant/native digest. Stored phase/hash claims never authorize a successor. */
export async function readRetainedPhysicalRoomRecordCut(database:string,provided:PhysicalRoomRecordCutSelection,input:SharedArchiveIntegrityOptions):Promise<PhysicalRoomRecordCutArchive>{
 const name=roomRecordCutDatabase(database),selection=recordCutSelection(provided),raw=fields(input,['wasm','checkAuthority'],['signal']),factory=recoveryOpeningContext(),locks=navigator.locks,authority=participantAuthority(raw['checkAuthority'] as ()=>void),signal=raw['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal),cleanup=new RecoveryCleanupScope(()=>fail('record_cut_storage'));let archive:PhysicalRoomRecordCutArchive|undefined;
 const current=()=>{observation.check(()=>fail('record_cut_aborted'));if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('record_cut_policy');},check=()=>{current();authority();current();};
 try{const context=prepareArchiveIntegrity({wasm:raw['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check});await withRetainedCut({name,initial:undefined,check,signal,cleanup},async saved=>{if(JSON.stringify(saved.selection)!==JSON.stringify(selection))throw fail('record_cut_integrity');archive=await PhysicalRoomRecordCutArchive.read(saved.file,selection,{wasm:context.wasm,checkAuthority:check});check();});check();if(!archive)throw fail('record_cut_storage');return archive;
 }catch(error){archive?.dispose();throw error;}finally{observation.close();}
}
