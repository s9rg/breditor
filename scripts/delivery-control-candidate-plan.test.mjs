/** Advanced reads never replace the old server/provider checks or qualify V1 alone. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires authenticated previous/current reads and unchanged installed refusal laws',()=>{
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
 assert.deepEqual(find('native-delivery-control-plan-contracts').args,['--test','scripts/delivery-control-candidate-plan.test.mjs']);
 const native=find('relay-delivery-control-native');assert.deepEqual(native.args,['test','--manifest-path','experiments/relay/Cargo.toml','--features','server','--locked','--offline','--release','--lib','server::generation_recovery::tests::delivery_control','--','--nocapture']);assert.ok(native.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 assert.deepEqual(find('delivery-control-sdk-contracts').args,['--test','scripts/generation-delivery-control.test.mjs']);
 const types=find('delivery-control-public-types');for(const flag of ['--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess'])assert.ok(types.args.includes(flag));assert.equal(types.args.at(-1),'scripts/fixtures/editor-consumer/types-generation-delivery-recovery-control.ts');
 for(const id of ['relay-native','relay-lint','relay-no-server-lint','relay-docs','relay-delivery-continuation-native','generation-recovery-control-contracts','selected-delivery-sdk','installed-selected-delivery'])find(id);
 assert.ok(position('native-delivery-control-plan-contracts')<position('relay-delivery-control-native'));assert.ok(position('collaboration-build')<position('delivery-control-sdk-contracts'));assert.ok(position('collaboration-build')<position('delivery-control-public-types'));assert.ok(position('relay-delivery-control-native')<position('selected-delivery-sdk'));assert.ok(position('delivery-control-sdk-contracts')<position('installed-selected-delivery'));assert.equal(plan.v1Ready,false);
});
