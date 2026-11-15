/** Retain two genuinely divergent offline replicas using their original bytes. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {participantUnionFixture,fileBytes,joinRelaySeed} from './fixtures/independent-delivery-union/archive.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const packages=process.env.BREDITOR_BRANCH_TEST_PACKAGES
 ? resolve(process.env.BREDITOR_BRANCH_TEST_PACKAGES) : join(root,'packages');
const installed=Boolean(process.env.BREDITOR_BRANCH_TEST_PACKAGES);
const collaboration=join(packages,installed?'collaboration':'breditor-collaboration','dist');
const raster=join(packages,installed?'experimental-rich-content':'breditor-experimental-rich-content','index.js');
const load=path=>import(pathToFileURL(path).href);
const api=await load(join(collaboration,'index.js')),rich=await load(raster);
const native=await load(join(collaboration,'runtime','breditor_shared.js'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let profile;
before(async()=>{
 const wasm=readFileSync(join(collaboration,'runtime','breditor_shared_bg.wasm'));
 if(process.env.BREDITOR_BRANCH_TEST_WASM_SHA256)assert.equal(sha(wasm),process.env.BREDITOR_BRANCH_TEST_WASM_SHA256);
 await native.default({module_or_path:wasm});
 profile=nativeProfile(native,3,true);
});
after(()=>profile?.free());

function options(f){
 const {wasm,session,checkAuthority}=f.read;
 return {wasm,session,checkAuthority};
}

for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true]){
 test(`keeps both exact originals, native common clocks, and Redo in ${documentSegmented}/${reviewSegmented}`,async()=>{
  const f=await participantUnionFixture(api,rich,profile,{wasm:native,branchFork:true,documentSegmented,reviewSegmented});
  let left,right,assetLeft,assetRight,sessionLeft,sessionRight;
  try{
   const host=options(f),names=await indexedDB.databases();
   const original=[f.options.current,f.options.incoming];
   const archive=await api.buildSharedIndependentDeliveryBranchArchive({...host,current:original[0],incoming:original[1]});
   const saved=Buffer.from(await archive.file.arrayBuffer()),selection=structuredClone(archive.selection);
   const reopened=await api.readSharedIndependentDeliveryBranchArchive(new Blob([saved]),selection,host);
   assert.deepEqual(reopened.comparison,archive.comparison);
   assert.deepEqual(await indexedDB.databases(),names);
   assert.deepEqual(f.current.exportRecovery(),f.saved);
   assert.equal(reopened.comparison.document.relation,'diverged');
   assert.equal(reopened.comparison.review.relation,'diverged');
   assert.equal(reopened.comparison.document.commonThrough,f.common.document.through);
   assert.equal(reopened.comparison.document.commonPrefixDigest,f.common.document.prefixDigest);
   assert.equal(reopened.comparison.review.commonThrough,f.common.review.through);
   assert.equal(reopened.comparison.review.commonPrefixDigest,f.common.review.prefixDigest);
   for(const [index,branch] of [reopened.current,reopened.incoming].entries()){
    assert.deepEqual(branch.selection,original[index].selection);
    assert.deepEqual(await fileBytes(branch.file),await fileBytes(original[index].file));
   }

   left=await api.readSharedIndependentDeliveryParticipant(reopened.current.file,reopened.current.selection);
   right=await api.readSharedIndependentDeliveryParticipant(reopened.incoming.file,reopened.incoming.selection);
   assert.equal(left.uploadEntries().find(row=>row.status==='cancelled')?.status,'cancelled');
   assert.equal(right.uploadEntries().find(row=>row.status==='failed')?.status,'failed');
   await f.current.close();
   const restore=async (backup,label)=>{
    const database=f.tag+'-recovered-'+label;
    const source=await api.SharedIndependentDeliverySession.restoreRecovery({
     ...f.chosen.options,database,recovery:backup.sourceRecovery(),writerRecovery:'host-reacquired',
    });
    try{
     const assets=await rich.RichAssetStore.restoreBackup(database+'-assets',backup.uploadBackup(),{uploadState:'preserve'});
     return [source,assets];
    }catch(error){
     await source.discardAndClose();
     throw error;
    }
   };
   // Close the selected writer before opening the alternative with the same original identity.
   [sessionLeft,assetLeft]=await restore(left,'left');
   assert.deepEqual(sessionLeft.exportRecovery(),left.sourceRecovery());
   assert.equal(sessionLeft.core.redo(),true);
   assert.equal(sessionLeft.core.redoReview().kind,'committed');
   assert.ok(sessionLeft.core.documentJson().includes('Local Redo'));
   assert.ok(JSON.stringify(sessionLeft.core.reviewSnapshot()).includes('Local comment Redo'));
   await sessionLeft.close();
   [sessionRight,assetRight]=await restore(right,'right');
   assert.deepEqual(sessionRight.exportRecovery(),right.sourceRecovery());
   assert.equal(sessionRight.core.redo(),true);
   assert.equal(sessionRight.core.redoReview().kind,'committed');
   assert.ok(sessionRight.core.documentJson().includes('Incoming Redo'));
   assert.ok(JSON.stringify(sessionRight.core.reviewSnapshot()).includes('Incoming comment Redo'));
  }finally{
   left?.dispose();right?.dispose();assetLeft?.close();assetRight?.close();
   await sessionLeft?.discardAndClose();await sessionRight?.discardAndClose();await f.close();
  }
 });
}

test('verified framing refuses changed branch bytes, fabricated common clocks and reused original selection',async()=>{
 const f=await participantUnionFixture(api,rich,profile,{wasm:native,branchFork:true});
 try{
  const host=options(f);
  const archive=await api.buildSharedIndependentDeliveryBranchArchive({...host,current:f.options.current,incoming:f.options.incoming});
  const bytes=await fileBytes(archive.file);
  const changed=Buffer.from(bytes);
  changed[changed.length-1]^=1;
  await assert.rejects(api.readSharedIndependentDeliveryBranchArchive(new Blob([changed]),archive.selection,host));
  const magic=Buffer.from('BREDITOR-INDEPENDENT-DELIVERY-BRANCHES-1\n');
  const start=magic.length+4,length=bytes.readUInt32LE(magic.length);
  const manifest=JSON.parse(bytes.subarray(start,start+length));
  manifest.comparison.review.relation='equal';
  const encoded=Buffer.from(JSON.stringify(manifest));
  const prefix=Buffer.from(bytes.subarray(0,start));
  prefix.writeUInt32LE(encoded.length,magic.length);
  const forged=new Blob([prefix,encoded,bytes.subarray(start+length)]);
  await assert.rejects(api.readSharedIndependentDeliveryBranchArchive(
   forged,{bytes:forged.size,manifestSha256:sha(encoded)},host,
  ),/native histories/);
  await assert.rejects(api.buildSharedIndependentDeliveryBranchArchive(
   {...host,current:f.options.current,incoming:f.options.current},
  ),/independently retained/);
  await assert.rejects(api.readSharedIndependentDeliveryBranchArchive(
   archive.file,archive.selection,{...host,checkAuthority(){throw Error('Read revoked');}},
  ));
  assert.deepEqual(f.current.exportRecovery(),f.saved);
 }finally{
  await f.close();
 }
});

test('compares extensions in both directions and equal heads across distinct device files',async()=>{
 const f=await participantUnionFixture(api,rich,profile,{wasm:native});
 let replica;
 try{
  const host=options(f),current=f.options.current,incoming=f.options.incoming;
  const forward=await api.buildSharedIndependentDeliveryBranchArchive({...host,current,incoming});
  const reverse=await api.buildSharedIndependentDeliveryBranchArchive({...host,current:incoming,incoming:current});
  for(const lane of ['document','review']){
   assert.equal(forward.comparison[lane].relation,'current-ahead');
   assert.equal(reverse.comparison[lane].relation,'incoming-ahead');
   assert.equal(forward.comparison[lane].commonThrough,f.common[lane].through);
   assert.equal(forward.comparison[lane].commonPrefixDigest,reverse.comparison[lane].commonPrefixDigest);
  }
  const capture=await api.captureSharedIndependentDeliveryParticipant({
   participant:'second-device',principal:'alice',source:{session:f.current},assets:f.currentAssets,checkAuthority(){},
  });
  assert.equal(capture.kind,'ready');
  replica=capture.backup;
  const equal=await api.buildSharedIndependentDeliveryBranchArchive({
   ...host,current,incoming:{selection:replica.selection(),file:replica.file()},
  });
  assert.notEqual(equal.current.selection.identity.participant,equal.incoming.selection.identity.participant);
  for(const lane of ['document','review']){
   assert.equal(equal.comparison[lane].relation,'equal');
   assert.equal(equal.comparison[lane].currentThrough,equal.comparison[lane].commonThrough);
  }
 }finally{
  replica?.dispose();
  await f.close();
 }
});

function proposalOptions(f) {
 const point=offset=>({block:'p',offset:String(offset),affinity:'after'});
 const range=(start,end)=>({kind:'text',anchor:point(start),focus:point(end)});
 return {...options(f),source:f.options.incoming,sourceRange:range(0,10),target:f.current,
  targetRange:range(0,0),targetRevision:f.current.core.view().revision,
  namespace:'recovered-branch-text',title:'Recover selected text',createdAtMs:'80'};
}

test('projects exact native archived text into a separately queued proposal and cold reopens the packet',async()=>{
 const f=await participantUnionFixture(api,rich,profile,{wasm:native,branchFork:true,relaySeed:true,
  documentSegmented:true,reviewSegmented:true});
 let restored,queue;
 try{
  const before=f.current.exportRecovery(),input=proposalOptions(f),bytes=await fileBytes(input.source.file);
  const names=await indexedDB.databases();
  const prepared=await api.prepareSharedRecoveredBranchTextSuggestion(input);
  assert.equal(prepared.plainText,'Peer text ');
  assert.deepEqual(prepared.source.selection,input.source.selection);
  assert.ok(prepared.source.anchorJson);
  assert.equal(f.current.core.readSuggestion(prepared.packet).author,'alice');
  assert.equal(f.current.core.verifySuggestionSource(prepared.packet).kind,'verified');
  const preview=f.current.core.prepareSuggestion(prepared.packet);
  assert.equal(preview.kind,'ready');
  try{assert.match(preview.preview.documentJson(),/Peer text Common seed/);}
  finally{preview.preview.dispose();}
  assert.deepEqual(await indexedDB.databases(),names);
  assert.deepEqual(f.current.exportRecovery(),before);
  assert.deepEqual(await fileBytes(input.source.file),bytes);

  const info=f.currentParts.queue.queuePacket(prepared.packet);
  assert.equal(f.currentParts.queue.queuePacket(prepared.packet).id,info.id);
  await f.currentParts.queue.flush();
  assert.equal(f.currentParts.queue.status(info.id).publication,null);
  assert.deepEqual(f.current.exportRecovery().source,before.source);
  const recovery=f.current.exportRecovery();
  await f.current.close();
  restored=await api.SharedIndependentDeliverySession.restoreRecovery({
   ...f.chosen.options,database:f.tag+'-recovered-proposal-target',recovery,writerRecovery:'host-reacquired',
  });
  queue=await restored.openSuggestionQueue();
  assert.equal(queue.packet(info.id),prepared.packet);
  assert.equal(queue.status(info.id).publish,true);
  assert.deepEqual(restored.exportRecovery().source,before.source);
 }finally{
  await queue?.close();
  await restored?.discardAndClose();
  await f.close();
 }
});

test('refuses substituted bytes, empty ranges, foreign native origins and target edits during preparation',async()=>{
 const f=await participantUnionFixture(api,rich,profile,{wasm:native,branchFork:true,relaySeed:true});
 let foreign;
 try{
  const input=proposalOptions(f),before=f.current.exportRecovery();
  const changed=await fileBytes(input.source.file);
  changed[changed.length-1]^=1;
  await assert.rejects(api.prepareSharedRecoveredBranchTextSuggestion({
   ...input,source:{...input.source,file:new Blob([changed])},
  }));
  await assert.rejects(api.prepareSharedRecoveredBranchTextSuggestion({
   ...input,sourceRange:{...input.sourceRange,focus:input.sourceRange.anchor},
  }),/complete native quote/);
  assert.deepEqual(f.current.exportRecovery(),before);

  let changedTarget=false;
  await assert.rejects(api.prepareSharedRecoveredBranchTextSuggestion({
   ...input,checkAuthority(){
    if(changedTarget)return;
    changedTarget=true;
    f.current.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Later target '}}]});
   },
  }),/Target document changed/);
  assert.match(f.current.core.documentJson(),/Later target Common seed/);
  assert.doesNotMatch(f.current.core.documentJson(),/Peer text/);
  assert.deepEqual(f.current.exportRecovery().retained,before.retained);
  const unrelatedDocument=f.current.core.documentJson();
  await f.current.close();
  const unrelated=unrelatedDocument.replace('Common seed','Separate native seed');
  assert.match(unrelated,/Separate native seed/);
  foreign=await api.SharedIndependentDeliverySession.open({
   ...f.chosen.options,database:f.tag+'-foreign-proposal-target',
   create:()=>joinRelaySeed(api,profile,unrelated,f.chosen.options.writer),
  });
  await assert.rejects(api.prepareSharedRecoveredBranchTextSuggestion({
   ...input,target:foreign,targetRevision:foreign.core.view().revision,
  }),/different native document/);
 }finally{
  await foreign?.discardAndClose();
  await f.close();
 }
});

test('restores inline marks and a selected table with independently verified archived image bytes',async()=>{
 const f=await participantUnionFixture(api,rich,profile,{
  wasm:native,branchFork:true,relaySeed:true,archivedRich:true,
  documentSegmented:true,reviewSegmented:true,
 });
 try{
  const original=proposalOptions(f);
  const {sourceRange,...request}=original;
  const before=f.current.exportRecovery();
  const bytes=await fileBytes(request.source.file);
  const inline=await api.prepareSharedRecoveredBranchRichSuggestion({...request,sourceSelection:sourceRange});
  assert.equal(inline.plainText,'Peer text ');
  assert.deepEqual(inline.assets,[]);
  const styled=f.current.core.prepareSuggestion(inline.packet);
  assert.equal(styled.kind,'ready');
  try{
   const {children}=JSON.parse(styled.preview.documentJson()).root;
   assert.ok(children[0].children.some(run=>run.text==='Peer text '&&run.formats.some(mark=>mark.type==='breditor/strong')));
  }finally{styled.preview.dispose();}

  const point=column=>({table:'recovered-grid',row:'recovered-row',column});
  const table=await api.prepareSharedRecoveredBranchRichSuggestion({
   ...request,namespace:'recovered-table-proposal',
   sourceSelection:{kind:'grid',anchor:point('recovered-a'),focus:point('recovered-b')},
  });
  assert.equal(table.assets.length,1);
  const [asset]=table.assets;
  assert.equal(asset.source.generation,'recovered-generation');
  assert.notEqual(asset.target.generation,asset.source.generation);
  assert.equal(asset.target.asset,asset.source.asset);
  assert.equal('sha256:'+sha(Buffer.from(await asset.blob.arrayBuffer())),asset.contentAsset);
  const selected=f.current.core.prepareSuggestion(table.packet);
  assert.equal(selected.kind,'ready');
  try{
   const {children}=JSON.parse(selected.preview.documentJson()).root;
   const grid=children.find(child=>child.type==='breditor/table');
   assert.deepEqual(grid.properties['breditor/columns'].map(column=>column.width),[104,156]);
   assert.equal(grid.children[0].children[1].children[0].children[0].text,'Right cell');
   const recovered=grid.children[0].children[0].children[1];
   assert.equal(recovered.properties['breditor/asset-id'],asset.target.asset);
   assert.equal(recovered.properties['breditor/asset-generation'],asset.target.generation);
   assert.equal(recovered.children[0].children[0].text,'Retained image caption 🙂');
  }finally{selected.preview.dispose();}
  assert.deepEqual(f.current.exportRecovery(),before);
  assert.deepEqual(await fileBytes(request.source.file),bytes);
 }finally{
  await f.close();
 }
});

test('reads exactly one archived discussion through edits, hidden contributions and bounded pages', async () => {
 const f = await participantUnionFixture(api, rich, profile, {
  wasm: native, branchFork: true, relaySeed: true, archivedReview: true, reviewSegmented: true,
 });
 try {
  const host = options(f), source = f.options.incoming;
  const {thread, reply, edited} = f.archivedReview;
  const input = {...host, source, thread};
  const before = f.current.exportRecovery();
  const first = await api.readSharedRecoveredBranchReviewThread(input);
  assert.equal(first.page.events.length, 16);
  assert.equal(first.page.nextOffset, 16);
  assert.deepEqual(first.page.thread, thread);
  assert.deepEqual(first.source, source.selection);
  assert.equal(first.page.events[0].payload.data.data.body, 'Originally authored offline');
  assert.ok(Object.isFrozen(first.page.events[0].payload.data.data));
  const last = await api.readSharedRecoveredBranchReviewThread({...input, offset: first.page.nextOffset});
  assert.equal(last.page.nextOffset, null);
  const events = [...first.page.events, ...last.page.events];
  assert.equal(events.length, 23);
  assert.deepEqual(events.map(entry => entry.index), Array.from({length: 23}, (_, index) => index));
  assert.ok(events.every(entry => entry.principal === 'alice'));
  assert.equal(new Set(events.map(entry => entry.digest)).size, events.length);
  assert.deepEqual(events[17].id, edited);
  assert.equal(events[17].payload.data.data.body, 'Edited archived reply');
  assert.deepEqual(events[18].payload.data.data.message, reply);
  assert.deepEqual(events.slice(-2).map(entry => entry.payload.data.visible), [false, true]);
  assert.equal(events.some(entry => JSON.stringify(entry).includes('Unrelated discussion')), false);
  await assert.rejects(api.readSharedRecoveredBranchReviewThread({...input, offset: 24}));
  await assert.rejects(api.readSharedRecoveredBranchReviewThread({...input, thread: reply}));
  assert.deepEqual(f.current.exportRecovery(), before);
 } finally { await f.close(); }
});

test('recovers a hidden original as a fresh authored message and rejects substitutions or stale live state', async () => {
 const f = await participantUnionFixture(api, rich, profile, {
  wasm: native, branchFork: true, relaySeed: true, documentSegmented: true, reviewSegmented: true,
 });
 try {
  const source = f.options.incoming;
  const own = f.chosen.options.review.actor;
  const thread = {actor: own, counter: '2'};
  const request = {...options(f), source, thread};
  const {page} = await api.readSharedRecoveredBranchReviewThread(request);
  const [birth, undo] = page.events;
  assert.deepEqual(birth.id, thread);
  assert.equal(birth.payload.data.data.body, 'Incoming comment Redo');
  assert.deepEqual(undo.payload, {kind: 'visibility', data: {target: thread, visible: false}});
  const local = f.current.core.readReviewThreadHistory(thread).events[0];
  assert.deepEqual(local.id, birth.id);
  assert.notEqual(local.digest, birth.digest);
  assert.equal(local.payload.data.data.body, 'Local comment Redo');

  const core = f.current.core;
  const guard = core.reviewSnapshot();
  const event = {thread, index: birth.index, id: birth.id, digest: birth.digest};
  const input = {...options(f), source, event, target: f.current, guard,
   destination: {kind: 'new_thread', target: {kind: 'document'}}};
  const before = f.current.exportRecovery(), bytes = await fileBytes(source.file);
  await assert.rejects(api.prepareSharedRecoveredBranchReviewMessage({...input, event: {...event, digest: local.digest}}),
   /differs from the original archive/);
  const visibility = {...event, index: undo.index, id: undo.id, digest: undo.digest};
  await assert.rejects(api.prepareSharedRecoveredBranchReviewMessage({...input, event: visibility}), /message body/);
  const peerThread = {actor: 'peer-comments', counter: '1'};
  const peer = (await api.readSharedRecoveredBranchReviewThread({...request, thread: peerThread})).page.events[0];
  await assert.rejects(api.prepareSharedRecoveredBranchReviewMessage({...input,
   event: {thread: peerThread, index: peer.index, id: peer.id, digest: peer.digest}}), /same account/);

  const prepared = await api.prepareSharedRecoveredBranchReviewMessage(input);
  assert.deepEqual(f.current.exportRecovery(), before);
  assert.equal(prepared.principal, 'alice');
  assert.equal(prepared.body, 'Incoming comment Redo');
  const stale = await api.prepareSharedRecoveredBranchReviewMessage({...input,
   destination: {kind: 'reply', thread: {actor: own, counter: '1'}}});
  const result = prepared.commit();
  assert.equal(result.kind, 'committed');
  assert.notDeepEqual(result.event, birth.id);
  assert.throws(() => prepared.commit(), /already committed/);
  assert.throws(() => stale.commit(), /changed during recovery/);
  const snapshot = core.reviewSnapshot();
  const restored = snapshot.view.threads.find(item => item.thread.id.counter === result.event.counter &&
   item.thread.id.actor === result.event.actor);
  assert.equal(restored.thread.author, 'alice');
  assert.equal(restored.thread.messages[0].versions[0].text, 'Incoming comment Redo');
  assert.equal(core.undoReview().kind, 'committed');
  assert.equal(core.redoReview().kind, 'committed');

  const reply = await api.prepareSharedRecoveredBranchReviewMessage({...input, guard: core.reviewSnapshot(),
   destination: {kind: 'reply', thread: {actor: own, counter: '1'}}});
  assert.equal(reply.commit().kind, 'committed');
  const common = core.reviewSnapshot().view.threads.find(item => item.thread.id.counter === '1');
  assert.equal(common.thread.messages.at(-1).versions[0].text, 'Incoming comment Redo');
  assert.deepEqual(f.current.exportRecovery().source.documentCheckpoint, before.source.documentCheckpoint);
  assert.deepEqual(await fileBytes(source.file), bytes);
 } finally { await f.close(); }
});
