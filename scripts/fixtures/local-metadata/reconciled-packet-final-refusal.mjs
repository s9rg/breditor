/** A final-result disposal must refuse and retire the actual capture owner.
 * Run only at teardown, after the ordinary complete capture has been retained. */
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {controls} from '../selected-delivery/cold-continuation.mjs';
import {localReviewRaw} from '../selected-delivery/local-review-evidence.mjs';
import {PacketRasterFixtureImage} from './packet-raster.mjs';
import {SharedRelayAssets} from '../../../packages/breditor-collaboration/dist/relay/assets.js';
import {independentHistoryNative} from '../../../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
export async function testReconciledPacketFinalRefusal({scope,sources,metadata,host,first,fixture,check}) {
 const choice=metadata.identity(),before=await localReviewRaw(choice.database),lanes=metadata.recovery().current.lanes;
 const stamps=new Map(sources.map(row=>[row.id,coreReadStamp(row.source.core)]));
 const image=Object.getOwnPropertyDescriptor(globalThis,'Image'),freeze=Object.freeze;
 let current,transport,triggered=false,cacheCalls=0;
 Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});
 try {
  current=await controls(host,first,scope);
  const source=sources.find(row=>row.source.parent.kind==='independent-local');assert.ok(source);
  const identity=independentHistoryNative(source.source.parent.session).identity;
  const client=fixture.clients.find(row=>row.writer===identity.native.writer&&row.actor===identity.review.actor);assert.ok(client);
  const auth=await host.authentication(client);
  transport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:{async resolve(){cacheCalls++;throw Error('No final-refusal cache read');},async cacheRemote(){cacheCalls++;throw Error('No final-refusal cache write');}}});
  Object.freeze=function(value){
   const frozen=Reflect.apply(freeze,Object,[value]);
   if(value?.format==='breditor/reconciled-server-packet-recovery'&&!triggered){triggered=true;current.server.dispose();}
   return frozen;
  };
  try {
   await assert.rejects(metadata.captureReconciledServerPacketRecovery({host:current.previous,inventory:current.inventory,server:current.server,transport}));
   assert.equal(triggered,true,'The fault must run at final result construction, after real byte/current capture');
  }finally{Object.freeze=freeze;}
  scope.check();check();
  const after=await localReviewRaw(choice.database);
  assert.equal(after.before,before.before);
  assert.deepEqual(JSON.parse(after.current).lanes,lanes);
  for(const row of sources)assert.deepEqual(coreReadStamp(row.source.core),stamps.get(row.id));
  // The existing parent capture law deliberately retires a failed attempt.
  // Read persisted facts directly; a retired owner must not be reused.
  assert.throws(()=>metadata.recovery());assert.equal(cacheCalls,0);
  const report={format:'breditor/reconciled-recovery-final-refusal',formatVersion:1,triggeredAtFinalResult:true,refused:true,metadataOwnerRetired:true,metadataLanesUnchanged:true,nativeStampsUnchanged:true,nativeParticipants:sources.length,cacheCalls,wholeRoomActivated:false};
  const file=join(host.directory,'reconciled-recovery-final-refusal.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
  writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);
  console.log('RECONCILED_RECOVERY_FINAL_REFUSAL '+JSON.stringify({file,sha256:createHash('sha256').update(bytes).digest('hex'),...report}));
 }finally{
  Object.freeze=freeze;transport?.dispose();current?.close();
  if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;
 }
}
