/** Closed independent pins and monotonic advisory state; never portable permission. */
import {fields} from '../physical_room_record_cut/policy.js';
import {frozen,hex} from '../room_participant_inventory/policy.js';
import {nativeActivationSelection,nativeActivationReceipt} from '../native_activation_control/identity.js';
import type {RoomActivationIntentChoice,RoomActivationIntentState,RoomActivationBlobPin} from './contract.js';
import {fail,MAX_ROOM_ACTIVATION_INTENT_BYTES,MAX_ROOM_ACTIVATION_GRAPH_BYTES,MAX_ROOM_ACTIVATION_OBJECTS,MAX_ROOM_ACTIVATION_REVISIONS} from './policy.js';
function integer(value:unknown,minimum:number,maximum:number):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<minimum||value>maximum)throw fail();return value;}
export function roomActivationDatabase(value:unknown):string{if(typeof value!=='string'||!value||new TextEncoder().encode(value).length>512||/[\u0000-\u001f\u007f]/.test(value))throw fail('activation_intent_policy');return value;}
export function roomActivationPin(value:unknown,maximum=MAX_ROOM_ACTIVATION_INTENT_BYTES):RoomActivationBlobPin{const r=fields(value,['bytes','sha256']);return{bytes:integer(r['bytes'],0,maximum),sha256:hex(r['sha256'])};}
export function roomActivationIntentChoice(value:unknown):RoomActivationIntentChoice {
 try{const r=fields(value,['format','formatVersion','database','activation','graph','objects','totalBytes']),database=r['database'];
  if(r['format']!=='breditor/room-native-activation-intent'||r['formatVersion']!==1||typeof database!=='string'||!database||new TextEncoder().encode(database).length>512||/[\u0000-\u001f\u007f]/.test(database)||!Array.isArray(r['objects'])||r['objects'].length>MAX_ROOM_ACTIVATION_OBJECTS)throw fail();
  roomActivationDatabase(database);const activation=nativeActivationSelection(r['activation']),graph=roomActivationPin(r['graph'],MAX_ROOM_ACTIVATION_GRAPH_BYTES),objects=(r['objects'] as unknown[]).map(v=>roomActivationPin(v)),totalBytes=integer(r['totalBytes'],graph.bytes,MAX_ROOM_ACTIVATION_INTENT_BYTES);
  if(graph.bytes<1||objects.reduce((n,p)=>n+p.bytes,graph.bytes)!==totalBytes||new Set(objects.map(p=>p.sha256)).size!==objects.length)throw fail();
  return frozen({format:r['format'],formatVersion:1,database,activation,graph,objects,totalBytes} as const);
 }catch{throw fail('activation_intent_policy');}
}
export function roomActivationIntentState(value:unknown,choice:RoomActivationIntentChoice):RoomActivationIntentState{
 const r=fields(value,['format','formatVersion','revision','phase','receipt']),revision=integer(r['revision'],0,MAX_ROOM_ACTIVATION_REVISIONS);
 if(r['format']!=='breditor/room-native-activation-intent-state'||r['formatVersion']!==1||!['prepared','request-started','receipt-observed'].includes(r['phase'] as string)||r['phase']==='prepared'&&revision!==0||r['phase']!=='prepared'&&revision<1)throw fail();
 const phase=r['phase'] as RoomActivationIntentState['phase'],receipt=r['receipt']===null?null:nativeActivationReceipt(JSON.stringify(r['receipt']),choice.activation);
 if((phase==='receipt-observed')!==(receipt!==null)||phase==='receipt-observed'&&revision<2)throw fail();
 return frozen({format:r['format'],formatVersion:1,revision,phase,receipt} as const);
}
