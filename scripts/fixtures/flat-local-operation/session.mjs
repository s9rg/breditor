/** Genuine first flat file from actual local provenance and a restored native
 * source. No invented source rows, ready flags or AST reconstruction. */
import assert from 'node:assert/strict';
import {OperationalRestoredLocalParticipant as SeedParent} from '../../../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {captureLocalOperationBackup} from '../../../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {captureFlatLocalOperation} from '../../../packages/breditor-collaboration/dist/flat_local_operation/capture.js';
import {restoredLocalFixture} from '../restored-local-operation/session.mjs';

/** Observe the actual session's initial flush after the opening intrinsic is captured. */
export async function observeFlatLocalSource(Session,begin){
 const prototype=Session.prototype,flush=prototype.flush,opened=[];
 prototype.flush=async function(){await flush.call(this);opened.push(this);};
 try{return {parent:await begin(),opened};}
 finally{prototype.flush=flush;}
}

export async function flatLocalFixture(host,extra={}){
 const original=await restoredLocalFixture(host,captureLocalOperationBackup,extra);let parent,parts,backup;
 try{parent=await SeedParent.begin(original.file,{...original.options,cohort:{parentDatabase:original.value.f.tag+'-flat-seed-parent',uploadsDatabase:original.value.f.tag+'-flat-seed-uploads'}});parts=await parent.intoParts();const live=parts.source.session.exportRecovery(),whole=await parts.uploads.exportBackup(),result=await captureFlatLocalOperation({source:parts.source.session,assets:parts.uploads,...original.value.readOptions});assert.equal(result.kind,'ready');backup=result.backup;assert.deepEqual(backup.live(),live);assert.deepEqual(Buffer.from(await backup.uploads().arrayBuffer()),Buffer.from(await whole.arrayBuffer()));assert.equal(backup.uploads().type,whole.type);await parts.source.session.discardAndClose();parts.uploads.close();parts=undefined;
  const database=original.value.f.tag+'-flat-journal',sourceDatabase=original.value.f.tag+'-flat-source',options={kind:'flat-local-v1',expected:backup.selection(),database,sourceDatabase,sourceFactory:original.options.sourceFactory,writerRecovery:'host-reacquired',checkAuthority(){}};
  return{original,backup,file:backup.file(),live,whole,options,nativeOptions:(overrides={})=>original.nativeOptions({database:sourceDatabase,...overrides}),async close(){backup.dispose();await original.close();}};
 }catch(error){backup?.dispose();await parts?.source.session.discardAndClose();parts?.uploads.close();parts=undefined;await parent?.discardAndClose();parent=undefined;await original.close();throw error;}finally{await parts?.source.session.discardAndClose();parts?.uploads.close();await parent?.discardAndClose();}
}
