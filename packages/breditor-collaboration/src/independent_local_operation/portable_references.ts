/** Retained local native history and immutable version pixels, not just images
 * visible in the final tree. No delivery queue or relay identity is inferred. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {localJournalFailure as fail} from './journal_failure.js';
export function localPortableReferences(core:SharedRichEditor<SharedSelectionPolicy>,recovery:SharedIndependentHistoryRecovery,check:()=>void){
 check();const base=native.retainedAssetReferences.call(core),revision=base.revision,references=new Map<string,RichRetainedAssetReference>(),pending:SharedAssetCapturePending[]=[];
 const add=(rows:readonly RichRetainedAssetReference[])=>{for(const row of rows){references.set(JSON.stringify([row.asset,row.generation]),{asset:row.asset,generation:row.generation});if(references.size>100000)throw fail('independent_local_operation_reference_budget');}};add(base.references);
 if(base.document!==recovery.identity.native.room)throw fail('independent_local_operation_source');
 for(const packet of recovery.versions){check();const read=native.versionAssetReferences.call(core,packet,revision);native.checkPacketAssetReferences.call(core,read,revision);if(read.outcome.kind==='ready')add(read.outcome.references);else pending.push({kind:'source',packet:read.packet,missing:read.outcome.missing});check();}
 native.checkRetainedAssetReferences.call(core,base,revision);check();return{references:[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),pending};
}
