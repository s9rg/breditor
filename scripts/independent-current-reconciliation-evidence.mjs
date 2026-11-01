/** Require three distinct real Native policy pairs and exact future comment
 * content checks. A repeated default family cannot satisfy this acceptance. */
import assert from 'node:assert/strict';
const ids=['generation','independent-delivery','independent-local','local-operation-flat','local-operation-snapshot','original','restored-graph'];
const selected=new Set(['original/original','original/segmented-v1','segmented-v1/original']);
const key=value=>value.document+'/'+value.review;
const parse=(log,marker)=>[...log.matchAll(new RegExp('^# '+marker+' (\\{[^\\n]+\\})$','gm'))].map(row=>JSON.parse(row[1]));
function checkPolicies(rows,choice){
 assert.equal(rows.length,7);assert.deepEqual(rows.map(row=>row.id).sort(),ids);
 for(const row of rows){const expected=row.id==='original'?{document:'original',review:'original'}:row.id==='generation'?{document:'segmented-v1',review:'original'}:{document:choice.document,review:choice.review};assert.deepEqual({document:row.document,review:row.review},expected,row.id);}
}
export function checkIndependentCurrentEvidence(log){
 const observations=parse(log,'INDEPENDENT_CURRENT_RECONCILIATION_NATIVE'),future=parse(log,'INDEPENDENT_FUTURE_NATIVE_HISTORIES'),current=parse(log,'LAZY_VERSION_RECONCILIATION_NATIVE');
 assert.equal(observations.length,3);assert.equal(future.length,3);assert.equal(current.length,3);
 assert.deepEqual(new Set(observations.map(row=>key(row.selected))),selected);
 for(const row of observations){assert.equal(row.participants,7);assert.equal(row.policiesUnchanged,true);assert.equal(row.originalPendingPreserved,true);assert.equal(row.forbiddenBodyDownloads,0);assert.equal(row.providerAssets,3);assert.equal(row.uploadRoles,14);assert.equal(row.futureDocumentAndReviewUndoRedo,true);assert.equal(row.wholeRoomActivated,false);checkPolicies(row.actualNativePolicies,row.selected);}
 assert.deepEqual(new Set(future.map(row=>key(row.rows.find(item=>item.id==='independent-local')))),selected);
 for(const row of future){assert.equal(row.participants,7);const choice=row.rows.find(item=>item.id==='independent-local');assert.ok(choice);checkPolicies(row.rows,choice);for(const client of row.rows){assert.equal(client.exactFutureDocumentRestored,true);assert.equal(client.exactFutureCommentViewRestored,true);assert.match(client.documentSha256,/^[a-f0-9]{64}$/);assert.match(client.reviewViewSha256,/^[a-f0-9]{64}$/);}}
 for(const row of current){assert.equal(row.participants,7);assert.equal(row.currentKind,'checked');assert.equal(row.originalKind,'pending');assert.equal(row.cacheCalls,0);assert.equal(row.forbiddenBodyDownloads,0);assert.ok(row.currentData&&row.currentData.bytes>0);assert.match(row.currentData.sha256,/^[a-f0-9]{64}$/);assert.equal(row.currentProviderMissing,0);}
 return {observations,future,current};
}
