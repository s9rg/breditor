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
 for(const prefix of ['joint-handover','cold-joint-handover']){
  const source=at(prefix+'-native'),installed=at('installed-'+prefix);
  for(const predecessor of beforeNative)assert.ok(at(predecessor)<source,predecessor);
  assert.ok(source<installed&&installed<readiness,prefix);
  const task='test:collaboration:'+prefix;
  assert.equal(plan.checks[source].command,'npm-for-candidate');
  assert.deepEqual(plan.checks[source].args,['run',task]);
  assert.ok(manifest.scripts[task].split(' ').includes('scripts/'+prefix+'-activation-complete-native.test.mjs'));
  assert.deepEqual(plan.checks[installed].args,['scripts/check-metadata-continuation-installed.mjs','--'+prefix]);
  assert.deepEqual(plan.checks[installed].artifacts,[{path:'target/'+prefix+'-activation-installed-result.json',fresh:true}]);
 }
 assert.ok(at('installed-joint-handover')<at('cold-joint-handover-native'));
 assert.equal(plan.v1Ready,false);
});
