/** Complete bounded row decoding. A later marker never skips actual target,
 * native, packet or upload admission. No mutable handles are stored here. */
import {fields,rows,hash,immutable,fail} from '../native_room_execution/policy.js';
import {recordCutJson} from '../physical_room_record_cut/json.js';
import {roomRunIdentity,roomRunEvent,MAX_ROOM_RUN_EVENTS,MAX_ROOM_RUN_METADATA_BYTES} from './identity.js';
import type {RoomRunIdentity,RoomRunStoredEvent} from './contract.js';
export const roomRunTables=['events','intent'] as const;
export type RoomRunTable=typeof roomRunTables[number];
export type RoomRunRaw=Readonly<Record<RoomRunTable,Readonly<{keys:readonly IDBValidKey[];values:readonly unknown[]}>>>;
export function decodeRoomRun(raw:RoomRunRaw,expected:RoomRunIdentity) {
 if(raw.intent.keys.length!==1||raw.intent.keys[0]!=='record'||raw.intent.values.length!==1)throw fail();
 const identity=roomRunIdentity(raw.intent.values[0]);
 if(JSON.stringify(identity)!==JSON.stringify(expected))throw fail();
 const keys=rows(raw.events.keys,MAX_ROOM_RUN_EVENTS),values=rows(raw.events.values,MAX_ROOM_RUN_EVENTS);
 if(!values.length||keys.length!==values.length)throw fail();
 let previous:string|null=null,execution:string|undefined;
 const events:RoomRunStoredEvent[]=values.map((value,index)=>{
  if(keys[index]!==index)throw fail();
  const row=fields(value,['event','sha256']),event=roomRunEvent(row['event']),sha256=hash(row['sha256']);
  if(event.sequence!==index||event.previous!==previous||execution!==undefined&&event.execution!==execution)throw fail();
  execution=event.execution;previous=sha256;return immutable({event,sha256});
 });
 const signature=recordCutJson({identity,events},MAX_ROOM_RUN_METADATA_BYTES);
 return {identity,execution:execution!,events:Object.freeze(events),signature};
}
