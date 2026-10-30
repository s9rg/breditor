/** Complete fresh-cut DATA traversal. Only the separate genuine-host wrapper
 * can register its result for a later live reconciliation check. */
import {archiveFields} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {OriginalMetadataAccumulator,type OriginalMetadataIndex} from './accumulator.js';
import {metadataQuery,fail} from './policy.js';import {metadataPage} from './page.js';import {prepareMetadataRequest} from './request.js';
import type {OriginalMetadataStartQuery,OriginalMetadataQuery,ServerMetadataFamily,SelectedServerMetadataRead,SelectedServerMetadataCatalog,OriginalMetadataPage} from './contract.js';
const MAX_COLLECTION_BYTES=32*1024*1024;
function next(page:OriginalMetadataPage):OriginalMetadataQuery{return frozen(Object.fromEntries((['versions','suggestions','revisions'] as const).map(name=>{const lane=page[name];return[name,lane.kind==='disabled'?{kind:'disabled'}:{kind:'after',cursor:lane.catalog.cursor}];})) as unknown as OriginalMetadataQuery);}
export function freshMetadataQuery(input:unknown):OriginalMetadataStartQuery{const selected=metadataQuery(input);for(const name of ['versions','suggestions','revisions'] as const)if(selected[name].kind==='after')throw fail('metadata_read_policy');return selected as OriginalMetadataStartQuery;}
export async function collectOriginalMetadataData<S>(family:ServerMetadataFamily,selection:S,document:string,input:OriginalMetadataStartQuery,read:(query:OriginalMetadataQuery)=>Promise<SelectedServerMetadataRead<S>>,check:()=>Promise<void>):Promise<{catalog:SelectedServerMetadataCatalog<S>;index:OriginalMetadataIndex}>{
 let query:OriginalMetadataQuery=freshMetadataQuery(input);const pages:SelectedServerMetadataRead<S>[]=[],accumulator=new OriginalMetadataAccumulator();let bytes=0;
 await check();
 // The original Native lanes hold at most1024versions,1024proposals and1023
 // revisions. At64events/page,33rounds cover the complete2048-event feed.
 for(let round=0;round<33;round++){
  const request=await prepareMetadataRequest(family,selection,query),received=await read(query),r=archiveFields(received,'format,formatVersion,selection,requestSha256,scope,metadata');
  if(r['format']!==`breditor/${family}-metadata-read`||r['formatVersion']!==1||r['requestSha256']!==request.sha256||r['scope']!=='selected-server-original-metadata-receipts-and-packet-fingerprints-page'||JSON.stringify(r['selection'])!==JSON.stringify(selection))throw fail();
  bytes+=new TextEncoder().encode(JSON.stringify(received)).length;if(bytes>MAX_COLLECTION_BYTES)throw fail('metadata_read_budget');
  const page=metadataPage(r['metadata'],query,document);accumulator.accept(page);pages.push(frozen(received));query=next(page);
  if((['versions','suggestions','revisions'] as const).every(name=>page[name].kind==='disabled'||!page[name].catalog.more)){
   const index=accumulator.finish();await check();const terminal={versions:page.versions.kind==='page'?page.versions.catalog.cursor:null,suggestions:page.suggestions.kind==='page'?page.suggestions.catalog.cursor:null,revisions:page.revisions.kind==='page'?page.revisions.catalog.cursor:null};
   return{catalog:frozen({format:'breditor/selected-server-original-metadata-catalog',formatVersion:1,selection,pages,terminal}),index};
  }
 }
 throw fail('metadata_read_budget');
}
