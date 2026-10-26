/** The existing graph append framing, shared by actual source capture and
 * retained reconstruction DATA. This serializer admits no native history,
 * mutable source, source ACK or room permission. Readers still admit the complete graph. */
import {independentDeliveryParticipantDigest as digest} from '../independent_delivery_participant/codec.js';
import {STATE_MAGIC,STATE_PREFIX,type encodeRestoredStateFrame} from './state_codec.js';
import {encodeGraph,graphNodeDigest,type GraphState,type GraphNodeRow,type GraphReference} from './graph_codec.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export interface RestoredGraphAppendData{readonly reference:GraphReference;readonly states:readonly GraphState[];readonly nodes:readonly GraphNodeRow[];readonly payloads:ReadonlyMap<string,Blob>}
export async function appendRestoredGraphFrame(input:RestoredGraphAppendData,frame:Awaited<ReturnType<typeof encodeRestoredStateFrame>>,check:()=>void){
 const states=[...input.states],nodes=[...input.nodes],payloads=new Map(input.payloads),prefix=new Uint8Array(await frame.file.slice(0,STATE_PREFIX).arrayBuffer()),length=new DataView(prefix.buffer).getUint32(STATE_MAGIC.length),header=frame.file.slice(STATE_PREFIX,STATE_PREFIX+length),headerSha=await digest(header);check();
 states.push({kind:'state-v2',manifestSha256:frame.selection.manifestSha256,header:headerSha});
 const put=(hash:string,blob:Blob)=>{const old=payloads.get(hash);if(old&&old.size!==blob.size)throw fail('restored_graph_integrity');payloads.set(hash,blob);};
 put(headerSha,header);for(const[i,p]of frame.header.parts.entries())put(p.sha256,frame.payloads[i]!);
 const body={format:'breditor/shared-restored-operation-lineage-node' as const,formatVersion:2 as const,previous:input.reference,state:frame.selection.manifestSha256},manifestSha256=await graphNodeDigest(body);check();
 nodes.push({kind:'lineage-v2',node:{...body,manifestSha256}});const encoded=await encodeGraph(manifestSha256,states,nodes,payloads,check);check();
 return{...encoded,selection:{original:frame.selection.original,manifestSha256}};
}
