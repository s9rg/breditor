import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {nativePublicationReceipt,nativePublicationRequest,nativePublicationSelection} from '../native_publication_control/identity.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {fields,integer,rows} from '../physical_room_record_cut/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {roomActivationDatabase,roomActivationPin} from '../room_native_activation_intent/identity.js';
import {fail,MAX_ROOM_ACTIVATION_GRAPH_BYTES,MAX_ROOM_ACTIVATION_REVISIONS} from '../room_native_activation_intent/policy.js';
import {snapshotActivationEncoding} from '../room_native_activation_intent/snapshot_encoding.js';
import type {ActivationIntentStoreCodec,ActivationStoredState} from '../room_native_activation_intent/store_contract.js';
import {ActivationIntentStore} from '../room_native_activation_intent/store_engine.js';
import {continuedRoomActivationChoice} from './intent.js';
import type {ContinuedRoomPublicationChoice,ContinuedRoomPublicationPlan} from './contract.js';

const format='breditor/continued-room-publication-intent';
const initial=Object.freeze({format:'breditor/continued-room-publication-state',formatVersion:1,
 revision:0,phase:'prepared',receipt:null} as const);
type State=ActivationStoredState<SharedNativeRoomPublicationReceipt>;

export function continuedRoomPublicationChoice(input:unknown):ContinuedRoomPublicationChoice{
 const r=fields(input,['format','formatVersion','database','publication','activationIntent','activation','graph','objects','totalBytes']);
 const graph=roomActivationPin(r['graph'],MAX_ROOM_ACTIVATION_GRAPH_BYTES),database=roomActivationDatabase(r['database']);
 const publication=nativePublicationSelection(r['publication']),activationIntent=continuedRoomActivationChoice(r['activationIntent']);
 if(r['format']!==format||r['formatVersion']!==1||!graph.bytes||r['totalBytes']!==graph.bytes||database===activationIntent.database||
    JSON.stringify(r['activation'])!==JSON.stringify(publication.activation)||
    JSON.stringify(publication.activation)!==JSON.stringify(activationIntent.activation))throw fail('activation_intent_policy');
 rows(r['objects'],0);
 return frozen({format,formatVersion:1,database,publication,activationIntent,activation:publication.activation,
  graph,objects:[],totalBytes:graph.bytes});
}

export function continuedRoomPublicationBinding(choice:ContinuedRoomPublicationChoice){
 const {bytes,sha256}=choice.graph;
 return frozen({bytes,sha256:Array.from({length:32},(_,i)=>Number.parseInt(sha256.slice(i*2,i*2+2),16))});
}

function readReceipt(value:unknown,choice:ContinuedRoomPublicationChoice){
 return nativePublicationReceipt(JSON.stringify(value),nativePublicationRequest(choice.publication,continuedRoomPublicationBinding(choice)));
}

const codec:ActivationIntentStoreCodec<ContinuedRoomPublicationChoice,string,State>={
 choice:continuedRoomPublicationChoice,
 snapshot:input=>snapshotActivationEncoding(input,continuedRoomPublicationChoice),
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
  const receipt=r['receipt']===null?null:readReceipt(r['receipt'],choice);
  if((phase==='receipt-observed')!==(receipt!==null))throw fail();
  return frozen({format:initial.format,formatVersion:1,revision,phase,receipt});
 },
 receipt:readReceipt,
 initial,
};

export class ContinuedRoomPublicationIntentStore extends ActivationIntentStore<ContinuedRoomPublicationChoice,string,State>{
 constructor(choice:ContinuedRoomPublicationChoice,options:SharedArchiveIntegrityOptions){super(choice,options,codec);}
}

export async function encodeContinuedRoomPublication(plan:ContinuedRoomPublicationPlan,options:SharedArchiveIntegrityOptions){
 const {database,activationIntent,publication}=plan,graph=JSON.stringify(plan),file=new Blob([graph]);
 if(file.size>MAX_ROOM_ACTIVATION_GRAPH_BYTES)throw fail('activation_intent_policy');
 const integrity=prepareArchiveIntegrity(options);
 const choice=continuedRoomPublicationChoice({format,formatVersion:1,database,publication,activationIntent,activation:publication.activation,
  graph:{bytes:file.size,sha256:await integrity.digest(file)},objects:[],totalBytes:file.size});
 return Object.freeze({choice,graph,objects:choice.objects});
}
