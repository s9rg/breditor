/** Pure native/packet reads after exact private replay. Outer record admission
 * does not replace native source/effect verification. No raster bytes are read. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {SharedPacketAssetReferencesRead} from '../packet_asset_references.js';
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord} from './contract.js';
import type {SharedSegmentedRetainedRecovery} from '../segmented_relay/retained_contract.js';
import {checkGenerationRecords} from './validate_records.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {SharedEditorError} from '../core.js';
export function recordedGenerationReferences(core:SharedRichEditor<SharedSelectionPolicy>,identity:SharedGenerationSourceIdentity,records:readonly SharedGenerationSourceRecord[],check:()=>void){
 check();const admitted=checkGenerationRecords(identity,records);if(native.checkpointJson.call(core)!==admitted.source.checkpoint||(identity.review?native.reviewCheckpoint.call(core):null)!==admitted.source.reviewCheckpoint)throw new SharedEditorError('generation_record_reference_replay','Both exact native journals must precede reference discovery');
 const base=native.retainedAssetReferences.call(core),revision=base.revision,union=new Map<string,RichRetainedAssetReference>(),pending:SharedAssetCapturePending[]=[],seen=new Set<string>();
 const add=(values:readonly RichRetainedAssetReference[])=>{for(const value of values){union.set(JSON.stringify([value.asset,value.generation]),{asset:value.asset,generation:value.generation});if(union.size>100000)throw new SharedEditorError('generation_record_reference_budget','Complete reference budget exceeded');}};
 const consume=(key:string,read:()=>SharedPacketAssetReferencesRead)=>{if(seen.has(key))return;seen.add(key);if(seen.size>1024)throw new SharedEditorError('generation_record_reference_budget','Complete packet budget exceeded');const value=read();native.checkPacketAssetReferences.call(core,value,revision);if(value.outcome.kind==='ready')add(value.outcome.references);else pending.push({kind:'source',packet:value.packet,missing:value.outcome.missing});};
 const version=(packet:string)=>consume('version:'+packet,()=>native.versionAssetReferences.call(core,packet,revision));add(base.references);for(const packet of admitted.source.versions)version(packet);
 if(identity.kind==='retained'){
  const r=(admitted.recovery as SharedSegmentedRetainedRecovery).retained;
  for(const row of r.suggestions?.retained??[])consume('suggestion:'+row.packet,()=>native.suggestionAssetReferences.call(core,row.packet,revision));
  for(const row of r.revisions?.retained??[])consume(JSON.stringify(['revision',row.previousPacket,row.packet]),()=>native.suggestionRevisionAssetReferences.call(core,row.previousPacket,row.packet,revision));
  const cached=new Set<string>();for(const row of r.versions?.packets??[]){version(row.packet);cached.add(native.readVersion.call(core,row.packet).id);}for(const row of r.versions?.catalog?.entries??[])if(!cached.has(row.version.id))pending.push({kind:'uncached_version',id:row.version.id});
 }
 native.checkRetainedAssetReferences.call(core,base,revision);check();return{references:[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),pending};
}
