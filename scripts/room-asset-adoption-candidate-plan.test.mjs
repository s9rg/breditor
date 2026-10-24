/** The staged mutation path cannot substitute DTO-only or reduced native checks. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {roomAssetAdoptionWorkload as workload} from './room-asset-adoption-workload.mjs';
test('room asset staging requires complete source/install/bundle/native and type scopes in both plans',()=>{
 assert.equal(workload.assertions,161);assert.equal(workload.unitAssertions,139);assert.equal(workload.nativeRoomAssertions,22);assert.equal(workload.newAdoptionNativeAssertions,14);assert.equal(workload.tests.length,8);assert.equal(workload.types.length,5);
 for(const profile of['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));assert.deepEqual(find('room-asset-adoption-contracts').args,['--test','scripts/room-asset-adoption-storage.test.mjs','scripts/room-asset-adoption-candidate-plan.test.mjs']);assert.deepEqual(find('room-asset-adoption-type-fence').args.slice(-5),workload.types.map(name=>'scripts/fixtures/editor-consumer/'+name));
  for(const[id,script,artifact,timeout]of[['room-asset-adoption','check-room-asset-adoption-sdk.mjs','target/room-asset-adoption-sdk.json',3600000],['installed-room-asset-adoption','check-room-asset-adoption-installed.mjs','target/room-asset-adoption-installed-consumer.json',7200000]]){const check=find(id);assert.deepEqual(check.args,['scripts/'+script]);assert.deepEqual(check.artifacts,[{path:artifact,fresh:true}]);assert.ok(check.timeoutMs>=timeout);for(const dependency of['rich-browser-build','collaboration-build','native-complete-image-cohort','room-asset-adoption-contracts','room-asset-adoption-type-fence'])assert.ok(position(dependency)<position(id));}
 }
});
