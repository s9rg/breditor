/** Mandatory private seven-family checks add to, not replace, older domains. */
import test from 'node:test';import assert from 'node:assert/strict';import{candidateReleasePlan}from'./candidate-release/plan.mjs';
test('both profiles retain closed seven-family qualification and every existing recovery domain',()=>{
 for(const profile of['functional','full']){
  const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);for(const id of['physical-catalog-v3-contracts','physical-catalog-v3-type-fence','physical-catalog-v3','installed-physical-catalog-v3'])assert.equal(ids.filter(value=>value===id).length,1,id);
  const contracts=plan.checks.find(row=>row.id==='physical-catalog-v3-contracts');for(const path of['scripts/physical-catalog-v3-source.test.mjs','scripts/physical-catalog-v3.test.mjs','scripts/physical-catalog-v3-storage.test.mjs','scripts/physical-catalog-v3-candidate-plan.test.mjs'])assert.ok(contracts.args.includes(path));
  const types=plan.checks.find(row=>row.id==='physical-catalog-v3-type-fence');for(const flag of['--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','scripts/fixtures/editor-consumer/types-physical-catalog-v3.ts'])assert.ok(types.args.includes(flag));
  for(const id of['physical-catalog-v3','installed-physical-catalog-v3']){const row=plan.checks.find(value=>value.id===id);assert.ok(ids.indexOf('collaboration-build')<ids.indexOf(id));assert.ok(ids.indexOf('native-server-generation-inventory')<ids.indexOf(id));assert.equal(row.timeoutMs,1800000);assert.equal(row.artifacts.length,1);assert.equal(row.artifacts[0].fresh,true);}
  for(const id of['physical-catalog-v2','installed-physical-catalog-v2','independent-inventory','installed-independent-inventory','flat-local-participant','installed-flat-local-participant','restored-local-participant','installed-restored-local-participant','restored-local-journal','installed-restored-local-journal','native-input-incoming-source','installed-native-input-incoming-source','physical-room-stage','physical-room-operation'])assert.ok(ids.includes(id),id);
 }
});
