/** Materialized DATA payloads prevent repeated lineage encodes from retaining
 * nested views of earlier archive Blobs. This supplies no source/actor proof.
 * Copy reads use bounded chunks; the existing digest keeps its original part
 * budget. The returned Blob owns fresh storage for the complete payload. */
import {independentDeliveryParticipantDigest,MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES} from '../independent_delivery_participant/codec.js';
import {independentDeliveryParticipantFailure} from '../independent_delivery_participant/policy.js';
import {lineagePayloadReadFailure} from './payload_read_failure.js';
export const LINEAGE_PAYLOAD_COPY_CHUNK_BYTES=1024*1024;
const slice=Blob.prototype.slice,arrayBuffer=Blob.prototype.arrayBuffer;
/** Capture bytes under the caller's current guard, then verify the owned copy
 * against the original requested digest. Never accepts or retries a short read. */
export async function ownedLineagePayload(input:Blob,sha256:string,check:()=>void,integrityFailure:()=>Error):Promise<Blob>{
 check();if(!(input instanceof Blob)||input.size>MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES)throw independentDeliveryParticipantFailure('independent_delivery_participant_budget');
 const file=new Blob([input],{type:input.type});if(file.size!==input.size)throw integrityFailure();const chunks:Blob[]=[];
 for(let offset=0;offset<file.size;offset+=LINEAGE_PAYLOAD_COPY_CHUNK_BYTES){
  check();const expected=Math.min(LINEAGE_PAYLOAD_COPY_CHUNK_BYTES,file.size-offset),bytes=await arrayBuffer.call(slice.call(file,offset,offset+expected)),observed=bytes.byteLength;check();
  if(observed!==expected||bytes.byteLength!==expected)throw lineagePayloadReadFailure(integrityFailure,file.size,offset,expected,observed,bytes.byteLength);chunks.push(new Blob([bytes]));
 }
 const owned=new Blob(chunks,{type:file.type});check();if(owned.size!==file.size||await independentDeliveryParticipantDigest(owned)!==sha256)throw integrityFailure();check();return owned;
}
