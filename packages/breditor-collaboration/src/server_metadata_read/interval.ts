/** Original filtered room-log intervals can contain gaps; they cannot drift or truncate. */
import {fail} from './policy.js';
import type {OriginalMetadataCursor,OriginalMetadataLaneQuery} from './contract.js';
export function metadataInterval(query:OriginalMetadataLaneQuery,cursor:OriginalMetadataCursor,sequences:readonly string[],more:unknown):void{
 if(query.kind==='disabled'||sequences.length>64||typeof more!=='boolean'||more&&sequences.length!==64)throw fail();
 if(query.kind==='after'&&(cursor.binding!==query.cursor.binding||cursor.through!==query.cursor.through))throw fail();
 let after=query.kind==='after'?query.cursor.after:'0';
 for(const sequence of sequences){if(BigInt(sequence)<=BigInt(after)||BigInt(sequence)>BigInt(cursor.through))throw fail();after=sequence;}
 if(sequences.length?cursor.after!==after:query.kind==='after'?cursor.after!==query.cursor.after:cursor.after!==cursor.through)throw fail();
 if(more!==(BigInt(cursor.after)<BigInt(cursor.through)))throw fail();
}
