/** Selected server data only. No page, original right or fingerprint is a live grant. */
import {archiveFields as fields} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {MAX_SERVER_METADATA_PAGE_BYTES,type ServerMetadataFamily,type OriginalMetadataQuery,type SelectedServerMetadataRead} from './contract.js';
import {metadataPage} from './page.js';
import {fail} from './policy.js';
export function readMetadataResponse<S>(text:string,family:ServerMetadataFamily,expected:S,sha256:string,query:OriginalMetadataQuery,document:string,selectionReader:(input:unknown)=>S):SelectedServerMetadataRead<S>{
 try{
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_SERVER_METADATA_PAGE_BYTES||!/^[a-f0-9]{64}$/.test(sha256))throw fail();
  const r=fields(JSON.parse(text),'format,formatVersion,selection,requestSha256,scope,metadata'),format=`breditor/${family}-metadata-read` as const,scope='selected-server-original-metadata-receipts-and-packet-fingerprints-page';
  if(r['format']!==format||r['formatVersion']!==1||r['requestSha256']!==sha256||r['scope']!==scope)throw fail();
  const selection=selectionReader(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();
  const metadata=metadataPage(r['metadata'],query,document),result:SelectedServerMetadataRead<S>={format,formatVersion:1,selection,requestSha256:sha256,scope,metadata};
  if(JSON.stringify(result)!==text)throw fail();return frozen(result);
 }catch{throw fail('metadata_read_protocol');}
}
