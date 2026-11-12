/** Recover the exact local run phase after a client restarts. No actor,
 * participant source, target store, or relay is opened by this observation. */
import {archiveGuard} from '../archive_integrity/policy.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {fields,fail} from '../native_room_execution/policy.js';
import {roomRunIdentity} from './identity.js';
import {RoomRunJournalResources} from './journal_resources.js';
import type {RoomRunIdentity,RoomRunJournalObservation} from './contract.js';

const observe=RoomRunJournalResources.prototype.observe;
const close=RoomRunJournalResources.prototype.close;

/** Report absence only after an actual version-zero probe has aborted. An
 * existing journal must match the independent identity and every event hash. */
export async function observeRoomRunJournal(
 expected:RoomRunIdentity,
 options:SharedArchiveIntegrityOptions,
):Promise<RoomRunJournalObservation>{
 const identity=roomRunIdentity(expected);
 const row=fields(options,['wasm','checkAuthority'],['signal']);
 const signal=row['signal'] as AbortSignal|undefined;
 const guard=archiveGuard(row['checkAuthority'] as ()=>void,signal);
 const factory=recoveryOpeningContext(),locks=navigator.locks;
 const checkAuthority=()=>{
  guard();
  if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw fail('room_execution_policy');
 };
 checkAuthority();
 const resources=new RoomRunJournalResources();
 const snapshot=await observe.call(resources,identity,{
  wasm:row['wasm'] as SharedArchiveIntegrityOptions['wasm'],
  checkAuthority,
  ...(signal?{signal}:{}),
 }).finally(()=>close.call(resources));
 checkAuthority();
 return snapshot===null
  ?Object.freeze({kind:'absent',identity})
  :Object.freeze({kind:'existing',snapshot});
}
