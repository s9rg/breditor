/** Canonical flat framing. Snapshot headers are bounded raw parts, not recursively escaped JSON.
 * The root binds every predecessor and state; exact reachability forbids missing or extra data. */
import {assetBytesDigest,assetBytesUtf8} from '../asset_bytes/format.js';
import {generationFields} from '../generation_source/identity.js';
import {MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES} from '../independent_delivery_participant/codec.js';
import {MAX_OPERATION_BACKUP_HEADER_BYTES} from './portable_codec.js';
import {operationPortableHash} from './portable_identity.js';
import type {OperationLineageHeader,OperationLineageNodeBody,OperationLineageNode,OperationLineageReference,OperationLineageState,OperationLineagePart} from './lineage_contract.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import {ownedLineagePayload} from './payload_blob.js';
export const OPERATION_LINEAGE_MAGIC=new TextEncoder().encode('BREDITOR-INDEPENDENT-OPERATION-LINEAGE1\n');
export const OPERATION_LINEAGE_PREFIX_BYTES=OPERATION_LINEAGE_MAGIC.length+4;
export const OPERATION_LINEAGE_MIME='application/vnd.breditor.independent-operation-lineage-backup';
export const MAX_OPERATION_LINEAGE_BYTES=16*1024*1024*1024;
export const MAX_OPERATION_LINEAGE_NODES=1024;
export const MAX_OPERATION_LINEAGE_PARTS=1048576;
export const lineageNodeDigest=(body:OperationLineageNodeBody)=>assetBytesDigest(assetBytesUtf8('breditor/independent-operation-lineage-node/1\0'+JSON.stringify(body),2048));
export function lineageReference(value:unknown):OperationLineageReference {
 if(!generationFields(value,'kind,manifestSha256')||!['snapshot','lineage'].includes(String(value['kind']))||!operationPortableHash(value['manifestSha256']))throw fail('independent_operation_lineage_format');return{kind:value['kind'] as OperationLineageReference['kind'],manifestSha256:value['manifestSha256']};
}
/** A linear recovery ancestry. A repeated state is permitted; repeated/cyclic links are not. */
export function lineageChain(header:OperationLineageHeader):readonly Readonly<{state:string;node:string|null}>[]{
 const nodes=new Map(header.nodes.map(n=>[n.manifestSha256,n])),states=new Set(header.states.map(s=>s.manifestSha256)),usedNodes=new Set<string>(),usedStates=new Set<string>(),chain:{state:string;node:string|null}[]=[];let ref:OperationLineageReference={kind:'lineage',manifestSha256:header.root};
 while(ref.kind==='lineage'){const n=nodes.get(ref.manifestSha256);if(!n||usedNodes.has(ref.manifestSha256)||!states.has(n.snapshot))throw fail('independent_operation_lineage_closure');usedNodes.add(n.manifestSha256);usedStates.add(n.snapshot);chain.push({state:n.snapshot,node:n.manifestSha256});ref=n.previous;}
 if(!states.has(ref.manifestSha256))throw fail('independent_operation_lineage_closure');usedStates.add(ref.manifestSha256);chain.push({state:ref.manifestSha256,node:null});if(usedNodes.size!==nodes.size||usedStates.size!==states.size)throw fail('independent_operation_lineage_closure');return chain.reverse();
}
export async function readLineageHeader(raw:unknown,bytes:number,root:string,check:()=>void=()=>{}):Promise<OperationLineageHeader>{
 check();
 if(!generationFields(raw,'format,formatVersion,root,states,nodes,parts')||raw['format']!=='breditor/shared-independent-operation-lineage-backup'||raw['formatVersion']!==1||raw['root']!==root||!operationPortableHash(root)||!Array.isArray(raw['states'])||raw['states'].length<1||raw['states'].length>MAX_OPERATION_LINEAGE_NODES+1||!Array.isArray(raw['nodes'])||raw['nodes'].length<1||raw['nodes'].length>MAX_OPERATION_LINEAGE_NODES||!Array.isArray(raw['parts'])||raw['parts'].length<6||raw['parts'].length>MAX_OPERATION_LINEAGE_PARTS)throw fail('independent_operation_lineage_format');
 const states:OperationLineageState[]=[],nodes:OperationLineageNode[]=[],parts:OperationLineagePart[]=[];let last='',offset=0;
 for(const row of raw['states']){if(!generationFields(row,'manifestSha256,header')||!operationPortableHash(row['manifestSha256'])||row['manifestSha256']<=last||!operationPortableHash(row['header']))throw fail('independent_operation_lineage_format');last=row['manifestSha256'];states.push({manifestSha256:row['manifestSha256'],header:row['header']});}
 last='';for(const row of raw['nodes']){check();if(!generationFields(row,'format,formatVersion,previous,snapshot,manifestSha256')||row['format']!=='breditor/shared-independent-operation-lineage-node'||row['formatVersion']!==1||!operationPortableHash(row['manifestSha256'])||row['manifestSha256']<=last||!operationPortableHash(row['snapshot']))throw fail('independent_operation_lineage_format');last=row['manifestSha256'];const body:OperationLineageNodeBody={format:'breditor/shared-independent-operation-lineage-node',formatVersion:1,previous:lineageReference(row['previous']),snapshot:row['snapshot']};if(await lineageNodeDigest(body)!==row['manifestSha256'])throw fail('independent_operation_lineage_integrity');check();nodes.push({...body,manifestSha256:row['manifestSha256']});}
 last='';for(const row of raw['parts']){if(!generationFields(row,'sha256,bytes,offset')||!operationPortableHash(row['sha256'])||row['sha256']<=last||!Number.isSafeInteger(row['bytes'])||Number(row['bytes'])<1||Number(row['bytes'])>MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES||row['offset']!==offset)throw fail('independent_operation_lineage_format');last=row['sha256'];parts.push({sha256:row['sha256'],bytes:Number(row['bytes']),offset});offset+=Number(row['bytes']);if(offset>MAX_OPERATION_LINEAGE_BYTES)throw fail('independent_operation_lineage_budget');}
 if(offset!==bytes)throw fail('independent_operation_lineage_integrity');const header:OperationLineageHeader={format:'breditor/shared-independent-operation-lineage-backup',formatVersion:1,root,states,nodes,parts};lineageChain(header);check();return header;
}
/** Each literal digest is checked before encoding; no whole 16 GiB aggregate array is made. */
export async function encodeOperationLineage(root:string,states:readonly OperationLineageState[],nodes:readonly OperationLineageNode[],payloads:ReadonlyMap<string,Blob>,check:()=>void){
 check();if(payloads.size>MAX_OPERATION_LINEAGE_PARTS||nodes.length>MAX_OPERATION_LINEAGE_NODES||states.length>MAX_OPERATION_LINEAGE_NODES+1)throw fail('independent_operation_lineage_budget');let offset=0;const parts:OperationLineagePart[]=[],blobs:Blob[]=[];for(const[sha256,input]of [...payloads].sort(([a],[b])=>a<b?-1:a>b?1:0)){const blob=await ownedLineagePayload(input,sha256,check,()=>fail('independent_operation_lineage_integrity'));parts.push({sha256,bytes:blob.size,offset});blobs.push(blob);offset+=blob.size;if(offset>MAX_OPERATION_LINEAGE_BYTES)throw fail('independent_operation_lineage_budget');}
 const header=await readLineageHeader({format:'breditor/shared-independent-operation-lineage-backup',formatVersion:1,root,states:[...states].sort((a,b)=>a.manifestSha256<b.manifestSha256?-1:1),nodes:[...nodes].sort((a,b)=>a.manifestSha256<b.manifestSha256?-1:1),parts},offset,root,check);check();const json=assetBytesUtf8(JSON.stringify(header),MAX_OPERATION_BACKUP_HEADER_BYTES),prefix=new Uint8Array(OPERATION_LINEAGE_PREFIX_BYTES);prefix.set(OPERATION_LINEAGE_MAGIC);new DataView(prefix.buffer).setUint32(OPERATION_LINEAGE_MAGIC.length,json.length);const file=new Blob([prefix,json,...blobs],{type:OPERATION_LINEAGE_MIME});if(file.size>MAX_OPERATION_LINEAGE_BYTES)throw fail('independent_operation_lineage_budget');check();return{file,header};
}
