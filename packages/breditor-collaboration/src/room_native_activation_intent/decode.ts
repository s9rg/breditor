import {assertRoomActivationCapture} from './capture_binding.js';
/** Rehash every retained object before restoring inert capture DATA. No report becomes a grant. */
import {fields} from '../physical_room_record_cut/policy.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import {detachResolvedServerPacketRecoveryBundle} from '../server_packet_source_resolution/bundle.js';
import type {RoomActivationEncodedCapture} from './contract.js';
import {roomActivationIntentChoice} from './identity.js';
import {fail,MAX_ROOM_ACTIVATION_INTENT_BYTES,MAX_ROOM_ACTIVATION_GRAPH_NODES} from './policy.js';
export async function decodeRoomActivationIntent(input:RoomActivationEncodedCapture,options:SharedArchiveIntegrityOptions):Promise<ReconciledServerPacketRecoveryCapture>{
 const choice=roomActivationIntentChoice(input.choice),integrity=prepareArchiveIntegrity(options);integrity.guard();
 if(typeof input.graph!=='string'||input.objects.length!==choice.objects.length)throw fail();const graphFile=new Blob([input.graph]);
 if(graphFile.size!==choice.graph.bytes||await integrity.digest(graphFile)!==choice.graph.sha256)throw fail();integrity.guard();
 const files:Blob[]=[];for(let i=0;i<choice.objects.length;i++){const pin=choice.objects[i]!,file=archiveBlob(input.objects[i]!,MAX_ROOM_ACTIVATION_INTENT_BYTES);if(file.size!==pin.bytes||await integrity.digest(file)!==pin.sha256)throw fail();integrity.guard();files.push(file);}
 const raw=fields(JSON.parse(input.graph),['format','formatVersion','body']);if(raw['format']!=='breditor/room-native-activation-capture-graph'||raw['formatVersion']!==1||JSON.stringify(raw)!==input.graph)throw fail();let nodes=0;const used=new Set<number>();
 function visit(value:unknown,depth:number):unknown{
  if(++nodes>MAX_ROOM_ACTIVATION_GRAPH_NODES||depth>128)throw fail();
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(!Array.isArray(value))throw fail();const [tag,body,mime]=value;
  if(tag==='u'){if(value.length!==1)throw fail();return undefined;}
  if(tag==='n'){if(value.length!==2||typeof body!=='string')throw fail();const result=Number(body);if(!Number.isFinite(result)||(Object.is(result,-0)?'-0':String(result))!==body)throw fail();return result;}
  if(tag==='b'){if(value.length!==3||typeof body!=='number'||!Number.isSafeInteger(body)||body<0||body>=files.length||typeof mime!=='string'||mime.length>1024||/[^\x20-\x7e]/.test(mime)||mime.toLowerCase()!==mime)throw fail();used.add(body);return Object.freeze(Blob.prototype.slice.call(files[body]!,0,files[body]!.size,mime));}
  if(value.length!==2||!Array.isArray(body))throw fail();
  if(tag==='a')return Object.freeze(body.map(child=>visit(child,depth+1)));
  if(tag==='o'){const result:Record<string,unknown>={},keys=new Set<string>();for(const entry of body){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||keys.has(entry[0]))throw fail();keys.add(entry[0]);Object.defineProperty(result,entry[0],{value:visit(entry[1],depth+1),enumerable:true,writable:false,configurable:false});}return Object.freeze(result);}throw fail();
 }
 const restored=fields(visit(raw['body'],0),['format','formatVersion','scope','recovery','reconciliation','binding']);
 if(used.size!==files.length||restored['format']!=='breditor/reconciled-server-packet-recovery'||restored['formatVersion']!==1||restored['scope']!=='same-held-client-native-metadata-server-bytes-and-current-provider')throw fail();
 const recovery=fields(restored['recovery'],['kind','bundle']);if(recovery['kind']!=='retained'&&recovery['kind']!=='pending')throw fail();
 // This parser detaches the full original formats. Genuine Native inspection
 // and exact live source checks remain mandatory before any commit.
 detachResolvedServerPacketRecoveryBundle(recovery['bundle']);assertRoomActivationCapture(choice.activation,restored as unknown as ReconciledServerPacketRecoveryCapture);integrity.guard();return restored as unknown as ReconciledServerPacketRecoveryCapture;
}
