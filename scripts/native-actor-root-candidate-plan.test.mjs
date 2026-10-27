import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {nativeActorRootWorkload as work} from './native-actor-root-workload.mjs';
import {nativeReconstructionWorkload as prior} from './native-reconstruction-workload.mjs';
test('genuine root custody and complete asset DATA are additive to every prior reconstruction law',()=>{
 assert.equal(prior.assertions,283);assert.equal(work.assertions,159);assert.equal(work.priorActorAndCleanupAssertions+work.newRootAssertions+work.newStorageByteAssertions+work.newOperationalAssertions+work.newAssetDataAssertions,work.assertions);
 assert.deepEqual(work.tests,["native-actor-factory.test.mjs","native-actor-escrow.test.mjs","native-actor-construction.test.mjs","native-actor-cohort.test.mjs","native-actor-input.test.mjs","native-actor-overlays.test.mjs","owned-core-cleanup.test.mjs","native-actor-root.test.mjs","native-storage-bytes.test.mjs","native-actor-operational.test.mjs","reconciled-asset-base-data.test.mjs"]);assert.deepEqual(work.types,["types-native-actor-custody.ts","types-native-actor-root.ts","types-reconciled-asset-base-data.ts"]);
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
  for(const [id,script,path]of [['native-actor-root','check-native-actor-root-sdk.mjs','target/native-actor-root-sdk.json'],['installed-native-actor-root','check-native-actor-root-installed.mjs','target/native-actor-root-installed-consumer.json']]){
   assert.deepEqual(find(id).args,['scripts/'+script]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);
   for(const dependency of ['rich-browser-build','collaboration-build','native-complete-cohort','native-complete-image-cohort','native-actor-root-contracts','native-actor-root-type-fence','native-reconstruction','installed-native-reconstruction'])assert.ok(position(dependency)<position(id));
  }
  assert.equal(plan.v1Ready,false);
 }
});
