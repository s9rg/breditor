/** Re-admit original committed/pending/LIVE native journals and every selected
 * dependent record through the existing native/record codecs. No source opens,
 * storage mutation, checkpoint-from-AST fallback or current writer grant. */
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {originalReferenceNativeStates} from '../persistence/original_record_reference_capture.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {OriginalNativeRecords} from '../persistence/original_record_read.js';
import type {PersistentPairedMetadata} from '../persistence/paired_record_read.js';
import {replayOriginalReferenceState,verifyOriginalReferenceContinuation,type OriginalReferenceReplay,type OriginalReferenceNativeState} from '../persistence/original_reference_replay.js';
import {originalReferencePackets} from '../persistence/original_reference_packets.js';
import type {SharedVersionCatalogRecord} from '../versions/types.js';
import type {SharedSuggestionQueueRecord} from '../suggestions/types.js';
import type {SharedSuggestionRevisionsRecord} from '../suggestion_revisions/types.js';
import type {SharedAssetRecordReader} from '../asset_references_capture.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {LoadedNativeReconstructionCurrent} from './loaded_current.js';
import {fields,fail} from './policy.js';
type Read=Pick<OriginalRecordReferenceOptions,'restore'|'editor'>;
const original={selection:SharedParticipantBackup.prototype.selection,records:SharedParticipantBackup.prototype.records};
function variants(value:unknown,format:string,scope:string,queue=false) {
 const row=fields(value,['format','formatVersion','scope','committed','pending','live',...(queue?['queue']:[])]);
 if(row['format']!==format||row['formatVersion']!==1||row['scope']!==scope)throw fail();
 return {row,values:[row['committed'],...(row['pending']===null?[]:[row['pending']]),row['live']]};
}
export async function admitOriginalReconstructionNative(source:LoadedNativeReconstructionCurrent,id:string,backup:SharedParticipantBackup,provided:Read,descriptor:string) {
 source.check();const choice=fields(provided,['restore'],['editor']);if(typeof choice['restore']!=='function')throw fail('native_reconstruction_policy');
 const options={restore:choice['restore'] as Read['restore'],...(choice['editor']===undefined?{}:{editor:choice['editor'] as Read['editor']})},binding=nativeRestoreBinding(options.restore,provided),identity=original.selection.call(backup).identity,raw=fields(await source.records(id),['parent','source']),data=fields(raw['source'],['format','formatVersion','native','versions','suggestions','revisions']);
 if(data['format']!=='breditor/original-source-record-payload'||data['formatVersion']!==1)throw fail();
 const native=data['native'] as OriginalNativeRecords|PersistentPairedMetadata,n=fields(native,['format','formatVersion','scope',...(native.format==='breditor/persistent-paired-record-read'?[]:['identity']),'committed','pending','live']);
 if(n['formatVersion']!==1||n['format']!=='breditor/persistent-paired-record-read'&&n['format']!=='breditor/persistent-original-native-record-read'||n['scope']!==(n['format']==='breditor/persistent-paired-record-read'?'original-paired-committed-pending-live':'original-native-committed-pending-live'))throw fail();
 const pairs=original.records.call(backup),paired=pairs.find(row=>row.kind==='paired-session'),before:OriginalReferenceNativeState=paired?originalReferenceNativeStates({format:'breditor/persistent-paired-record-read',formatVersion:1,scope:'original-paired-committed-pending-live',committed:readPairedBackupRecord(paired.json,identity.source),pending:null,live:readPairedBackupRecord(paired.json,identity.source)}).at(-1)!:{slot:'live',checkpoint:pairs[0]!.json,...identity.source,reviewedHistory:null,paired:null};
 const states=originalReferenceNativeStates(native),check=source.check;let selected:OriginalReferenceReplay|undefined,complete=false;
 try{
  for(const state of[before,...states]){
   check();if(state.paired)readPairedBackupRecord(JSON.stringify(state.paired),identity.source);
   const next=await replayOriginalReferenceState(state,binding,options.editor,descriptor,check);let keep=false;
   try{if(selected)verifyOriginalReferenceContinuation(next,selected);originalReferencePackets(next.core,{localVersions:state.paired?.versions},next.check);selected?.dispose();selected=next;keep=true;}finally{if(!keep)next.dispose();}
  }
  if(!selected||selected.state.slot!=='live')throw fail();
  const live=selected,reviewedHistory=live.state.reviewedHistory?'reviewed-v1' as const:undefined,readers:SharedAssetRecordReader[]=[];
  if(live.state.paired)readers.push({kind:'paired-session',read:()=>structuredClone(live.state.paired!)});
  if(data['versions']!==null){const v=variants(data['versions'],'breditor/persistent-original-version-record-read','original-version-committed-pending-live');for(const value of v.values)originalReferencePackets(live.core,{versions:value as SharedVersionCatalogRecord},live.check);readers.push({kind:'version-catalog',read:()=>structuredClone(v.row['live']) as SharedVersionCatalogRecord});}
  const revisions=data['revisions']===null?undefined:variants(data['revisions'],'breditor/persistent-original-revision-record-read','original-revision-and-queue-committed-pending-live',true),queue=data['suggestions']??revisions?.row['queue'];
  if(data['suggestions']!==null&&revisions)throw fail();
  if(queue!==undefined&&queue!==null){const q=variants(queue,'breditor/persistent-suggestion-record-read','original-store-committed-pending-live');for(const value of q.values)originalReferencePackets(live.core,{suggestions:value as SharedSuggestionQueueRecord,reviewedHistory},live.check);readers.push({kind:'suggestions',read:()=>structuredClone(q.row['live']) as SharedSuggestionQueueRecord});}
  if(revisions){for(const value of revisions.values)originalReferencePackets(live.core,{revisions:value as SharedSuggestionRevisionsRecord},live.check);readers.push({kind:'suggestion-revisions',read:()=>structuredClone(revisions.row['live']) as SharedSuggestionRevisionsRecord});}
  if(JSON.stringify(['document',...readers.map(row=>row.kind)])!==JSON.stringify(identity.stores))throw fail();
  live.check();source.check();complete=true;return Object.freeze({native:live,readers:Object.freeze(readers),close:()=>live.dispose()});
 }finally{if(!complete)selected?.dispose();}
}
