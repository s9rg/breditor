import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateReleasePlan} from './candidate-release/plan.mjs';

const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
for(const profile of ['functional','full'])test(profile+' requires source and installed whole-room handover before readiness',()=>{
 const plan=candidateReleasePlan({profile,environment:{BREDITOR_NPM:'npm-for-candidate'}});
 const at=id=>{
  const index=plan.checks.findIndex(row=>row.id===id);
  assert.ok(index>=0,id);
  return index;
 };
 const readiness=at('readiness-inventory');
 const beforeNative=[
  'native-handover-activation-host-build','installed-handover-native-activation',
  'native-suggestion-room-host','joint-handover-cohort-host','joint-handover-types',
 ];
 const workflows=[
  {name:'joint-handover',test:'joint-handover-activation-complete-native',mode:'joint-handover',report:'joint-handover-activation'},
  {name:'cold-joint-handover',test:'cold-joint-handover-activation-complete-native',mode:'cold-joint-handover',report:'cold-joint-handover-activation'},
  {name:'sealed-joint-process-recovery',test:'sealed-joint-process-recovery-complete-native',mode:'sealed-process-recovery',report:'sealed-joint-process-recovery'},
 ];
 for(const {name,test,mode,report} of workflows){
  const source=at(name+'-native'),installed=at('installed-'+name);
  for(const predecessor of beforeNative)assert.ok(at(predecessor)<source,predecessor);
  assert.ok(source<installed&&installed<readiness,name);
  const task='test:collaboration:'+name;
  assert.equal(plan.checks[source].command,'npm-for-candidate');
  assert.deepEqual(plan.checks[source].args,['run',task]);
  assert.ok(manifest.scripts[task].split(' ').includes('scripts/'+test+'.test.mjs'));
  assert.deepEqual(plan.checks[installed].args,['scripts/check-metadata-continuation-installed.mjs','--'+mode]);
  assert.deepEqual(plan.checks[installed].artifacts,[{path:'target/'+report+'-installed-result.json',fresh:true}]);
 }
 assert.ok(at('installed-joint-handover')<at('cold-joint-handover-native'));
 assert.ok(at('installed-cold-joint-handover')<at('sealed-joint-process-recovery-native'));
 assert.equal(plan.v1Ready,false);
});
