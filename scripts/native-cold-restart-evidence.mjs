/** Require all four literal Native history pairs, real epoch evidence and exact future histories. */
import assert from 'node:assert/strict';
const ids=['generation','independent-delivery','independent-local','local-operation-flat','local-operation-snapshot','original','restored-graph'];
const pairs=new Set(['original/original','original/segmented-v1','segmented-v1/original','segmented-v1/segmented-v1']);
const key=value=>value.document+'/'+value.review;
const parse=(log,marker)=>[...log.matchAll(new RegExp('^# '+marker+' (\\{[^\\n]+\\})$','gm'))].map(row=>JSON.parse(row[1]));
const hash=value=>assert.match(value,/^[a-f0-9]{64}$/);
function policies(rows){
 assert.equal(rows.length,7);assert.deepEqual(rows.map(row=>row.id).sort(),ids);const selected=rows.find(row=>row.id==='independent-local');assert.ok(selected);
 for(const row of rows){const expected=row.id==='original'?{document:'original',review:'original'}:row.id==='generation'?{document:'segmented-v1',review:'original'}:{document:selected.document,review:selected.review};assert.deepEqual({document:row.document,review:row.review},expected,row.id);}
 return key(selected);
}
export function checkNativeColdEvidence(log){
 const cold=parse(log,'COLD_CURRENT_RECONCILIATION_NATIVE'),future=parse(log,'INDEPENDENT_FUTURE_NATIVE_HISTORIES'),authentication=parse(log,'NATIVE_COLD_RESTART_AUTHENTICATION');
 assert.equal(cold.length,4);assert.equal(future.length,8);assert.equal(authentication.length,1);
 assert.deepEqual(new Set(cold.map(row=>policies(row.actualNativePolicies))),pairs);
 for(const row of cold){
  for(const [field,n]of Object.entries({nativeParticipants:7,freshNativeOwners:7,retainedRealUploadAcks:3,retainedOfflineLanes:14,authenticatedDeliveryPasses:2,forbiddenBodyDownloads:0,actualCacheCalls:0}))assert.equal(row[field],n,field);
  for(const field of ['originalVersionCachesStillPending','originalMetadataUnchanged','exactFutureDocumentAndCommentRestored'])assert.equal(row[field],true,field);assert.equal(row.wholeRoomActivated,false);
  assert.equal(row.nativeRestart.actualNativeServiceRestart,true);const observation=row.nativeRestart.observation;
  assert.equal(observation.format,'breditor/native-joint-restart-observation');assert.equal(observation.request,row.nativeRestart.sequence);assert.notDeepEqual(observation.prior,observation.current);
  for(const field of ['sameOperationalDirectory','freshAccountAuthentication','allProtectedRegistrationsVerified','actualNativeEpochCommitted'])assert.equal(observation[field],true,field);assert.equal(observation.wholeRoomActivated,false);hash(observation.sha256);assert.ok(observation.bytes>0);
  hash(row.nativeRestart.retainedClientArchive.sha256);assert.ok(row.nativeRestart.retainedClientArchive.bytes>0);
  assert.deepEqual(row.files.map(file=>file.name).sort(),['cold-current-checked.json','cold-current-metadata.json','cold-current-pending.json','cold-current-review.json','cold-current-room.archive']);
  for(const file of row.files){hash(file.sha256);assert.ok(file.bytes>0);}
 }
 const seen=new Map();for(const row of future){assert.equal(row.participants,7);const pair=policies(row.rows);seen.set(pair,(seen.get(pair)??0)+1);for(const client of row.rows){assert.equal(client.exactFutureDocumentRestored,true);assert.equal(client.exactFutureCommentViewRestored,true);hash(client.documentSha256);hash(client.reviewViewSha256);}}
 assert.deepEqual(new Set(seen.keys()),pairs);for(const value of seen.values())assert.equal(value,2);
 const auth=authentication[0];assert.equal(auth.restarts,2);assert.equal(auth.protectedAuthors,7);assert.equal(auth.expiredTokensRejected,true);assert.equal(auth.originalRoomAndRastersUnchanged,true);assert.equal(auth.wholeRoomActivated,false);assert.equal(auth.records.length,2);for(const row of auth.records){hash(row.sha256);assert.ok(row.bytes>0);}
 return {cold,future,authentication};
}
