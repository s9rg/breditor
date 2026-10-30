/** Pure dependency discovery at one exact admitted native point. The caller
 * must separately hold/admit the complete room, metadata journal and asset IO.
 * This function cannot turn parsed DATA into a runtime or provider capability. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedPacketAssetReferencesRead,SharedPacketAssetIdentity} from '../packet_asset_references.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {LocalMetadataDeliveryState} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataRecordAssetReferences} from './contract.js';
import {metadataChoice,metadataState,metadataJson} from '../selected_local_metadata_delivery/policy.js';
import {metadataData} from '../selected_local_metadata_delivery/data.js';
import {admitDeliveryRetainedRecords} from '../delivery_state/retained.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {MAX_SHARED_ASSET_CAPTURE_PACKETS} from '../asset_references_capture.js';
import {fail} from './error.js';
import {participantAuthority} from '../participant_backup/policy.js';

export async function readLocalMetadataRecordAssetReferences<P extends SharedSelectionPolicy>(
 core:SharedRichEditor<P>,provided:LocalMetadataDeliveryState,laneId:string,checkAuthority:()=>void,
):Promise<LocalMetadataRecordAssetReferences>{
 if(typeof checkAuthority!=='function'||typeof laneId!=='string')throw fail('local_metadata_assets_policy');
 // Snapshot before the first callback or await, without getters/toJSON hooks.
 const authority=participantAuthority(checkAuthority),data=metadataData(provided) as LocalMetadataDeliveryState;
 const choice=metadataChoice(data.choice),state=await metadataState(data,choice);
 authority();const lane=state.lanes.find(row=>row.id===laneId),binding=choice.lanes.find(row=>row.id===laneId)?.binding;
 if(!lane||!binding)throw fail('local_metadata_assets_policy');
 const source=lane.source;
 if(native.checkpointJson.call(core)!==source.documentCheckpoint||
  (source.identity.reviewHistory==='original'?native.reviewCheckpoint:native.reviewSegmentedCheckpoint).call(core)!==source.reviewCheckpoint||
  native.segmentedHistoryPolicy.call(core)!==(source.identity.documentHistory==='original'?null:'segmented-v1')||native.reviewHistoryPolicy.call(core)!==source.identity.reviewHistory)throw fail();
 // Reuse exact original packet/owned-history admission, including final effects.
 admitDeliveryRetainedRecords(core,binding,lane.records);
 const stamp=coreReadStamp(core);
 const current=()=>{const actual=coreReadStamp(core);if(actual.document!==stamp.document||actual.review!==stamp.review)throw fail('local_metadata_assets_changed');};
 const check=()=>{current();authority();current();};
 check();const base=native.retainedAssetReferences.call(core),revision=base.revision;
 if(base.document!==source.identity.native.room)throw fail();
 const references=new Map<string,RichRetainedAssetReference>(),packets:SharedPacketAssetIdentity[]=[],pending:SharedAssetCapturePending[]=[],seen=new Map<string,SharedPacketAssetIdentity>();
 const add=(rows:readonly RichRetainedAssetReference[])=>{for(const row of rows){references.set(JSON.stringify([row.asset,row.generation]),{asset:row.asset,generation:row.generation});if(references.size>100000)throw fail('local_metadata_assets_reference_budget');}};
 const consume=(key:string,read:()=>SharedPacketAssetReferencesRead)=>{
  const known=seen.get(key);if(known)return known;
  if(seen.size>=MAX_SHARED_ASSET_CAPTURE_PACKETS)throw fail('local_metadata_assets_packet_budget');
  check();const value=read();native.checkPacketAssetReferences.call(core,value,revision);check();
  seen.set(key,value.packet);packets.push(value.packet);
  if(value.outcome.kind==='ready')add(value.outcome.references);else pending.push({kind:'source',packet:value.packet,missing:value.outcome.missing});
  return value.packet;
 };
 const version=(packet:string)=>consume('version:'+packet,()=>native.versionAssetReferences.call(core,packet,revision));
 add(base.references);
 for(const packet of source.versions)version(packet);
 for(const row of lane.records.suggestions?.retained??[])consume('suggestion:'+row.packet,()=>native.suggestionAssetReferences.call(core,row.packet,revision));
 for(const row of lane.records.revisions?.retained??[])consume(JSON.stringify(['revision',row.previousPacket,row.packet]),()=>native.suggestionRevisionAssetReferences.call(core,row.previousPacket,row.packet,revision));
 const cached=new Set<string>();
 for(const row of lane.records.versions?.packets??[])cached.add(version(row.packet).id);
 for(const row of lane.records.versions?.catalog?.entries??[])if(!cached.has(row.version.id))pending.push({kind:'uncached_version',id:row.version.id});
 // A packet present only in source.versions does not pretend to be downloaded
 // into the original metadata catalog. That distinction must survive recovery.
 native.checkRetainedAssetReferences.call(core,base,revision);check();
 const text=metadataJson(state),selection={revision:state.revision,bytes:new TextEncoder().encode(text).length,sha256:await segmentedDigest(text)};
 native.checkRetainedAssetReferences.call(core,base,revision);check();
 const outcome=pending.length?{kind:'pending' as const,pending}:{kind:'ready' as const,references:[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0)};
 return frozen({format:'breditor/local-metadata-record-asset-references',formatVersion:1,scope:'native-histories-source-versions-and-exact-local-metadata-packets',state:selection,lane:laneId,document:base.document,nativeRevision:revision,packets,outcome});
}
