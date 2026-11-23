import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {metadataFixtureStageIds} from './candidate-release/metadata-fixture-evidence.mjs';
for(const profile of ['functional','full'])test(profile+' includes complete handover recovery bytes and installed execution',()=>{
 const plan=candidateReleasePlan({profile}),position=id=>{const at=plan.checks.findIndex(row=>row.id===id);assert.ok(at>=0,id);return at;};
 for(const id of ['handover-recovery-bytes-contracts','handover-recovery-bytes-types','handover-recovery-bytes-native','installed-handover-recovery-bytes']){
  assert.ok(position('native-suggestion-room-host')<position(id));
  assert.ok(position('metadata-handover-native')<position(id));
 }
 assert.ok(position('handover-recovery-bytes-native')<position('installed-handover-recovery-bytes'));
 assert.equal(plan.v1Ready,false);
 assert.ok(metadataFixtureStageIds.includes('handover-recovery-bytes-native'));
 assert.ok(metadataFixtureStageIds.includes('installed-handover-recovery-bytes'));
});
