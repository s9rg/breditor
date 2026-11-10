/** Every old byte participates in the SAME transaction's append compare side. */
import {sameAdoptionBytes} from '../physical_room_asset_adoption/storage.js';
import {journalIdentity,journalEvent,currentPins} from './identity.js';
import {fields,hash,fail,MAX_DELIVERY_JOURNAL_BYTES,MAX_DELIVERY_JOURNAL_EVENTS} from './policy.js';
import type {DeliveryJournalIdentity,DeliveryJournalEvent} from './contract.js';
import {containsOrderedDeliveryCuts,handoverDeliveryCuts} from '../generation_delivery_path_control/retained_cuts.js';
export const tables=['current','events','intent','inventories','servers'] as const;
export type Table=typeof tables[number];export type Raw=Record<Table,{keys:IDBValidKey[];values:unknown[]}>;
export interface StoredEvent{readonly event:DeliveryJournalEvent;readonly sha256:string}
export interface Rows{readonly identity:DeliveryJournalIdentity;readonly events:readonly StoredEvent[];readonly current:readonly ArrayBuffer[];readonly servers:readonly ArrayBuffer[];readonly inventories:readonly ArrayBuffer[];readonly signature:string;readonly bytes:number}
function bytes(value:unknown,size:number):ArrayBuffer{if(!(value instanceof ArrayBuffer)||value.byteLength!==size)throw fail();return value;}
export function decodeRows(raw:Raw,expected:DeliveryJournalIdentity):Rows{
 if(raw.intent.keys.length!==1||raw.intent.keys[0]!=='identity'||raw.intent.values.length!==1)throw fail();const identity=journalIdentity(raw.intent.values[0]);if(JSON.stringify(identity)!==JSON.stringify(expected))throw fail();
 const n=raw.events.values.length;if(!n||n>MAX_DELIVERY_JOURNAL_EVENTS||raw.events.keys.length!==n||['current','servers','inventories'].some(name=>raw[name as Table].keys.length!==n||raw[name as Table].values.length!==n))throw fail();
 const events:StoredEvent[]=[],current:ArrayBuffer[]=[],servers:ArrayBuffer[]=[],inventories:ArrayBuffer[]=[];let total=0,previous:string|null=null,prior:DeliveryJournalEvent|undefined;
 for(let i=0;i<n;i++){if(['events','current','servers','inventories'].some(name=>raw[name as Table].keys[i]!==i))throw fail();const r=fields(raw.events.values[i],['event','sha256']),event=journalEvent(r['event']),sha256=hash(r['sha256']);if(event.sequence!==i||event.previous!==previous)throw fail();const pins=currentPins(event.control);
  if(i===0){if(event.control.kind!=='initial'||JSON.stringify(event.control.selection)!==JSON.stringify(identity.prepared.server)||JSON.stringify(event.current)!==JSON.stringify(identity.prepared.before))throw fail();}
  else if(event.control.kind==='handover'){
   if(!containsOrderedDeliveryCuts(handoverDeliveryCuts(event.control.selection.path),events.map(row=>row.event.server.identity)))throw fail();
  }else if(event.control.kind!=='advanced'||JSON.stringify(event.control.selection.continuation.previous)!==JSON.stringify(prior!.server.identity)||JSON.stringify(pins.origin)!==JSON.stringify(currentPins(prior!.control).origin))throw fail();
  current.push(bytes(raw.current.values[i],event.current.bytes));servers.push(bytes(raw.servers.values[i],event.server.bytes));inventories.push(bytes(raw.inventories.values[i],event.inventory.bytes));total+=event.current.bytes+event.server.bytes+event.inventory.bytes;if(total>MAX_DELIVERY_JOURNAL_BYTES)throw fail('delivery_journal_budget');events.push(Object.freeze({event,sha256}));previous=sha256;prior=event;
 }
 const signature=JSON.stringify({identity,events});total+=new TextEncoder().encode(signature).length;if(total>MAX_DELIVERY_JOURNAL_BYTES)throw fail('delivery_journal_budget');return{identity,events:Object.freeze(events),current,servers,inventories,signature,bytes:total};
}
export function sameRows(left:Rows,right:Rows):boolean{return left.signature===right.signature&&(['current','servers','inventories'] as const).every(name=>left[name].length===right[name].length&&left[name].every((value,i)=>sameAdoptionBytes(value,right[name][i]!)));}
