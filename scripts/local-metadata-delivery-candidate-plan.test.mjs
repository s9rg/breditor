import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': local metadata delivery, cold continuation and non-overwriting DATA restore require actual native and independent package workflows',()=>{
 const plan=candidateReleasePlan({profile}),byId=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['local-metadata-delivery-plan-contracts','local-metadata-delivery-private-types','local-metadata-delivery-storage-contracts','local-metadata-delivery-cold-native','installed-local-metadata-delivery']){assert.ok(byId.has(id),id);assert.notEqual(byId.get(id).required,false);}
 for(const id of ['collaboration-build','rich-browser-build','selected-delivery-native-host','metadata-native-hosts','native-suggestion-room-host']){assert.ok(byId.get(id).index<byId.get('local-metadata-delivery-cold-native').index);assert.ok(byId.get(id).index<byId.get('installed-local-metadata-delivery').index);}
 assert.deepEqual(byId.get('local-metadata-delivery-cold-native').args,['--test','scripts/local-metadata-delivery-native.test.mjs']);assert.ok(byId.get('local-metadata-delivery-cold-native').timeoutMs>=3600000);
 const contracts=byId.get('local-metadata-delivery-storage-contracts').args;for(const file of ['local-metadata-contracts.test.mjs','local-metadata-storage.test.mjs','local-metadata-restore-storage.test.mjs','local-metadata-resume-restore-contracts.test.mjs'])assert.ok(contracts.includes('scripts/'+file));
 assert.ok(byId.get('local-metadata-delivery-private-types').args.includes('scripts/fixtures/editor-consumer/types-local-metadata-delivery.ts'));
 assert.deepEqual(byId.get('installed-local-metadata-delivery').args,['scripts/check-local-metadata-delivery-installed.mjs']);assert.deepEqual(byId.get('installed-local-metadata-delivery').artifacts,[{path:'target/local-metadata-delivery-installed-consumer.json',fresh:true}]);assert.ok(byId.get('local-metadata-delivery-cold-native').index<byId.get('installed-local-metadata-delivery').index);assert.equal(plan.v1Ready,false);
});
