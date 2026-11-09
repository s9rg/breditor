/** Actual legacy-origin migration through authenticated provider and client reconciliation. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {generationCompleteControlFixtures} from './fixtures/generation-recovery-control/complete-fixtures.mjs';
import {completeControlTransport} from './fixtures/physical-recovery-control/complete-transport.mjs';
import {generationBoundSession} from './fixtures/selected-generation-reconciliation/all-bound.mjs';
import {generationSelectedSession,selectedNativePairs} from './fixtures/selected-generation-reconciliation/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {pixelAsset,secondAsset} from './fixtures/review-assets/pixels.mjs';

let fixtures,transport,item,data;
before(async()=>{
 fixtures=await generationCompleteControlFixtures(new URL('../',import.meta.url).pathname,{migrated:true});
 [item]=fixtures.manifest.cases;
 data=fixtures.fixture(item);
 transport=completeControlTransport(fixtures.manifest);
});
after(async()=>{transport?.restore();await fixtures?.close();});

const sha=bytes=>[...createHash('sha256').update(bytes).digest()];
function envelope(file,magic){
 const magicBytes=Buffer.from(magic);
 assert.deepEqual(file.subarray(0,magicBytes.length),magicBytes);
 const prefix=magicBytes.length+4+32;
 const headerEnd=prefix+file.readUInt32BE(magicBytes.length);
 const header=file.subarray(prefix,headerEnd);
 assert.deepEqual(sha(header),[...file.subarray(prefix-32,prefix)]);
 return {header:JSON.parse(header),body:file.subarray(headerEnd)};
}
function section(body,{offset,bytes,sha256}){
 const file=body.subarray(offset,offset+bytes);
 assert.equal(file.length,bytes);
 assert.deepEqual(sha(file),sha256);
 return file;
}

test('the authenticated migrated control descends from the exact original WAL and rasters',()=>{
 assert.deepEqual([data.language,data.standard,data.atomic],[3,true,true]);
 const input=name=>readFileSync(join(dirname(item.path),name));
 const original=input('legacy-server.backup'),legacy=data.legacyMigration;
 assert.deepEqual(sha(original),legacy.archiveSha256);
 const prior=envelope(original,'BREDITOR-SERVER1\n');
 const wal=input('legacy-native.wal');
 for(const [name,selection] of [
  ['older-server.backup',null],
  ['server.backup',item.selection.source.origin],
  ['server-after.backup',item.selection.source.server],
 ]){
  const bytes=input(name),joined=envelope(bytes,'BREDITOR-SERVER-GENERATIONS1\n');
  if(selection)assert.deepEqual(sha(bytes),selection.archiveSha256);
  else assert.deepEqual(joined.header.native.source,legacy.room);
  assert.deepEqual(section(joined.body,joined.header.rasters),section(prior.body,prior.header.rasters));
  const native=envelope(section(joined.body,joined.header.log),'BREDITOR-RELAY-GENERATIONS1\n');
  const files=new Map(native.header.files.map(part=>[part.name,section(native.body,part)]));
  const manifestName='m-'+Buffer.from(native.header.manifest).toString('hex')+'.json';
  const manifest=JSON.parse(files.get(manifestName));
  assert.equal(manifest.formatVersion,2);
  assert.equal(manifest.root.records,legacy.room.records);
  assert.deepEqual(manifest.root.terminal,legacy.room.terminalLogDigest);
  assert.ok([...files.values()].some(bytes=>bytes.equals(wal)));
 }
 assert.ok(item.selection.source.origin.native.source.records>legacy.room.records);
 assert.ok(item.selection.source.server.native.source.records>item.selection.source.origin.native.source.records);
});

function verifiedProvider(report,firstRequest){
 assert.equal(report.provider.kind,'checked');
 assert.deepEqual(report.provider.control.source,item.selection.source);
 assert.equal(report.provider.uploads.length,14);
 assert.deepEqual(report.provider.provider.missing,[]);
 const available=new Set(report.provider.provider.assets.map(row=>row.asset));
 assert.ok(available.has(pixelAsset));
 assert.ok(available.has(secondAsset),'The unreferenced retained raster must be checked too');
 assert.ok(transport.requests.slice(firstRequest).some(row=>row.assets&&row.uploads>=2));
}

test('migrated reconciliation authenticates the seven original protected document and review pairs',async()=>{
 const session=await generationBoundSession(fixtures,'migrated-bound');
 try{
  const native=selectedNativePairs(session.owner,false),db=await snapshotReadDatabases();
  session.allowToken(false);
  await assert.rejects(session.owner.readGenerationReconciliation(session.host,session.input()));
  session.allowToken(true);
  const firstRequest=transport.requests.length;
  const report=await session.owner.readGenerationReconciliation(session.host,session.input());
  assert.equal(report.native.kind,'covered');
  assert.equal(report.native.ownStreams.kind,'covered');
  assert.equal(report.native.documentAuthors.filter(row=>row.kind==='registered').length,7);
  assert.equal(report.native.reviewAuthors.length,7);
  assert.equal(report.native.participants.length,7);
  assert.ok(report.heads.length>0);
  assert.ok(report.heads.every(row=>row.relation==='local-ahead'));
  assert.equal(report.kind,'pending');
  verifiedProvider(report,firstRequest);
  assert.deepEqual(selectedNativePairs(session.owner,false),native);
  assert.deepEqual(await snapshotReadDatabases(),db);
 }finally{await session.close();}
});

for(const [documentSegmented,reviewSegmented] of [[false,false],[false,true],[true,false],[true,true]]){
 test(`migrated reconciliation preserves seven native client families after cold reopen ${documentSegmented}/${reviewSegmented}`,async()=>{
  const tag='migrated-families-'+Number(documentSegmented)+Number(reviewSegmented);
  const session=await generationSelectedSession(fixtures,tag,{documentSegmented,reviewSegmented});
  try{
   const before=await snapshotReadDatabases(),native=selectedNativePairs(session.owner,reviewSegmented);
   const firstRequest=transport.requests.length;
   const report=await session.read();
   assert.equal(new Set(session.owner.clients.map(row=>row.family)).size,7);
   assert.equal(report.native.participants.length,7);
   assert.equal(report.kind,'pending');
   assert.ok(report.heads.some(row=>row.relation==='server-ahead'));
   assert.ok(report.native.participants.some(row=>row.review.kind==='unbound'));
   verifiedProvider(report,firstRequest);
   assert.deepEqual(selectedNativePairs(session.owner,reviewSegmented),native);
   assert.deepEqual(await snapshotReadDatabases(),before);

   await session.cold(await session.retain());
   const coldDb=await snapshotReadDatabases(),cold=await session.read();
   assert.deepEqual(cold.native,report.native);
   assert.deepEqual(cold.heads,report.heads);
   assert.deepEqual(cold.provider.provider.assets,report.provider.provider.assets);
   assert.deepEqual(selectedNativePairs(session.owner,reviewSegmented),native);
   assert.deepEqual(await snapshotReadDatabases(),coldDb);
   for(const {core} of session.owner.clients){
    const document=core.documentJson(),comments=core.reviewSnapshot().view;
    assert.equal(core.redo(),true);
    assert.equal(core.undo(),true);
    assert.equal(core.documentJson(),document);
    assert.equal(core.redoReview().kind,'committed');
    assert.equal(core.undoReview().kind,'committed');
    assert.deepEqual(core.reviewSnapshot().view,comments);
   }
   assert.equal(session.f.f.counts.networkCalls,0);
  }finally{await session.close();}
 });
}
