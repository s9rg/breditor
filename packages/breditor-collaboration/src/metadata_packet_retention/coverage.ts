/** Exact declared first-body coverage. Recorded DATA consistency is distinct
 * from a live Native host's authenticated original-catalog provenance. */
import type {OriginalMetadataIndex} from '../server_metadata_read/accumulator.js';
import type {MetadataPacketArchiveHeader} from './contract.js';
import {fail,same} from './policy.js';
export function checkMetadataPacketCoverage(header:MetadataPacketArchiveHeader,index:OriginalMetadataIndex):void{
 const expected=[...index.fingerprints.versions.map(row=>({kind:'version',row})),...index.fingerprints.suggestions.map(row=>({kind:'suggestion',row})),...index.fingerprints.revisions.map(row=>({kind:'revision',row}))];
 if(header.server.length!==expected.length)throw fail();
 const bodies=new Map(header.bodies.map(row=>[row.key,row]));
 for(const[rowIndex,item]of expected.entries()){const occurrence=header.server[rowIndex],body=occurrence&&bodies.get(occurrence.body);if(!occurrence||occurrence.kind!==item.kind||occurrence.id!==item.row.id||!body||!same(body.fingerprint,item.row))throw fail();}
 for(const occurrence of header.server){const body=bodies.get(occurrence.body)!;if(body.kind==='revision'){const receipt=index.revisions.find(row=>row.revision.id===body.native.id);if(!receipt||body.native.kind!=='suggestion_revision'||body.native.previousSuggestionId!==receipt.revision.previousSuggestionId||body.native.suggestionId!==receipt.revision.suggestion.id)throw fail();}}
}
