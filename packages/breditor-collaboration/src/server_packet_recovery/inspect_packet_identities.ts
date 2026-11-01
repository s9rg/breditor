/** Decode every literal body through genuine Native packet readers. An archive
 * hash/fingerprint alone cannot authenticate its copied Native identity fields.
 * This verifies identity, not causal dependency readiness or client custody. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {receiptPacketReaders} from '../metadata_receipt_containment/native_packets.js';
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {admitRecordedMetadataCatalog} from '../metadata_packet_retention/catalog_data.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
const header=MetadataPacketArchive.prototype.header,body=MetadataPacketArchive.prototype.body;
export async function inspectMetadataPacketIdentities(archive:MetadataPacketArchive,core:SharedRichEditor<SharedSelectionPolicy>,check:()=>void):Promise<number>{
 check();const selected=header.call(archive),stamp=coreReadStamp(core),native=receiptPacketReaders(core),parents=new Map<string,Set<string>>();
 const guard=()=>{check();const now=coreReadStamp(core);if(now.document!==stamp.document||now.review!==stamp.review||header.call(archive)!==selected)throw fail();};
 const parent=(key:string,previous:string)=>{let values=parents.get(key);if(!values){values=new Set();parents.set(key,values);}values.add(previous);};
 for(const row of selected.local)if(row.previousBody!==null)parent(row.body,row.previousBody);
 const index=await admitRecordedMetadataCatalog(selected.catalog,selected.catalog.selection,selected.catalog.selection.source.server.native.source.document,guard);guard();
 const previous=new Map(selected.server.filter(row=>row.kind==='suggestion').map(row=>[row.id,row.body])),revisions=new Map(index.revisions.map(row=>[row.revision.id,row.revision.previousSuggestionId]));
 for(const row of selected.server)if(row.kind==='revision'){const id=revisions.get(row.id),key=id===undefined?undefined:previous.get(id);if(key===undefined)throw fail();parent(row.body,key);}
 for(const row of selected.bodies){
  guard();const value=await body.call(archive,row.key);guard();
  if(value.kind==='version'){if(!same(value.native,{kind:'version',id:native.version(value.text).id}))throw fail();}
  else if(value.kind==='suggestion'){if(!same(value.native,{kind:'suggestion',id:native.suggestion(value.text).id}))throw fail();}
  else{
   const values=parents.get(row.key);if(!values?.size)throw fail();
   for(const key of values){const prior=await body.call(archive,key);guard();if(prior.kind!=='suggestion')throw fail();const info=native.revision(prior.text,value.text);if(!same(value.native,{kind:'suggestion_revision',id:info.id,previousSuggestionId:info.previousSuggestionId,suggestionId:info.suggestion.id}))throw fail();guard();}
  }
  guard();
 }
 guard();return selected.bodies.length;
}
