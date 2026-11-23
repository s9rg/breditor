/** Synthetic evidence-parser laws; these do not execute or replace Native acceptance. */
import test from 'node:test';import assert from 'node:assert/strict';
import {checkNativeColdEvidence} from './native-cold-restart-evidence.mjs';
const ids=['generation','independent-delivery','independent-local','local-operation-flat','local-operation-snapshot','original','restored-graph'],hash='a'.repeat(64);
const file=name=>({name,bytes:1,sha256:hash});
function fixture(){
 const cold=[],future=[];
 for(const [document,review]of [['original','original'],['original','segmented-v1'],['segmented-v1','original'],['segmented-v1','segmented-v1']]){
  const rows=ids.map(id=>({id,...(id==='original'?{document:'original',review:'original'}:id==='generation'?{document:'segmented-v1',review:'original'}:{document,review})}));
  cold.push({actualNativePolicies:rows,nativeParticipants:7,freshNativeOwners:7,retainedRealUploadAcks:3,retainedOfflineLanes:14,authenticatedDeliveryPasses:2,forbiddenBodyDownloads:0,actualCacheCalls:0,originalVersionCachesStillPending:true,originalMetadataUnchanged:true,exactFutureDocumentAndCommentRestored:true,wholeRoomActivated:false,nativeRestart:{actualNativeServiceRestart:true,sequence:1,retainedClientArchive:{bytes:1,sha256:hash},observation:{format:'breditor/native-joint-restart-observation',request:1,prior:{epoch:1},current:{epoch:2},sameOperationalDirectory:true,freshAccountAuthentication:true,allProtectedRegistrationsVerified:true,actualNativeEpochCommitted:true,wholeRoomActivated:false,bytes:1,sha256:hash}},files:['cold-current-checked.json','cold-current-metadata.json','cold-current-pending.json','cold-current-review.json','cold-current-room.archive'].map(file)});
  for(let pass=0;pass<2;pass++)future.push({participants:7,rows:rows.map(row=>({...row,exactFutureDocumentRestored:true,exactFutureCommentViewRestored:true,documentSha256:hash,reviewViewSha256:hash}))});
 }
 return {cold,future,authentication:[{restarts:2,protectedAuthors:7,expiredTokensRejected:true,originalRoomAndRastersUnchanged:true,records:[file('one'),file('two')],wholeRoomActivated:false}]};
}
const log=value=>Object.entries({cold:'COLD_CURRENT_RECONCILIATION_NATIVE',future:'INDEPENDENT_FUTURE_NATIVE_HISTORIES',authentication:'NATIVE_COLD_RESTART_AUTHENTICATION'}).flatMap(([key,marker])=>value[key].map(row=>'# '+marker+' '+JSON.stringify(row))).join('\n')+'\n';
test('complete parser fixture requires four independent pairs and both exact future-history observations',()=>{const result=checkNativeColdEvidence(log(fixture()));assert.equal(result.cold.length,4);assert.equal(result.future.length,8);});
test('a shard requires evidence for its exact pair or for restart authentication',()=>{
 const {cold,future,authentication}=fixture();
 const selected={cold:[cold[1]],future:future.slice(2,4),authentication:[]};
 assert.equal(checkNativeColdEvidence(log(selected),'original/segmented-v1').cold.length,1);
 assert.throws(()=>checkNativeColdEvidence(log(selected),'segmented-v1/original'));
 assert.throws(()=>checkNativeColdEvidence(log({...selected,future:future.slice(0,2)}),'original/segmented-v1'));
 assert.equal(checkNativeColdEvidence(log({cold:[],future:[],authentication}),null).authentication.length,1);
 assert.throws(()=>checkNativeColdEvidence(log(fixture()),null));
});
for(const [name,change]of [
 ['omitted independent policy pair',value=>value.cold.pop()],
 ['repeated default policy pair',value=>value.cold[3].actualNativePolicies=value.cold[0].actualNativePolicies],
 ['unchanged Native epoch',value=>value.cold[0].nativeRestart.observation.current=value.cold[0].nativeRestart.observation.prior],
 ['lost offline suffix',value=>value.cold[0].retainedOfflineLanes=13],
 ['lost real upload acknowledgement',value=>value.cold[0].retainedRealUploadAcks=2],
 ['silently populated version cache',value=>value.cold[0].actualCacheCalls=1],
 ['missing exact comment restoration',value=>value.future[0].rows[0].exactFutureCommentViewRestored=false],
 ['accepted expired account token',value=>value.authentication[0].expiredTokensRejected=false],
])test('evidence refuses '+name,()=>{const value=fixture();change(value);assert.throws(()=>checkNativeColdEvidence(log(value)));});
