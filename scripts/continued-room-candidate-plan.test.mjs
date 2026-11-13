import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';

for(const profile of ['functional','full'])test(profile+' qualifies mixed room recovery and native provider reads',()=>{
 const plan=candidateReleasePlan({profile});
 const find=id=>{
  const matches=plan.checks.filter(check=>check.id===id);
  assert.equal(matches.length,1,id);
  return matches[0];
 };
 const before=(first,second)=>assert.ok(plan.checks.indexOf(find(first))<plan.checks.indexOf(find(second)),first+' before '+second);
 for(const [mode,id] of [['source','continued-room-catalog'],['installed','installed-continued-room-catalog']]){
  const stage=find(id);
  assert.deepEqual(stage.args,['scripts/check-continued-room-catalog.mjs',mode]);
  assert.deepEqual(stage.artifacts,[{path:`target/qualified-continued-room-catalog-${mode}.json`,fresh:true}]);
  assert.equal(stage.requiresSharedRuntime,true);
  for(const dependency of ['collaboration-build','native-server-generation-inventory','continued-room-type-fence'])before(dependency,id);
 }
 for(const [mode,id] of [['source','continued-delivery'],['installed','installed-continued-delivery']]){
  const stage=find(id);
  assert.deepEqual(stage.args.slice(0,2),['scripts/check-continued-delivery.mjs',mode]);
  assert.match(stage.args[2],/segmented_relay_functional(?:\.exe)?$/);
  assert.match(stage.args[3],/suggestion_revisions_functional(?:\.exe)?$/);
  assert.deepEqual(stage.artifacts,[{path:`target/qualified-continued-delivery-${mode}.json`,fresh:true}]);
  assert.equal(stage.requiresSharedRuntime,true);
  before('collaboration-build',id);
 }
 const provider=find('continued-room-provider');
 assert.equal(provider.args[0],'scripts/check-continued-room-provider.mjs');
 assert.match(provider.args[1],/generation_complete_control_functional(?:\.exe)?$/);
 assert.equal(provider.args[2],'both');
 assert.deepEqual(provider.artifacts,[{path:'target/qualified-continued-room-provider-both.json',fresh:true}]);
 assert.equal(provider.requiresSharedRuntime,true);
 before('installed-continued-room-catalog','continued-room-provider');
 before('metadata-reconciliation-root-host','continued-room-provider');
 assert.equal(plan.v1Ready,false);
});
