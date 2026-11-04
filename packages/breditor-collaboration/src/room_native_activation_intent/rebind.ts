/** Bind a verified decoded capture to a separately selected Native association,
 * retaining its original graph and object order. The canonical fresh encoder
 * remains unchanged; this action never normalizes an accepted stored format. */
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {nativeActivationSelection} from '../native_activation_control/identity.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {assertRoomActivationCapture} from './capture_binding.js';
import {decodedActivationWire} from './decoded_wire.js';
import {roomActivationIntentChoice} from './identity.js';
import {fail,MAX_ROOM_ACTIVATION_INTENT_BYTES} from './policy.js';
import type {RoomActivationEncodedCapture} from './contract.js';
const size=Object.getOwnPropertyDescriptor(Blob.prototype,'size')!.get!;
export async function rebindDecodedRoomActivationIntent(database:string,activation:SharedDurableNativeActivationSelection,capture:ReconciledServerPacketRecoveryCapture,options:SharedArchiveIntegrityOptions):Promise<RoomActivationEncodedCapture>{
 // Reject logical copies before reflecting on new host inputs. The decoder's
 // retained bytes remain inert DATA even after its store closes.
 const wire=decodedActivationWire(capture);if(!wire)throw fail('activation_intent_policy');
 const selected=nativeActivationSelection(activation),integrity=prepareArchiveIntegrity(options);integrity.guard();assertRoomActivationCapture(selected,capture);
 const objects:Blob[]=[];
 for(let i=0;i<wire.objects.length;i++){
  const pin=wire.choice.objects[i]!,file=archiveBlob(wire.objects[i]!,MAX_ROOM_ACTIVATION_INTENT_BYTES);
  if(size.call(file)!==pin.bytes||await integrity.digest(file)!==pin.sha256)throw fail('activation_intent_stale');
  integrity.guard();objects.push(Object.freeze(file));
 }
 const graphFile=new Blob([wire.graph]);
 if(size.call(graphFile)!==wire.choice.graph.bytes||await integrity.digest(graphFile)!==wire.choice.graph.sha256)throw fail('activation_intent_stale');
 integrity.guard();assertRoomActivationCapture(selected,capture);
 const choice=roomActivationIntentChoice({...wire.choice,database,activation:selected});integrity.guard();
 return Object.freeze({choice,graph:wire.graph,objects:Object.freeze(objects)});
}
