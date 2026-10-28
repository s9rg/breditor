/** Complete bounded row decoding. A later marker never skips actual target,
 * native, packet or upload admission. No mutable handles are stored here. */
import {fields,rows,hash,immutable,fail} from './policy.js';
import {recordCutJson} from '../physical_room_record_cut/json.js';
import {unionRunIdentity,unionRunEvent,MAX_UNION_RUN_EVENTS,MAX_UNION_RUN_METADATA_BYTES} from './identity.js';
import type {NativeRoomUnionRunIdentity,NativeRoomUnionRunStoredEvent} from './contract.js';
export const unionRunTables=['events','intent'] as const;
export type NativeRoomUnionRunTable=typeof unionRunTables[number];
export type NativeRoomUnionRunRaw=Readonly<Record<NativeRoomUnionRunTable,Readonly<{keys:readonly IDBValidKey[];values:readonly unknown[]}>>>;
export function decodeNativeRoomUnionRun(raw:NativeRoomUnionRunRaw,expected:NativeRoomUnionRunIdentity) {
 if(raw.intent.keys.length!==1||raw.intent.keys[0]!=='record'||raw.intent.values.length!==1)throw fail();
 const identity=unionRunIdentity(raw.intent.values[0]);
 if(JSON.stringify(identity)!==JSON.stringify(expected))throw fail();
 const keys=rows(raw.events.keys,MAX_UNION_RUN_EVENTS),values=rows(raw.events.values,MAX_UNION_RUN_EVENTS);
 if(!values.length||keys.length!==values.length)throw fail();
 let previous:string|null=null,execution:string|undefined;
 const events:NativeRoomUnionRunStoredEvent[]=values.map((value,index)=>{
  if(keys[index]!==index)throw fail();
  const row=fields(value,['event','sha256']),event=unionRunEvent(row['event']),sha256=hash(row['sha256']);
  if(event.sequence!==index||event.previous!==previous||execution!==undefined&&event.execution!==execution)throw fail();
  if(index>0){const last=values[index-1] as {event:import('./contract.js').NativeRoomUnionRunEvent;sha256:string};if(last.event.stage==='handoff-observed')throw fail();if(event.stage==='handoff-prepared'&&(event.handoff!.decisionHead.sequence!==index-1||event.handoff!.decisionHead.sha256!==last.sha256))throw fail();if(event.stage==='handoff-observed'&&(last.event.stage!=='handoff-prepared'||JSON.stringify(last.event.handoff)!==JSON.stringify(event.handoff)))throw fail();}
  execution=event.execution;previous=sha256;return immutable({event,sha256});
 });
 const signature=recordCutJson({identity,events},MAX_UNION_RUN_METADATA_BYTES);
 return {identity,execution:execution!,events:Object.freeze(events),signature};
}
