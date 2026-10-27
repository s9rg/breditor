/** Named original-family policies stay explicit across private actor handoff. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {takeStoppedSharedSourceActors} from '../packages/breditor-collaboration/dist/persistence/shared_session.js';
import {takeStoppedReviewSourceActors} from '../packages/breditor-collaboration/dist/persistence/review_session.js';
import {bindActorLeaseInput} from '../packages/breditor-collaboration/dist/persistence/actor_lease_input.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
import {nativeProfile,cleanupSession,insertCleanupText,cleanupNativePair} from './fixtures/owned-core-cleanup/session.mjs';
let profile,sequence=0;const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
before(async()=>{const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=nativeProfile(native);});after(()=>profile?.free());
for(const[family,scope,mask]of [
 ['original',1,1],['original',2,1],['original',1,4],['original',2,4],['original',2,5],
 ['paired',2,0],['paired',1,1],['paired',1,2],['paired',2,3],['paired',2,6],
])test('actual named '+family+' selection/typing/search/reviewed policies survive handoff '+scope+'/'+mask,async()=>{
 const host=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,scope,mask,database:'actor-overlay-'+sequence++});let source,target,escrow,token,committed=false;
 try{source=await selected.open();insertCleanupText(source.core,'Retained typed work ');insertCleanupText(source.core,'Future redo ');source.core.undo();if(selected.paired){source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Retained future comment'}});source.core.undoReview();}await source.flush();const pair=cleanupNativePair(source.core,selected),document=source.core.documentJson(),backupJson=await source.exportBackup(),input={...selected.options,database:selected.database+'-target',backupJson,writerRecovery:'host-reacquired'};
  api.SharedRichEditor.prototype.retire.call(source.core);escrow=selected.paired?takeStoppedReviewSourceActors(source):takeStoppedSharedSourceActors(source);await source.discardAndClose();source=undefined;token=bindActorLeaseInput(input,selected.paired?'review':'shared',input.database,'room','101',selected.paired?'comments':null,escrow);
  target=selected.paired?await(mask&4?api.SharedReviewPersistentSession.restoreSearchBackup(token.input):mask&2?api.SharedReviewPersistentSession.restoreReviewedBackup(token.input):api.SharedReviewPersistentSession.restoreBackup(token.input)):await(mask&4?api.SharedPersistentSession.restoreSearchBackup(token.input):scope===2?api.SharedPersistentSession.restoreDocumentBackup(token.input):api.SharedPersistentSession.restoreBackup(token.input));
  assert.deepEqual(cleanupNativePair(target.core,selected),pair);assert.equal(target.core.documentJson(),document);escrow.commit(...(selected.paired?[]:['room','101']));committed=true;await escrow.close();assert.equal(host.held.size,selected.paired?2:1);
  assert.equal(target.core.redo(),true);assert.equal(target.core.undo(),true);if(selected.paired){assert.equal(target.core.redoReview().kind,'committed');assert.equal(target.core.undoReview().kind,'committed');}assert.equal(target.core.documentJson(),document);await target.flush();
 }finally{await target?.discardAndClose();if(!committed)await token?.rollbackAfterFailure();await source?.discardAndClose();await escrow?.close();assert.equal(host.held.size,0);host.restore();}
});
