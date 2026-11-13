import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {nativeActivationSelection,nativeActivationReceipt} from '../native_activation_control/identity.js';
import {fields,integer,rows} from '../physical_room_record_cut/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {roomActivationDatabase,roomActivationPin} from '../room_native_activation_intent/identity.js';
import {fail,MAX_ROOM_ACTIVATION_GRAPH_BYTES,MAX_ROOM_ACTIVATION_REVISIONS} from '../room_native_activation_intent/policy.js';
import {snapshotActivationEncoding} from '../room_native_activation_intent/snapshot_encoding.js';
import type {ActivationIntentStoreCodec,ActivationStoredState} from '../room_native_activation_intent/store_contract.js';
import {ActivationIntentStore} from '../room_native_activation_intent/store_engine.js';
import type {ContinuedRoomActivationChoice,ContinuedRoomActivationPlan} from './contract.js';

const format='breditor/continued-room-activation-intent';
const initial=Object.freeze({format:'breditor/continued-room-activation-state',formatVersion:1,
 revision:0,phase:'prepared',receipt:null} as const);

export function continuedRoomActivationChoice(input:unknown):ContinuedRoomActivationChoice{
 const r=fields(input,['format','formatVersion','database','activation','graph','objects','totalBytes']);
 const graph=roomActivationPin(r['graph'],MAX_ROOM_ACTIVATION_GRAPH_BYTES);
 if(r['format']!==format||r['formatVersion']!==1||!graph.bytes||r['totalBytes']!==graph.bytes)throw fail('activation_intent_policy');
 rows(r['objects'],0);
 return frozen({format,formatVersion:1,database:roomActivationDatabase(r['database']),
  activation:nativeActivationSelection(r['activation']),graph,objects:[],totalBytes:graph.bytes});
}

const codec:ActivationIntentStoreCodec<ContinuedRoomActivationChoice,string,ActivationStoredState>={
 choice:continuedRoomActivationChoice,
 snapshot:input=>snapshotActivationEncoding(input,continuedRoomActivationChoice),
 async decode({graph,choice,objects},options){
  const file=new Blob([graph]),context=prepareArchiveIntegrity(options);
  if(objects.length||file.size!==choice.graph.bytes||await context.digest(file)!==choice.graph.sha256)throw fail();
  return graph;
 },
 state(input,choice){
  const r=fields(input,['format','formatVersion','revision','phase','receipt']);
  const phase=r['phase'],revision=integer(r['revision'],MAX_ROOM_ACTIVATION_REVISIONS);
  if(r['format']!==initial.format||r['formatVersion']!==1||
     (phase!=='prepared'&&phase!=='request-started'&&phase!=='receipt-observed')||
     (phase==='prepared')!==(revision===0)||phase==='receipt-observed'&&revision<2)throw fail();
  const receipt=r['receipt']===null?null:nativeActivationReceipt(JSON.stringify(r['receipt']),choice.activation);
  if((phase==='receipt-observed')!==(receipt!==null))throw fail();
  return frozen({format:initial.format,formatVersion:1,revision,phase,receipt});
 },
 receipt:(receipt,choice)=>nativeActivationReceipt(JSON.stringify(receipt),choice.activation),
 initial,
};

export class ContinuedRoomActivationIntentStore extends ActivationIntentStore<ContinuedRoomActivationChoice,string,ActivationStoredState>{
 constructor(choice:ContinuedRoomActivationChoice,options:SharedArchiveIntegrityOptions){super(choice,options,codec);}
}

export async function encodeContinuedRoomActivation(
 database:string,plan:ContinuedRoomActivationPlan,options:SharedArchiveIntegrityOptions,
){
 const graph=JSON.stringify(plan),file=new Blob([graph]);
 if(file.size>MAX_ROOM_ACTIVATION_GRAPH_BYTES)throw fail('activation_intent_policy');
 const integrity=prepareArchiveIntegrity(options);
 const choice=continuedRoomActivationChoice({format,formatVersion:1,database,activation:plan.activation,
  graph:{bytes:file.size,sha256:await integrity.digest(file)},objects:[],totalBytes:file.size});
 return Object.freeze({choice,graph,objects:choice.objects});
}
