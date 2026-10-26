/** Flatten only already-admitted immutable provenance; no source or writer is
 * constructed. Original snapshot/header bytes and native strings stay literal.
 * The caller supplies its current read/lifetime check throughout asynchronous work. */
import {IndependentOperationBackup,portableOperationArchive as snapshot} from '../independent_operation/portable_backup.js';
import {IndependentOperationLineageBackup,operationLineageArchive as lineage} from '../independent_operation/lineage_archive.js';
import {captureLineageSnapshot} from '../independent_operation/lineage_snapshot.js';
import {OPERATION_LINEAGE_MAGIC,OPERATION_LINEAGE_PREFIX_BYTES} from '../independent_operation/lineage_codec.js';
import {RestoredOperationGraphArchive as Archive} from './archive.js';
import {GRAPH_MAGIC,GRAPH_PREFIX,type GraphState,type GraphNodeRow} from './graph_codec.js';
export type RestoredGraphInput=Readonly<{kind:'snapshot-v1';owner:IndependentOperationBackup}>|Readonly<{kind:'lineage-v1';owner:IndependentOperationLineageBackup}>|Readonly<{kind:'lineage-v2';owner:Archive}>;
const graphFile=Archive.prototype.file,graphMetadata=Archive.prototype.metadata;
export async function flattenRestoredGraphInput(input:RestoredGraphInput,check:()=>void){
 if(input.kind==='snapshot-v1'){const value=await captureLineageSnapshot(input.owner,check);return{states:[{kind:'snapshot-v1' as const,...value.state}],nodes:[] as GraphNodeRow[],payloads:new Map(value.payloads)};}
 const file=input.kind==='lineage-v1'?lineage.file.call(input.owner):graphFile.call(input.owner),header=input.kind==='lineage-v1'?lineage.metadata.call(input.owner):graphMetadata.call(input.owner),magic=input.kind==='lineage-v1'?OPERATION_LINEAGE_MAGIC:GRAPH_MAGIC,prefixBytes=input.kind==='lineage-v1'?OPERATION_LINEAGE_PREFIX_BYTES:GRAPH_PREFIX,prefix=new Uint8Array(await file.slice(0,prefixBytes).arrayBuffer());check();const start=prefixBytes+new DataView(prefix.buffer).getUint32(magic.length),payloads=new Map<string,Blob>();for(const p of header.parts)payloads.set(p.sha256,file.slice(start+p.offset,start+p.offset+p.bytes));
 const states:GraphState[]=input.kind==='lineage-v1'?(header as ReturnType<IndependentOperationLineageBackup['metadata']>).states.map(s=>({kind:'snapshot-v1',...s})):(header as ReturnType<Archive['metadata']>).states as GraphState[],nodes:GraphNodeRow[]=input.kind==='lineage-v1'?(header as ReturnType<IndependentOperationLineageBackup['metadata']>).nodes.map(node=>({kind:'lineage-v1',node})):(header as ReturnType<Archive['metadata']>).nodes as GraphNodeRow[];return{states:[...states],nodes:[...nodes],payloads};
}
