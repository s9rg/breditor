/** Native-history and packet raster references for one exact selected state, not its final AST. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedPacketAssetReferencesRead} from '../packet_asset_references.js';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export function portableRecoveryReferences<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,
 recovery:{source:Pick<SharedIndependentDeliveryRecovery['source'],'versions'>;retained:SharedIndependentDeliveryRecovery['retained']},check:()=>void){
 check();const base=native.retainedAssetReferences.call(core),revision=base.revision,references=new Map<string,RichRetainedAssetReference>(),seen=new Set<string>(),pending:SharedAssetCapturePending[]=[];
 const add=(rows:readonly RichRetainedAssetReference[])=>{for(const row of rows){references.set(JSON.stringify([row.asset,row.generation]),{asset:row.asset,generation:row.generation});if(references.size>100000)throw fail('independent_operation_reference_budget');}};add(base.references);
 const consume=(key:string,read:()=>SharedPacketAssetReferencesRead)=>{if(seen.has(key))return;seen.add(key);if(seen.size>1024)throw fail('independent_operation_reference_budget');check();const value=read();native.checkPacketAssetReferences.call(core,value,revision);if(value.outcome.kind==='ready')add(value.outcome.references);else pending.push({kind:'source',packet:value.packet,missing:value.outcome.missing});check();};
 const version=(packet:string)=>consume('version:'+packet,()=>native.versionAssetReferences.call(core,packet,revision));for(const packet of recovery.source.versions)version(packet);for(const row of recovery.retained.suggestions?.retained??[])consume('suggestion:'+row.packet,()=>native.suggestionAssetReferences.call(core,row.packet,revision));for(const row of recovery.retained.revisions?.retained??[])consume(JSON.stringify(['revision',row.previousPacket,row.packet]),()=>native.suggestionRevisionAssetReferences.call(core,row.previousPacket,row.packet,revision));
 const cached=new Set<string>();for(const row of recovery.retained.versions?.packets??[]){version(row.packet);cached.add(native.readVersion.call(core,row.packet).id);}for(const row of recovery.retained.versions?.catalog?.entries??[])if(!cached.has(row.version.id))pending.push({kind:'uncached_version',id:row.version.id});
 native.checkRetainedAssetReferences.call(core,base,revision);check();return{references:[...references.values()],pending};
}
