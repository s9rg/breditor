/** Closed independent handover choice and monotonic advisory observations. */
import {fields} from '../physical_room_record_cut/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {nativeActivationSelection,nativeActivationReceipt} from '../native_activation_control/identity.js';
import {handoverDeliveryPathSelection} from '../generation_delivery_path_control/handover.js';
import {roomActivationDatabase,roomActivationPin} from '../room_native_activation_intent/identity.js';
import {fail,MAX_ROOM_ACTIVATION_GRAPH_BYTES,MAX_ROOM_ACTIVATION_INTENT_BYTES,MAX_ROOM_ACTIVATION_OBJECTS,MAX_ROOM_ACTIVATION_REVISIONS} from '../room_native_activation_intent/policy.js';
import type {RoomHandoverActivationIntentChoice,RoomHandoverActivationIntentState} from './contract.js';

export function roomHandoverActivationIntentChoice(value:unknown):RoomHandoverActivationIntentChoice{
 try{
  const r=fields(value,['format','formatVersion','database','activation','handover','graph','objects','totalBytes']);
  if(r['format']!=='breditor/room-native-handover-activation-intent'||r['formatVersion']!==1||!Array.isArray(r['objects'])||r['objects'].length>MAX_ROOM_ACTIVATION_OBJECTS)throw fail();
  const database=roomActivationDatabase(r['database']),activation=nativeActivationSelection(r['activation']),handover=handoverDeliveryPathSelection(r['handover']);
  const graph=roomActivationPin(r['graph'],MAX_ROOM_ACTIVATION_GRAPH_BYTES),objects=r['objects'].map(v=>roomActivationPin(v)),totalBytes=r['totalBytes'];
  if(graph.bytes<1||typeof totalBytes!=='number'||!Number.isSafeInteger(totalBytes)||totalBytes<graph.bytes||totalBytes>MAX_ROOM_ACTIVATION_INTENT_BYTES||objects.reduce((n,p)=>n+p.bytes,graph.bytes)!==totalBytes||new Set(objects.map(p=>p.sha256)).size!==objects.length)throw fail();
  if(JSON.stringify(activation.current)!==JSON.stringify(handover.current.path.current))throw fail();
  return frozen({format:r['format'],formatVersion:1,database,activation,handover,graph,objects,totalBytes} as const);
 }catch{throw fail('activation_intent_policy');}
}
export function roomHandoverActivationIntentState(value:unknown,choice:RoomHandoverActivationIntentChoice):RoomHandoverActivationIntentState{
 const r=fields(value,['format','formatVersion','revision','phase','receipt']),revision=r['revision'];
 if(r['format']!=='breditor/room-native-handover-activation-intent-state'||r['formatVersion']!==1||typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0||revision>MAX_ROOM_ACTIVATION_REVISIONS||!['prepared','request-started','receipt-observed'].includes(r['phase'] as string)||r['phase']==='prepared'&&revision!==0||r['phase']!=='prepared'&&revision<1)throw fail();
 const phase=r['phase'] as RoomHandoverActivationIntentState['phase'],receipt=r['receipt']===null?null:nativeActivationReceipt(JSON.stringify(r['receipt']),choice.activation);
 if((phase==='receipt-observed')!==(receipt!==null)||phase==='receipt-observed'&&revision<2)throw fail();
 return frozen({format:r['format'],formatVersion:1,revision,phase,receipt} as const);
}
