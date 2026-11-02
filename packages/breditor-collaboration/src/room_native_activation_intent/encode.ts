import {nativeActivationSelection} from '../native_activation_control/identity.js';
import {assertRoomActivationCapture} from './capture_binding.js';
/** Preserve every Blob and literal JSON field in a tagged graph, with no marker collision. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {RoomActivationEncodedCapture,RoomActivationBlobPin} from './contract.js';
import {roomActivationIntentChoice} from './identity.js';
import {fail,MAX_ROOM_ACTIVATION_INTENT_BYTES,MAX_ROOM_ACTIVATION_GRAPH_BYTES,MAX_ROOM_ACTIVATION_GRAPH_NODES,MAX_ROOM_ACTIVATION_OBJECTS} from './policy.js';
const size=Object.getOwnPropertyDescriptor(Blob.prototype,'size')!.get!,type=Object.getOwnPropertyDescriptor(Blob.prototype,'type')!.get!;
export async function encodeRoomActivationIntent(database:string,activation:SharedDurableNativeActivationSelection,capture:ReconciledServerPacketRecoveryCapture,options:SharedArchiveIntegrityOptions):Promise<RoomActivationEncodedCapture>{
 const selected=nativeActivationSelection(activation),integrity=prepareArchiveIntegrity(options),pins:RoomActivationBlobPin[]=[],objects:Blob[]=[],byHash=new Map<string,number>(),byBlob=new WeakMap<Blob,number>(),active=new WeakSet<object>();let nodes=0,stringBytes=0,total=0;
 integrity.guard();
 async function visit(value:unknown,depth:number):Promise<unknown>{
  if(++nodes>MAX_ROOM_ACTIVATION_GRAPH_NODES||depth>128)throw fail('activation_intent_policy');
  if(value===null||typeof value==='boolean')return value;if(value===undefined)return['u'];
  if(typeof value==='string'){stringBytes+=new TextEncoder().encode(value).length;if(stringBytes>MAX_ROOM_ACTIVATION_GRAPH_BYTES)throw fail('activation_intent_policy');return value;}
  if(typeof value==='number'){if(!Number.isFinite(value))throw fail('activation_intent_policy');return['n',Object.is(value,-0)?'-0':String(value)];}
  if(typeof value!=='object'||active.has(value)||!Object.isFrozen(value))throw fail('activation_intent_policy');
  if(value instanceof Blob){
   const bytes=size.call(value) as number,mime=type.call(value) as string;if(bytes>MAX_ROOM_ACTIVATION_INTENT_BYTES||mime.length>1024)throw fail('activation_intent_policy');
   let index=byBlob.get(value);if(index===undefined){const file=archiveBlob(value,MAX_ROOM_ACTIVATION_INTENT_BYTES),sha256=await integrity.digest(file);integrity.guard();index=byHash.get(sha256);
    if(index===undefined){if(pins.length>=MAX_ROOM_ACTIVATION_OBJECTS||total+bytes>MAX_ROOM_ACTIVATION_INTENT_BYTES)throw fail('activation_intent_policy');index=pins.length;pins.push({bytes,sha256});objects.push(Blob.prototype.slice.call(file,0,bytes,''));byHash.set(sha256,index);total+=bytes;}
    else if(pins[index]!.bytes!==bytes)throw fail();byBlob.set(value,index);
   }return['b',index,mime];
  }
  const prototype=Object.getPrototypeOf(value);if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null)throw fail('activation_intent_policy');
  active.add(value);try{
   if(Array.isArray(value)){const descriptors=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(value).length!==value.length+1)throw fail('activation_intent_policy');const items=[];for(let i=0;i<value.length;i++){const d=descriptors[String(i)];if(!d||!('value'in d)||!d.enumerable)throw fail('activation_intent_policy');items.push(await visit(d.value,depth+1));}return['a',items];}
   const entries=[];for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw fail('activation_intent_policy');const d=Object.getOwnPropertyDescriptor(value,key)!;if(!('value'in d)||!d.enumerable)throw fail('activation_intent_policy');entries.push([key,await visit(d.value,depth+1)]);}return['o',entries];
  }finally{active.delete(value);}
 }
 const body=await visit(capture,0);integrity.guard();assertRoomActivationCapture(selected,capture);const graph=JSON.stringify({format:'breditor/room-native-activation-capture-graph',formatVersion:1,body}),file=new Blob([graph],{type:'application/json'});
 if(file.size>MAX_ROOM_ACTIVATION_GRAPH_BYTES||total+file.size>MAX_ROOM_ACTIVATION_INTENT_BYTES)throw fail('activation_intent_policy');
 const sha256=await integrity.digest(file);integrity.guard();const choice=roomActivationIntentChoice({format:'breditor/room-native-activation-intent',formatVersion:1,database,activation:selected,graph:{bytes:file.size,sha256},objects:pins,totalBytes:total+file.size});
 return Object.freeze({choice,graph,objects:Object.freeze(objects)});
}
