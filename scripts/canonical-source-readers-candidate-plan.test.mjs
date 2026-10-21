/** Actual native source readers cannot be replaced by mutable facade metadata during qualification. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires canonical native source and installed regressions',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['canonical-source-readers-plan-contracts','canonical-source-readers','installed-canonical-source-readers','collaboration-build','physical-recovery-assets','installed-physical-recovery-assets','physical-recovery-control','installed-physical-recovery-control','typescript-tests-and-script-contracts'])assert.equal(ids.filter(value=>value===id).length,1,id);
 assert.ok(ids.indexOf('collaboration-build')<ids.indexOf('canonical-source-readers'));assert.ok(ids.indexOf('canonical-source-readers')<ids.indexOf('installed-canonical-source-readers'));
 for(const[id,path]of [['canonical-source-readers','target/canonical-source-readers-sdk.json'],['installed-canonical-source-readers','target/canonical-source-readers-installed.json']])assert.ok(plan.checks.find(row=>row.id===id).artifacts.some(file=>file.path===path&&file.fresh===true));assert.equal(plan.v1Ready,false);
});
