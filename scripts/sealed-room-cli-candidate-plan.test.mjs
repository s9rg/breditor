import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {candidateReleasePlan, repository} from './candidate-release/plan.mjs';

for (const profile of ['functional', 'full']) {
  test(profile + ' qualifies the source and installed sealed-room CLI before readiness', () => {
    const plan = candidateReleasePlan({profile, environment: {BREDITOR_CARGO: 'candidate-cargo'}});
    const position = id => {
      const index = plan.checks.findIndex(check => check.id === id);
      assert.ok(index >= 0, id);
      return index;
    };
    const source = position('sealed-room-cli-source');
    const installed = position('installed-sealed-room-cli');
    assert.ok(position('relay-native') < source);
    assert.ok(position('sealed-room-cli-plan-contracts') < source);
    assert.ok(source < installed && installed < position('readiness-inventory'));
    for (const [index, mode] of [[source, 'source'], [installed, 'installed']]) {
      const check = plan.checks[index];
      assert.equal(check.env.BREDITOR_CARGO, 'candidate-cargo');
      assert.deepEqual(check.args, ['scripts/check-sealed-room-cli.mjs', '--' + mode]);
      assert.deepEqual(check.artifacts, [{path: 'target/sealed-room-cli-' + mode + '.json', fresh: true}]);
    }
    assert.equal(plan.checks[source].env.CARGO_TARGET_DIR, resolve(repository, 'target/owned-history-relay-native'));
    assert.equal(plan.v1Ready, false);
  });
}
