/** Closed wire declarations. Neither equality nor deserialization creates custody. */
import {archiveFields as fields} from '../archive_integrity/policy.js';
import {digestBytes,frozen,hex} from '../room_participant_inventory/policy.js';
import {nativeActivationSelection} from '../native_activation_control/identity.js';
import {publicationFailure as fail,MAX_SHARED_NATIVE_PUBLICATION_CONTROL_BYTES} from './policy.js';
import type {SharedNativeRoomPublicationSelection,SharedNativeRoomPublicationBinding,SharedNativeRoomPublicationRequest,SharedNativeRoomPublicationReceipt} from './contract.js';
import {publicationData} from './snapshot.js';
export function nativePublicationSelection(value:unknown):SharedNativeRoomPublicationSelection {
 try{const r=fields(publicationData(value),'format,formatVersion,instance,activation,listener'),listener=r['listener'];
  if(r['format']!=='breditor/native-room-publication-control'||r['formatVersion']!==1||typeof listener!=='string'||!listener||listener.length>256||/[^\x20-\x7e]/.test(listener))throw fail();
  const result=frozen({format:r['format'],formatVersion:1,instance:hex(r['instance']),activation:nativeActivationSelection(r['activation']),listener} as const);
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_SHARED_NATIVE_PUBLICATION_CONTROL_BYTES)throw fail();return result;
 }catch{throw fail('publication_policy');}
}
export function nativePublicationBinding(value:unknown):SharedNativeRoomPublicationBinding {
 try{const r=fields(publicationData(value),'bytes,sha256'),bytes=r['bytes'];if(typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<1||bytes>1024**3)throw fail();return frozen({bytes,sha256:digestBytes(r['sha256'])});}catch{throw fail('publication_policy');}
}
export function nativePublicationRequest(selection:SharedNativeRoomPublicationSelection,binding:unknown):SharedNativeRoomPublicationRequest {
 const result=frozen({format:'breditor/native-room-publication-request',formatVersion:1,selection:nativePublicationSelection(selection),joint:nativePublicationBinding(binding)} as const);
 if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_SHARED_NATIVE_PUBLICATION_CONTROL_BYTES)throw fail('publication_policy');return result;
}
export function nativePublicationReceipt(text:string,expected:SharedNativeRoomPublicationRequest):SharedNativeRoomPublicationReceipt {
 try{const r=fields(JSON.parse(text),'format,formatVersion,selection,joint,scope');
  if(r['format']!=='breditor/native-room-publication-receipt'||r['formatVersion']!==1||r['scope']!=='actual-held-native-service-and-bound-listener; joint-association-only')throw fail();
  const selection=nativePublicationSelection(r['selection']),joint=nativePublicationBinding(r['joint']);
  const result=frozen({format:r['format'],formatVersion:1,selection,joint,scope:r['scope']} as const);
  if(JSON.stringify(selection)!==JSON.stringify(expected.selection)||JSON.stringify(joint)!==JSON.stringify(expected.joint)||JSON.stringify(result)!==text)throw fail();return result;
 }catch{throw fail('publication_protocol');}
}
