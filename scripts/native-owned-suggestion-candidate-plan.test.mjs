import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': guarded owned-history checks require real native receipts, private types and independent packages',()=>{
 const plan=candidateReleasePlan({profile}),byId=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['metadata-native-hosts','native-owned-suggestion-plan-contracts','native-owned-suggestion-private-types','native-owned-suggestion-functional','installed-native-owned-suggestion'])assert.ok(byId.has(id),id);
 assert.ok(byId.get('metadata-native-hosts').index<byId.get('native-owned-suggestion-functional').index);assert.ok(byId.get('metadata-native-hosts').index<byId.get('installed-native-owned-suggestion').index);
 assert.deepEqual(byId.get('native-owned-suggestion-functional').args,['--test','scripts/native-owned-suggestion-history.test.mjs','scripts/native-owned-suggestion-input.test.mjs','scripts/native-owned-suggestion-membership.test.mjs']);
 assert.ok(byId.get('native-owned-suggestion-private-types').args.includes('scripts/fixtures/editor-consumer/types-native-owned-suggestion.ts'));
 assert.ok(byId.get('installed-native-owned-suggestion').artifacts.some(row=>row.path==='target/native-owned-suggestion-installed-consumer.json'&&row.fresh));
 for(const id of ['metadata-work-contracts','installed-metadata-work','selected-room-storage-native','installed-selected-room-storage','retained-delivery-work-contracts'])assert.ok(byId.has(id),id);
 assert.ok(byId.get('retained-delivery-work-contracts').args.includes('scripts/native-relay-delivery-sdk.test.mjs'));
});
