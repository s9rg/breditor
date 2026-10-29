/** Exact old protocols stay mandatory alongside the new complete prior-cut proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires complete native delivery continuation and real public service consumers',()=>{
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
 assert.deepEqual(find('native-delivery-continuation-plan-contracts').args,['--test','scripts/delivery-continuation-candidate-plan.test.mjs']);
 const row=find('relay-delivery-continuation-native');assert.deepEqual(row.args,['test','--manifest-path','experiments/relay/Cargo.toml','--features','server','--locked','--offline','--release','--lib','server::generation_recovery::tests::delivery_continuation','--','--nocapture']);assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 for(const id of ['relay-native','relay-lint','relay-no-server-lint','relay-docs','relay-native-generation-activation-native','relay-durable-native-activation-native','selected-delivery-native-host','selected-delivery-sdk','installed-selected-delivery'])find(id);
 assert.ok(position('native-delivery-continuation-plan-contracts')<position('relay-delivery-continuation-native'));assert.ok(position('relay-delivery-continuation-native')<position('selected-delivery-sdk'));assert.ok(position('selected-delivery-sdk')<position('installed-selected-delivery'));assert.equal(plan.v1Ready,false);
});
