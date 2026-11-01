/** Pure Native packet reference reads on genuine held sources. A missing
 * source is retained as Pending; another actual source may resolve it. No
 * accepted frame is imported into an offline writer to make a check pass. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {coreReadStamp} from '../core_read_stamp.js';
import type {MetadataPacketBody,MetadataPacketRequirements} from './contract.js';
/** Byte-source DATA only. Actual Native sources are independently admitted. */
export interface NativeMetadataPacketBodies {bodies():readonly MetadataPacketBody[];text(key:string):Promise<string>}
import {fail,same} from './policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
export interface NativePacketReferenceSource {readonly participant:string;readonly core:SharedRichEditor<SharedSelectionPolicy>;check():void}
export async function readRetainedMetadataPacketReferences(sources:readonly NativePacketReferenceSource[],store:NativeMetadataPacketBodies,parents:ReadonlyMap<string,string>,check:()=>void):Promise<MetadataPacketRequirements>{
 check();if(!sources.length)throw fail();const reads=sources.map(row=>{row.check();const core=row.core,base=native.retainedAssetReferences.call(core);return{row,core,base,stamp:coreReadStamp(core)};});
 const document=reads[0]!.base.document;for(const row of reads)if(row.base.document!==document||!same(row.base.schema,reads[0]!.base.schema))throw fail();
 const current=()=>{check();for(const row of reads){row.row.check();const stamp=coreReadStamp(row.core);if(stamp.document!==row.stamp.document||stamp.review!==row.stamp.review)throw fail('metadata_packet_retention_changed');native.checkRetainedAssetReferences.call(row.core,row.base,row.base.revision);}};
 const references=new Map<string,{asset:string;generation:string}>(),pending:{body:string;attempts:{participant:string;missing:readonly{writer:string;counter:string}[]}[]}[]=[];
 for(const body of store.bodies()){
  current();const text=await store.text(body.key),parent=body.kind==='revision'?parents.get(body.key):undefined,previous=parent===undefined?undefined:await store.text(parent);current();const attempts=[];let ready=false;
  if(body.kind==='revision'&&previous===undefined)throw fail();
  for(const source of reads){
   current();const read=body.kind==='version'?native.versionAssetReferences.call(source.core,text,source.base.revision):body.kind==='suggestion'?native.suggestionAssetReferences.call(source.core,text,source.base.revision):native.suggestionRevisionAssetReferences.call(source.core,previous!,text,source.base.revision);
   native.checkPacketAssetReferences.call(source.core,read,source.base.revision);current();if(!same(read.packet,body.native))throw fail();
   if(read.outcome.kind==='pending'){attempts.push({participant:source.row.participant,missing:read.outcome.missing});continue;}
   for(const row of read.outcome.references){references.set(JSON.stringify([row.asset,row.generation]),row);if(references.size>100000)throw fail('metadata_packet_retention_budget');}ready=true;break;
  }
  if(!ready)pending.push({body:body.key,attempts});
 }
 current();return frozen({format:'breditor/original-metadata-packet-asset-references',formatVersion:1,scope:'native-exact-retained-packet-bodies',document,references:[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),pending});
}
