/** Seven-writer laws require a distinct genuine native producer and unchanged
 * source/installed/bundle workload. The two-writer domain is still mandatory. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';

test('both candidate profiles require actual seven-writer native and installed room matrices', () => {
  for (const profile of ['functional', 'full']) {
    const plan = candidateReleasePlan({profile});
    const find = id => { const stage = plan.checks.find(row => row.id === id); assert.ok(stage, id); return stage; };
    for (const [id, script, artifact] of [
      ['native-complete-cohort', 'check-complete-cohort-native.mjs', 'target/complete-cohort-native.json'],
      ['physical-operation-v3-seven-room', 'check-physical-operation-v3-seven-room-sdk.mjs', 'target/seven-room-sdk.json'],
      ['installed-physical-operation-v3-seven-room', 'check-physical-operation-v3-seven-room-installed.mjs', 'target/seven-room-installed-consumer.json'],
    ]) {
      const stage = find(id);
      assert.deepEqual(stage.args, ['scripts/' + script]);
      assert.deepEqual(stage.artifacts, [{path: artifact, fresh: true}]);
      assert.ok(stage.timeoutMs >= (id.startsWith('installed-') ? 3600000 : 1800000));
      if (id !== 'native-complete-cohort') {
        assert.ok(plan.checks.indexOf(find('native-complete-cohort')) < plan.checks.indexOf(stage));
        assert.ok(plan.checks.indexOf(find('collaboration-build')) < plan.checks.indexOf(stage));
      }
    }
    assert.deepEqual(find('physical-operation-v3-seven-room-plan-contracts').args, ['--test', 'scripts/physical-operation-v3-seven-room-candidate-plan.test.mjs']);
    for (const id of ['native-room-participant-inventory', 'native-server-generation-inventory', 'physical-operation-v3', 'installed-physical-operation-v3', 'physical-catalog-v3', 'mixed-room-custody']) find(id);
    assert.equal(plan.v1Ready, false);
  }
});
