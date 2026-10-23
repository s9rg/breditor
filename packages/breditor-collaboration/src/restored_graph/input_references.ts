/** Reference rows only from genuine already admitted input archives. Historical
 * states are not replaced by latest LIVE or guessed from current document JSON. */
import {portableOperationArchive as snapshot} from '../independent_operation/portable_backup.js';
import {operationLineageArchive as lineage} from '../independent_operation/lineage_archive.js';
import {restoredGraphArchive as graph} from './archive.js';
import type {RestoredGraphReaderInput} from './reader_origin.js';
export async function restoredInputReferenceStates(input:RestoredGraphReaderInput){
 if(input.kind==='snapshot-v1'){const metadata=snapshot.metadata.call(input.owner),selection=snapshot.selection.call(input.owner);return[{kind:'snapshot-v1' as const,manifestSha256:selection.manifestSha256,references:metadata.bindings.map(({asset,generation})=>({asset,generation}))}];}
 if(input.kind==='lineage-v1')return lineage.references.call(input.owner);
 return graph.references.call(input.owner);
}
