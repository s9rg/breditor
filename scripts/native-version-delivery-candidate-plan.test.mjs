import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': native version delivery requires actual hosts, full room recovery, failed saves and independent packages',()=>{
 const plan=candidateReleasePlan({profile}),byId=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['segmented-relay-native-host','selected-delivery-native-host','native-version-delivery-plan-contracts','native-version-delivery-private-types','native-version-delivery-functional','installed-native-version-delivery'])assert.ok(byId.has(id),id);
 for(const host of ['segmented-relay-native-host','selected-delivery-native-host'])for(const stage of ['native-version-delivery-functional','installed-native-version-delivery'])assert.ok(byId.get(host).index<byId.get(stage).index);
 assert.deepEqual(byId.get('native-version-delivery-functional').args,['--test','scripts/native-version-delivery.test.mjs','scripts/native-version-delivery-failures.test.mjs','scripts/native-version-selected-room.test.mjs']);
 assert.ok(byId.get('native-version-delivery-private-types').args.includes('scripts/fixtures/editor-consumer/types-native-version-delivery.ts'));
 assert.ok(byId.get('installed-native-version-delivery').artifacts.some(row=>row.path==='target/native-version-delivery-installed-consumer.json'&&row.fresh));
 for(const id of ['native-owned-suggestion-functional','installed-native-owned-suggestion','metadata-work-contracts','installed-metadata-work','selected-room-storage-native','installed-selected-room-storage','retained-delivery-work-contracts'])assert.ok(byId.has(id),id);
});
