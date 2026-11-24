import test from 'node:test';import assert from 'node:assert/strict';import {candidateShardPlan} from './candidate-release/shards.mjs';
import {candidateReleasePlan} from './candidate-release/plan.mjs';import {generationComponentReconstructionWorkload as workload} from './generation-component-reconstruction-workload.mjs';import {generationNativeReconstructionWorkload as prior} from './generation-native-reconstruction-workload.mjs';
for(const profile of ['functional','full'])test(profile+' preserves previous laws and adds exact installed/bundled mixed-component recovery',()=>{
 assert.equal(workload.assertions,120);assert.equal(workload.priorReconstructionAssertions,prior.assertions);assert.equal(workload.newComponentAssertions,12);assert.deepEqual(workload.tests.slice(0,prior.tests.length),prior.tests);assert.deepEqual(workload.types.slice(0,prior.types.length),prior.types);assert.equal(new Set(workload.tests).size,workload.tests.length);assert.equal(new Set(workload.types).size,7);
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));for(const id of ['generation-native-reconstruction','installed-generation-native-reconstruction','generation-native-execution','installed-generation-native-execution','native-execution','installed-native-execution'])find(id);assert.deepEqual(find('generation-component-reconstruction-type-fence').args.slice(-workload.types.length),workload.types.map(name=>'scripts/fixtures/editor-consumer/'+name));
 for(const[id,file,artifact,timeout]of [['generation-component-reconstruction','check-generation-component-reconstruction-sdk.mjs','target/generation-component-reconstruction-sdk.json',18000000],['installed-generation-component-reconstruction','check-generation-component-reconstruction-installed.mjs','target/generation-component-reconstruction-installed-consumer.json',21600000]]){const check=find(id);assert.deepEqual(check.args,['scripts/'+file]);assert.deepEqual(check.artifacts,[{path:artifact,fresh:true,retain:true}]);assert.equal(check.requiresSharedRuntime,true);assert.ok(check.timeoutMs>=timeout);for(const dependency of ['rich-browser-build','collaboration-build','generation-component-reconstruction-contracts','generation-component-reconstruction-type-fence'])assert.ok(position(dependency)<position(id));}assert.equal(plan.v1Ready,false);
});

test('component reconstruction shards retain independent source and installed runs with both native producers',()=>{
 const plan=candidateReleasePlan();
 for(const [shard,stage] of [
  ['generation-component-reconstruction-source','generation-component-reconstruction'],
  ['generation-component-reconstruction-installed','installed-generation-component-reconstruction'],
 ]){
  const {prerequisites,stages}=candidateShardPlan(plan,shard).shard;
  assert.deepEqual(prerequisites.slice(-2),['native-complete-cohort','native-complete-image-cohort']);
  assert.equal(stages.at(-1),stage);
 }
});
