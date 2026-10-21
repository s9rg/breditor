/** Both plans require the exact independent family, native future-history tests and offline consumer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires independent participant recovery rather than inheriting old archive qualification',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['independent-participant-plan-contracts','independent-participant-contracts','independent-participant-type-fence','independent-participant','installed-independent-participant','independent-history-sdk','installed-independent-history','canonical-source-readers','installed-canonical-source-readers','collaboration-build'])assert.equal(ids.filter(value=>value===id).length,1,id);
 for(const[id,path]of [['independent-participant','target/independent-participant-sdk.json'],['installed-independent-participant','target/independent-participant-installed.json']]){const row=plan.checks.find(value=>value.id===id);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(ids.indexOf('collaboration-build')<ids.indexOf(id));}assert.ok(ids.indexOf('independent-participant')<ids.indexOf('installed-independent-participant'));assert.equal(plan.v1Ready,false);
});
