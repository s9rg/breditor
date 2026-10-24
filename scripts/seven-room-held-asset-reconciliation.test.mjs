/** Actual image-bearing seven-author native room. Explicit local queue choices
 * change storage only, then cold-reopen through every existing recovery family.
 * This is not whole-room provider closure, a registration or activation grant. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {completeImageNativeFixtures} from './fixtures/physical-operation-v3/image-seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {pixelAsset,secondAsset} from './fixtures/review-assets/pixels.mjs';
const root=new URL('../',import.meta.url).pathname,sha=bytes=>createHash('sha256').update(bytes).digest('hex'),fileHash=async file=>sha(Buffer.from(await file.arrayBuffer()));let fixtures;
before(async()=>{fixtures=await completeImageNativeFixtures(root);});after(async()=>{await fixtures?.close();});
const coreOf=row=>row.family==='original'?row.parts.session.core:row.parts.source.session.core;
const nativeHash=core=>({document:sha(core.checkpointJson()),review:sha(core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint())});
async function closeParts(parts){for(const row of parts.participants.toReversed()){if(row.family==='original'){await row.parts.sources.revisions?.close();await row.parts.sources.suggestions?.close();await row.parts.sources.versions?.close();await row.parts.session.close();}else await row.parts.source.session.close();row.parts.uploads.close();}}
for(const[documentSegmented,reviewSegmented]of[[false,false],[false,true],[true,false],[true,true]])test('held upload reconciliation and cold native recovery preserve all seven families with independent histories '+documentSegmented+'/'+reviewSegmented,async()=>{
 const tag='held-native-'+Number(documentSegmented)+Number(reviewSegmented),f=await completeHistoryFixture({fixtures,tag,documentSegmented,reviewSegmented,item:fixtures.manifest.cases.at(-1)});let parts,partsClosed=false,attempt,custody,incoming;
 try{parts=await f.take();const before=new Map(parts.participants.map(row=>{const core=coreOf(row);assert.ok(core.documentJson().includes(pixelAsset),'Every actual source inherits the real native image');return[row.id,nativeHash(core)];})),oldFiles=new Map(await Promise.all(f.f.rows.map(async row=>[row.id,await fileHash(row.file)]))),afterUploads=new Map();
  for(const row of parts.participants){const store=row.parts.uploads,core=coreOf(row),current=await store.exportBackup();incoming=await RichAssetStore.restoreBackup(tag+'-incoming-'+row.id,current,{uploadState:'preserve'});const previous=await incoming.get(secondAsset);assert.ok(previous);assert.notEqual(previous.status,'uploaded');if(previous.status==='cancelled')await incoming.retry(secondAsset);else await incoming.cancel(secondAsset);const original=await incoming.exportBackup();incoming.close();incoming=undefined;custody=await store.acquireRecoveryCustody();const checkSource=()=>assert.deepEqual(nativeHash(core),before.get(row.id));attempt=await store.beginHeldReconciliation(custody,original,{database:tag+'-assets-'+row.id,checkSource});assert.equal(attempt.preview().conflicts.length,1);assert.equal(attempt.preview().conflicts[0].asset,secondAsset);assert.equal(attempt.preview().conflicts[0].original.epoch,attempt.preview().conflicts[0].current.epoch+1);await attempt.commit([{asset:secondAsset,keep:'original'}]);checkSource();assert.equal((await store.list()).length,2);assert.equal((await store.get(secondAsset)).storageRef,null);afterUploads.set(row.id,await fileHash(await store.exportBackup()));await attempt.close();attempt=undefined;custody.check();await custody.close();custody=undefined;}
  for(const row of f.f.rows)assert.equal(await fileHash(row.file),oldFiles.get(row.id),'A committed local choice never rewrites a retained native input file');
  await closeParts(parts);partsClosed=true;await f.cold();parts=await f.take();partsClosed=false;assert.equal(parts.participants.length,7);
  for(const row of parts.participants){const core=coreOf(row);assert.deepEqual(nativeHash(core),before.get(row.id),'Both exact native lanes survive local asset reconciliation and cold recovery');assert.equal(await fileHash(await row.parts.uploads.exportBackup()),afterUploads.get(row.id),'The explicit queue choice and every raster byte survive cold recovery');assert.equal(core.redo(),true);assert.equal(core.undo(),true);assert.equal(core.redoReview().kind,'committed');assert.equal(core.undoReview().kind,'committed');}
  assert.equal(f.f.counts.networkCalls,0,'No editing transport or upload is started by local reconciliation');
 }finally{await attempt?.close();await custody?.close();incoming?.close();if(parts&&!partsClosed)await closeParts(parts);await f.close();}
});
