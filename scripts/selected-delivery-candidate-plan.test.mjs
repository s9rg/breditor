/** The full native matrix and real installed/bundled executions remain mandatory. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {selectedDeliveryProfiles} from './probe-selected-delivery.mjs';
test('public service workflow retains all ten original native grammar/wire modes',()=>{
 assert.deepEqual(selectedDeliveryProfiles,[[1,false],[2,false],[2,true],[3,false],[3,true]].flatMap(([language,standard])=>[false,true].map(atomic=>({language,standard,atomic}))));
 assert.ok(Object.isFrozen(selectedDeliveryProfiles));assert.ok(selectedDeliveryProfiles.every(Object.isFrozen));
});
for(const profile of ['functional','full'])test(profile+' requires sealed-source/durable-target delivery in source and fresh production packages',()=>{
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
 assert.deepEqual(find('selected-delivery-plan-contracts').args,['--test','scripts/selected-delivery-candidate-plan.test.mjs']);
 const host=find('selected-delivery-native-host');
 assert.deepEqual(host.args,['build','--manifest-path','experiments/relay/Cargo.toml','--example','selected_delivery_functional','--features','server','--locked','--offline','--release']);
 assert.ok(host.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 assert.equal(host.artifacts.length,1);assert.ok(host.artifacts[0].path.endsWith('release/examples/selected_delivery_functional'));
 assert.deepEqual(find('selected-delivery-sdk').args,['--test','scripts/selected-delivery-native-host.test.mjs']);
 const installed=find('installed-selected-delivery');assert.deepEqual(installed.args,['scripts/check-selected-delivery-installed.mjs']);assert.deepEqual(installed.artifacts,[{path:'target/selected-delivery-installed-consumer.json',fresh:true}]);
 for(const target of ['selected-delivery-sdk','installed-selected-delivery'])for(const prerequisite of ['rich-browser-build','paired-shared-runtime','collaboration-build','selected-delivery-plan-contracts','selected-delivery-native-host'])assert.ok(position(prerequisite)<position(target));
 assert.ok(position('selected-delivery-sdk')<position('installed-selected-delivery'));assert.equal(plan.v1Ready,false);
});
