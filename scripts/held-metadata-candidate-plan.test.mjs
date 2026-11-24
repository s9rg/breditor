import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {candidateShardPlan} from './candidate-release/shards.mjs';
for(const profile of ['functional','full'])test(profile+': held metadata preparation requires native room recovery, lifetime laws, private types and independent packages',()=>{
 const plan=candidateReleasePlan({profile}),byId=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['selected-delivery-native-host','held-metadata-plan-contracts','held-metadata-private-types','held-metadata-functional','installed-held-metadata'])assert.ok(byId.has(id),id);
 for(const id of ['held-metadata-functional','installed-held-metadata']){
  assert.ok(byId.get('selected-delivery-native-host').index<byId.get(id).index);
  assert.equal(byId.get(id).requiresSharedRuntime,true);
 }
 assert.deepEqual(byId.get('held-metadata-functional').args,['--test','scripts/held-metadata-preparation.test.mjs','scripts/held-metadata-lifetime.test.mjs','scripts/held-metadata-selected-room.test.mjs']);
 assert.ok(byId.get('held-metadata-private-types').args.includes('scripts/fixtures/editor-consumer/types-held-metadata.ts'));assert.ok(byId.get('installed-held-metadata').artifacts.some(row=>row.path==='target/held-metadata-installed-consumer.json'&&row.fresh&&row.retain));
 for(const id of ['native-version-delivery-functional','installed-native-version-delivery','native-owned-suggestion-functional','metadata-work-contracts','selected-room-storage-native','installed-selected-room-storage'])assert.ok(byId.has(id),id);
});

test('metadata shards rebuild the selected Native fixtures and run all source and installed stages',()=>{
 const plan=candidateReleasePlan();
 const version=candidateShardPlan(plan,'native-version-delivery').shard;
 assert.ok(version.prerequisites.includes('segmented-relay-native-host'));
 assert.ok(version.prerequisites.includes('selected-delivery-native-host'));
 assert.deepEqual(version.stages,['native-version-delivery-plan-contracts','native-version-delivery-private-types','native-version-delivery-functional','installed-native-version-delivery']);
 const held=candidateShardPlan(plan,'held-metadata').shard;
 assert.ok(held.prerequisites.includes('selected-delivery-native-host'));
 assert.deepEqual(held.stages,['held-metadata-plan-contracts','held-metadata-private-types','held-metadata-functional','installed-held-metadata']);
});
