/** Every source is admitted readonly before decoding its literal Native version
 * packets. These bytes are already retained in the selected client file; the
 * read neither installs a catalog entry nor ACKs its outstanding download. */
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {visitRetainedPacketNative} from '../metadata_packet_replay/visit.js';
import {replayRetainedMetadataPacketReferences} from '../metadata_packet_replay/references.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {compareAssetReference} from '../generation_recovery_control/asset_requirements.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
import type {NativeSourceVersionKnowledge} from './contract.js';
export async function readNativeSourceVersions(source:Loaded,sources:Parameters<typeof replayRetainedMetadataPacketReferences>[2],options:SharedAssetBytesOptions,check:()=>void):Promise<NativeSourceVersionKnowledge>{
 check();source.check();const members=source.catalog().participants;
 if(!sources.length||sources.length!==members.length||new Set(sources.map(row=>row.id)).size!==members.length||sources.some(row=>!members.some(member=>member.id===row.id)))throw fail();
 let document:string|undefined,schema:unknown,attempts=0;const versions=new Map<string,NativeSourceVersionKnowledge['versions'][number]>(),references=new Map<string,NativeSourceVersionKnowledge['references'][number]>();
 for(const member of sources){
  check();source.check();await visitRetainedPacketNative(source,{...member,assets:options},async alias=>{
   alias.check();const base=native.retainedAssetReferences.call(alias.core),stamp=coreReadStamp(alias.core);
   if(document===undefined){document=base.document;schema=base.schema;}else if(document!==base.document||!same(schema,base.schema))throw fail();
   const current=()=>{check();source.check();alias.check();const now=coreReadStamp(alias.core);if(now.document!==stamp.document||now.review!==stamp.review)throw fail('metadata_packet_retention_changed');native.checkRetainedAssetReferences.call(alias.core,base,base.revision);};
   for(const text of alias.versions){
    current();if(++attempts>1000000)throw fail('metadata_packet_retention_budget');const value=native.versionAssetReferences.call(alias.core,text,base.revision);native.checkPacketAssetReferences.call(alias.core,value,base.revision);current();if(value.packet.kind!=='version'||value.outcome.kind!=='ready'||value.document!==base.document||!same(value.schema,base.schema))throw fail();
    const row={participant:member.id,id:value.packet.id,references:value.outcome.references},key=JSON.stringify([row.participant,row.id]),prior=versions.get(key);if(prior&&!same(prior,row))throw fail();versions.set(key,row);
    for(const ref of value.outcome.references){references.set(JSON.stringify([ref.asset,ref.generation]),ref);if(references.size>100000)throw fail('metadata_packet_retention_budget');}
   }current();
  });check();source.check();
 }
 if(document===undefined)throw fail();return frozen({format:'breditor/retained-native-source-version-knowledge',formatVersion:1,scope:'all-selected-readonly-native-source-version-packets',document,versions:[...versions.values()].sort((a,b)=>a.participant<b.participant?-1:a.participant>b.participant?1:a.id<b.id?-1:a.id>b.id?1:0),references:[...references.values()].sort(compareAssetReference)});
}
