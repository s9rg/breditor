/** Both plans require explicit borrowed history lanes and unchanged public-package boundaries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires genuine native-history lanes without retagging old archive families',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);for(const id of ['native-history-read-plan-contracts','native-history-read-contracts','native-history-read-type-fence','native-history-read','installed-native-history-read','owned-core-cleanup','installed-owned-core-cleanup','independent-participant','installed-independent-participant','independent-history-sdk','installed-independent-history','canonical-source-readers','physical-recovery-control','physical-recovery-assets','collaboration-build'])assert.equal(ids.filter(value=>value===id).length,1,id);
 for(const[id,path]of [['native-history-read','target/native-history-read-sdk.json'],['installed-native-history-read','target/native-history-read-installed.json']]){const row=plan.checks.find(value=>value.id===id);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(ids.indexOf('collaboration-build')<ids.indexOf(id));}assert.ok(ids.indexOf('native-history-read')<ids.indexOf('installed-native-history-read'));assert.equal(plan.v1Ready,false);
});
