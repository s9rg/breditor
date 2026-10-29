import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': native suggestion execution requires original receipts, all source/observer policies, private types and independent packages',()=>{
 const plan=candidateReleasePlan({profile}),byId=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['metadata-native-hosts','native-suggestion-room-host','native-suggestion-delivery-plan-contracts','native-suggestion-delivery-private-types','native-suggestion-delivery-functional','installed-native-suggestion-delivery','native-owned-suggestion-functional','held-metadata-functional','native-version-delivery-functional'])assert.ok(byId.has(id),id);
 assert.ok(byId.get('metadata-native-hosts').index<byId.get('native-suggestion-delivery-functional').index);assert.ok(byId.get('metadata-native-hosts').index<byId.get('installed-native-suggestion-delivery').index);
 assert.ok(byId.get('native-suggestion-room-host').index<byId.get('native-suggestion-delivery-functional').index);assert.ok(byId.get('native-suggestion-room-host').args.includes('selected_suggestion_delivery_functional'));
 assert.deepEqual(byId.get('native-suggestion-delivery-functional').args,['--test','scripts/native-suggestion-delivery.test.mjs','scripts/native-suggestion-observer.test.mjs','scripts/native-suggestion-failures.test.mjs','scripts/native-suggestion-lifetime.test.mjs','scripts/observer-work-custody.test.mjs','scripts/native-suggestion-selected-room.test.mjs']);
 assert.ok(byId.get('native-suggestion-delivery-private-types').args.includes('scripts/fixtures/editor-consumer/types-native-suggestion-delivery.ts'));
 assert.ok(byId.get('installed-native-suggestion-delivery').artifacts.some(row=>row.path==='target/native-suggestion-delivery-installed-consumer.json'&&row.fresh));
});
