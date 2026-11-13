import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {metadataFixtureStageIds} from './candidate-release/metadata-fixture-evidence.mjs';
for(const profile of ['functional','full'])test(profile+' retains separate handover intent source and installed gates',()=>{
 const plan=candidateReleasePlan({profile}),at=id=>{const index=plan.checks.findIndex(row=>row.id===id);assert.ok(index>=0,id);return index;};
 for(const id of ['handover-activation-intent-contracts','handover-activation-intent-types','handover-activation-intent-native','installed-handover-activation-intent']){
  assert.ok(at('native-suggestion-room-host')<at(id));assert.ok(at('handover-recovery-bytes-native')<at(id));
 }
 const contracts=at('handover-activation-intent-contracts');
 assert.ok(at('paired-shared-runtime')<contracts);
 assert.equal(plan.checks[contracts].requiresSharedRuntime,true);
 assert.ok(at('handover-activation-intent-native')<at('installed-handover-activation-intent'));
 for(const id of ['handover-activation-intent-native','installed-handover-activation-intent']){
  assert.ok(metadataFixtureStageIds.includes(id));
  assert.ok(at('paired-shared-runtime')<at(id));
 }
 assert.equal(plan.v1Ready,false);
});
