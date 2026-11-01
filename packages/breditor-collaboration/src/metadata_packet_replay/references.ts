/** Recompute the original packet dependency decision on exact saved Native
 * sources. One Native alias is held at a time. All declared sources are replayed
 * even if an earlier source resolves every body; original Pending stays literal. */
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {admitRecordedMetadataCatalog} from '../metadata_packet_retention/catalog_data.js';
import type {MetadataPacketRequirements} from '../metadata_packet_retention/contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
import {visitRetainedPacketNative} from './visit.js';
const header=MetadataPacketArchive.prototype.header,bodyRead=MetadataPacketArchive.prototype.body;
const maximumAttempts=1000000,maximumMissing=1000000;
type Source=Readonly<{id:string;read:PhysicalOperationV3HistoryReadOptions['reads'][number]['read'];descriptor:string}>;
export async function replayRetainedMetadataPacketReferences(source:Loaded,archive:MetadataPacketArchive,sources:readonly Source[],options:SharedAssetBytesOptions,check:()=>void):Promise<MetadataPacketRequirements>{
 check();source.check();const selected=header.call(archive),members=source.catalog().participants;
 if(!sources.length||sources.length!==members.length||new Set(sources.map(row=>row.id)).size!==members.length||sources.some(row=>!members.some(member=>member.id===row.id)))throw fail();
 const current=()=>{check();source.check();if(header.call(archive)!==selected)throw fail();},index=await admitRecordedMetadataCatalog(selected.catalog,selected.catalog.selection,selected.catalog.selection.source.server.native.source.document,current);current();
 const parents=new Map<string,string>();for(const row of selected.local)if(row.previousBody!==null)parents.set(row.body,row.previousBody);
 const suggestions=new Map(selected.server.filter(row=>row.kind==='suggestion').map(row=>[row.id,row.body])),revisions=new Map(index.revisions.map(row=>[row.revision.id,row.revision.previousSuggestionId]));
 for(const row of selected.server)if(row.kind==='revision'){const id=revisions.get(row.id),key=id===undefined?undefined:suggestions.get(id);if(key===undefined)throw fail();parents.set(row.body,key);}
 const ready=new Set<string>(),attempts=new Map<string,{participant:string;missing:readonly{writer:string;counter:string}[]}[]>(),references=new Map<string,{asset:string;generation:string}>();let document:string|undefined,schema:unknown,totalAttempts=0,totalMissing=0;
 for(const member of sources){
  current();await visitRetainedPacketNative(source,{...member,assets:options},async alias=>{
   alias.check();const core=alias.core,base=native.retainedAssetReferences.call(core),stamp=coreReadStamp(core);
   if(document===undefined){document=base.document;schema=base.schema;}else if(document!==base.document||!same(schema,base.schema))throw fail();
   const guard=()=>{current();alias.check();const now=coreReadStamp(core);if(now.document!==stamp.document||now.review!==stamp.review)throw fail('metadata_packet_retention_changed');native.checkRetainedAssetReferences.call(core,base,base.revision);};
   for(const body of selected.bodies){
    guard();if(ready.has(body.key))continue;if(++totalAttempts>maximumAttempts)throw fail('metadata_packet_retention_budget');
    const packet=await bodyRead.call(archive,body.key),key=body.kind==='revision'?parents.get(body.key):undefined,previous=key===undefined?undefined:await bodyRead.call(archive,key);guard();if(body.kind==='revision'&&(!previous||previous.kind!=='suggestion'))throw fail();
    const read=body.kind==='version'?native.versionAssetReferences.call(core,packet.text,base.revision):body.kind==='suggestion'?native.suggestionAssetReferences.call(core,packet.text,base.revision):native.suggestionRevisionAssetReferences.call(core,previous!.text,packet.text,base.revision);native.checkPacketAssetReferences.call(core,read,base.revision);guard();if(!same(read.packet,body.native))throw fail();
    if(read.outcome.kind==='pending'){
     totalMissing+=read.outcome.missing.length;if(totalMissing>maximumMissing)throw fail('metadata_packet_retention_budget');let list=attempts.get(body.key);if(!list){list=[];attempts.set(body.key,list);}list.push({participant:member.id,missing:read.outcome.missing});
    }else{
     for(const ref of read.outcome.references){references.set(JSON.stringify([ref.asset,ref.generation]),ref);if(references.size>100000)throw fail('metadata_packet_retention_budget');}ready.add(body.key);attempts.delete(body.key);
    }
   }
   guard();
  });current();
 }
 if(document===undefined)throw fail();current();return frozen({format:'breditor/original-metadata-packet-asset-references',formatVersion:1,scope:'native-exact-retained-packet-bodies',document,references:[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),pending:selected.bodies.filter(row=>!ready.has(row.key)).map(row=>({body:row.key,attempts:attempts.get(row.key)??[]}))});
}
