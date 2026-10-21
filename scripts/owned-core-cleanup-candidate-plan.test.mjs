/** Both plans require actual terminal resource custody, native replay and fresh installed consumers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires owned-core cleanup without substituting a status flag for lease release',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);for(const id of ['owned-core-cleanup-plan-contracts','owned-core-cleanup-contracts','owned-core-cleanup-type-fence','owned-core-cleanup','installed-owned-core-cleanup','independent-participant','installed-independent-participant','independent-history-sdk','installed-independent-history','canonical-source-readers','physical-recovery-control','physical-recovery-assets','collaboration-build'])assert.equal(ids.filter(value=>value===id).length,1,id);
 for(const[id,path]of [['owned-core-cleanup','target/owned-core-cleanup-sdk.json'],['installed-owned-core-cleanup','target/owned-core-cleanup-installed.json']]){const row=plan.checks.find(value=>value.id===id);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(ids.indexOf('collaboration-build')<ids.indexOf(id));}assert.ok(ids.indexOf('owned-core-cleanup')<ids.indexOf('installed-owned-core-cleanup'));assert.equal(plan.v1Ready,false);
});
