/** Admit independently persisted original packet rows against the latest exact
 * native replay. No store is flushed and no accepted document is changed. */
import {SharedEditorError} from '../core.js';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {SharedPacketAssetReferencesRead} from '../packet_asset_references.js';
import type {SharedVersionCatalogRecord} from '../versions/types.js';
import type {SharedSuggestionQueueRecord} from '../suggestions/types.js';
import type {SharedSuggestionRevisionsRecord} from '../suggestion_revisions/types.js';
import {admitVersionRecord} from '../versions/record_admission.js';
import {admitSuggestionRecord,checkSuggestionRecordSource} from '../suggestions/record_admission.js';
import {admitRevisionRecord} from '../suggestion_revisions/record_admission.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
export interface OriginalReferencePacketRows{versions?:SharedVersionCatalogRecord;suggestions?:SharedSuggestionQueueRecord;revisions?:SharedSuggestionRevisionsRecord;localVersions?:readonly string[]|undefined;reviewedHistory?:'reviewed-v1'|undefined}
export function originalReferencePackets(core:SharedRichEditor<SharedSelectionPolicy>,rows:OriginalReferencePacketRows,guard:()=>void){
 guard();const base=native.retainedAssetReferences.call(core),revision=base.revision,references=new Map<string,RichRetainedAssetReference>(),pending:SharedAssetCapturePending[]=[],seen=new Set<string>();
 const add=(values:readonly RichRetainedAssetReference[])=>{for(const v of values){references.set(JSON.stringify([v.asset,v.generation]),{asset:v.asset,generation:v.generation});if(references.size>100000)throw new SharedEditorError('original_record_reference_budget','Complete reference budget exceeded');}};
 const consume=(id:string,read:()=>SharedPacketAssetReferencesRead)=>{if(seen.has(id))return;seen.add(id);if(seen.size>1024)throw new SharedEditorError('original_record_reference_budget','Complete packet budget exceeded');const value=read();native.checkPacketAssetReferences.call(core,value,revision);if(value.outcome.kind==='ready')add(value.outcome.references);else pending.push({kind:'source',packet:value.packet,missing:value.outcome.missing});};
 const version=(packet:string)=>consume('version:'+packet,()=>native.versionAssetReferences.call(core,packet,revision));add(base.references);for(const packet of rows.localVersions??[])version(packet);
 if(rows.versions){admitVersionRecord(core,rows.versions);const cached=new Set<string>();for(const row of rows.versions.packets){version(row.packet);cached.add(native.readVersion.call(core,row.packet).id);}for(const row of rows.versions.catalog?.entries??[])if(!cached.has(row.version.id))pending.push({kind:'uncached_version',id:row.version.id});}
 if(rows.suggestions){checkSuggestionRecordSource(core,rows.suggestions.identity,rows.reviewedHistory);admitSuggestionRecord(core,rows.suggestions,rows.reviewedHistory);for(const row of rows.suggestions.retained)consume('suggestion:'+row.packet,()=>native.suggestionAssetReferences.call(core,row.packet,revision));}
 if(rows.revisions){admitRevisionRecord(core,rows.revisions);for(const row of rows.revisions.retained)consume(JSON.stringify(['revision',row.previousPacket,row.packet]),()=>native.suggestionRevisionAssetReferences.call(core,row.previousPacket,row.packet,revision));}
 native.checkRetainedAssetReferences.call(core,base,revision);guard();return{references:[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),pending};
}
