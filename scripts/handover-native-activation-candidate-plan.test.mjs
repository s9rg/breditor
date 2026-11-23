import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {candidateShardPlan} from './candidate-release/shards.mjs';
for(const profile of ['functional','full'])test(profile+' requires actual SDK handover activation and installed closure',()=>{
 const plan=candidateReleasePlan({profile}),at=id=>{const value=plan.checks.findIndex(row=>row.id===id);assert.ok(value>=0,id);return value;};
 for(const id of ['handover-native-activation-host','handover-native-activation-native','installed-handover-native-activation'])assert.ok(at('native-handover-activation-host-build')<at(id));
 const contracts=at('handover-native-activation-contracts');
 assert.ok(at('paired-shared-runtime')<contracts);
 assert.equal(plan.checks[contracts].requiresSharedRuntime,true);
 assert.ok(plan.checks[at('handover-native-activation-host')].args.includes('scripts/native-sealed-handover-process-recovery.test.mjs'));
 assert.ok(plan.checks[at('handover-native-activation-host')].args.includes('scripts/native-sealed-published-process-recovery.test.mjs'));
 assert.ok(at('handover-activation-intent-native')<at('handover-native-activation-native'));
 assert.ok(at('handover-native-activation-native')<at('installed-handover-native-activation'));
 const installed=plan.checks[at('installed-handover-native-activation')];
 assert.deepEqual(installed.artifacts.map(({path,fresh,retain})=>[path,fresh,retain]),[
  ['target/handover-native-activation-installed-consumer.json',true,true],
  ['target/handover-native-activation-installed.log',true,true],
 ]);
 if(profile==='full'){
  const selected=candidateShardPlan(plan,'native-handover-activation-installed');
  assert.deepEqual(selected.shard.stages,[installed.id]);
  assert.deepEqual(selected.shard.prerequisites.slice(-2),['native-suggestion-room-host','native-handover-activation-host-build']);
 }
 assert.equal(plan.v1Ready,false);
});
