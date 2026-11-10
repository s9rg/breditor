/** Detach mutable wire DTO members before any asynchronous byte validation or
 * storage. Blob copies retain immutable bytes; no history is parsed or changed. */
import {fields} from '../physical_room_record_cut/policy.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {fail,MAX_ROOM_ACTIVATION_GRAPH_BYTES,MAX_ROOM_ACTIVATION_INTENT_BYTES,MAX_ROOM_ACTIVATION_OBJECTS} from './policy.js';
import type {ActivationStoredChoice,ActivationStoredEncoding} from './store_contract.js';
export function snapshotActivationEncoding<Choice extends ActivationStoredChoice>(input:ActivationStoredEncoding<Choice>,parseChoice:(value:unknown)=>Choice):ActivationStoredEncoding<Choice>{
 const row=fields(input,['choice','graph','objects']),choice=parseChoice(row['choice']),graph=row['graph'],provided=row['objects'];
 if(typeof graph!=='string'||graph.length>MAX_ROOM_ACTIVATION_GRAPH_BYTES||!Array.isArray(provided))throw fail('activation_intent_policy');
 const descriptors=Object.getOwnPropertyDescriptors(provided as object),length=descriptors['length']?.value as unknown;
 if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||length>MAX_ROOM_ACTIVATION_OBJECTS||length!==choice.objects.length||Reflect.ownKeys(descriptors).length!==length+1)throw fail('activation_intent_policy');
 const objects:Blob[]=[];
 for(let i=0;i<length;i++){
  const descriptor=descriptors[String(i)];if(!descriptor?.enumerable||!('value'in descriptor))throw fail('activation_intent_policy');
  objects.push(Object.freeze(archiveBlob(descriptor.value,MAX_ROOM_ACTIVATION_INTENT_BYTES)));
 }
 return Object.freeze({choice,graph,objects:Object.freeze(objects)});
}
