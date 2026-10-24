/** New-base checks cannot silently omit old custody laws or either native lane. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {reconciledAssetBaseWorkload as workload} from './reconciled-asset-base-workload.mjs';
test('retained-base candidate requires whole old/new source, native, installed, bundle and strict type scopes',()=>{
 assert.equal(workload.assertions,111);assert.equal(workload.unitAssertions,103);assert.equal(workload.newBaseAssertions,40);assert.equal(workload.nativeRoomAssertions,8);assert.equal(workload.tests.length,6);assert.equal(workload.types.length,4);
 for(const profile of['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
  assert.deepEqual(find('reconciled-asset-base-contracts').args,['--test',...workload.tests.filter(name=>!name.startsWith('seven-room')).map(name=>'scripts/'+name),'scripts/reconciled-asset-base-candidate-plan.test.mjs']);assert.deepEqual(find('reconciled-asset-base-type-fence').args.slice(-4),workload.types.map(name=>'scripts/fixtures/editor-consumer/'+name));
  for(const[id,script,artifact,timeout]of[['reconciled-asset-base','check-reconciled-asset-base-sdk.mjs','target/reconciled-asset-base-sdk.json',1800000],['installed-reconciled-asset-base','check-reconciled-asset-base-installed.mjs','target/reconciled-asset-base-installed-consumer.json',3600000]]){const selected=find(id);assert.deepEqual(selected.args,['scripts/'+script]);assert.deepEqual(selected.artifacts,[{path:artifact,fresh:true}]);assert.ok(selected.timeoutMs>=timeout);for(const dependency of['rich-browser-build','collaboration-build','native-complete-image-cohort','reconciled-asset-base-contracts','reconciled-asset-base-type-fence'])assert.ok(position(dependency)<position(id));}
 }
});
