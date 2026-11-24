/** Additive whole-generation execution stages cannot replace any older gate. */
import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';import {generationNativeExecutionWorkload as workload} from './generation-native-execution-workload.mjs';import {nativeExecutionWorkload as physical} from './native-execution-workload.mjs';import {selectedGenerationReconciliationWorkload as prior} from './selected-generation-reconciliation-workload.mjs';
import {candidateShardPlan} from './candidate-release/shards.mjs';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {summarizeNativeContractFailure,verifyNativeContractLog} from './candidate-release/native-contract-log.mjs';
for(const profile of ['functional','full'])test(profile+' requires complete source and installed/bundled generation execution',()=>{assert.equal(workload.assertions,92);assert.equal(workload.newGenerationAssertions,55);assert.equal(workload.priorPhysicalAssertions,37);assert.equal(physical.assertions,203);assert.equal(prior.assertions,198);const old=["native-import-input-storage.test.mjs","native-input-existing-storage.test.mjs","native-execution-journal.test.mjs","native-execution-lifetime.test.mjs","native-import-input-sdk.test.mjs","native-input-existing-sdk.test.mjs","native-execution-sdk.test.mjs","native-execution-resume-sdk.test.mjs","native-execution-matrix-sdk.test.mjs","native-execution-bound-sdk.test.mjs"];for(const file of old){assert.ok(workload.tests.includes(file));assert.ok(workload.tests.includes('generation-'+file));}for(const file of ['migrated-generation-native-execution-sdk.test.mjs','generation-native-family-boundary.test.mjs','generation-native-execution-admission.test.mjs','generation-native-input-profiles.test.mjs','generation-native-input-authentication.test.mjs'])assert.ok(workload.tests.includes(file));const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},pos=id=>plan.checks.indexOf(find(id));for(const id of ['native-execution','installed-native-execution','native-import-input','installed-native-import-input','selected-generation-reconciliation','installed-selected-generation-reconciliation'])find(id);assert.deepEqual(find('generation-native-execution-type-fence').args.slice(-5),workload.types.map(name=>'scripts/fixtures/editor-consumer/'+name));for(const[id,file,artifact,timeout]of [['generation-native-execution','check-generation-native-execution-sdk.mjs','target/generation-native-execution-sdk.json',14400000],['installed-generation-native-execution','check-generation-native-execution-installed.mjs','target/generation-native-execution-installed-consumer.json',18000000]]){const row=find(id);assert.deepEqual(row.args,['scripts/'+file]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true,retain:true}]);assert.equal(row.requiresSharedRuntime,true);assert.ok(row.timeoutMs>=timeout);for(const dependency of ['rich-browser-build','collaboration-build','generation-native-execution-contracts','generation-native-execution-type-fence'])assert.ok(pos(dependency)<pos(id));}assert.equal(plan.v1Ready,false);});
test('Native generation execution shards have the same runtime and independent live controls',()=>{
 const full=candidateReleasePlan();
 const producers=['default-typescript-build','paired-local-runtime','paired-shared-runtime','rich-browser-build','collaboration-build'];
 for(const [kind,stages] of [
  ['source',['generation-native-execution-contracts','generation-native-execution-type-fence','generation-native-execution']],
  ['installed',['installed-generation-native-execution']],
 ]){
  const plan=candidateShardPlan(full,'generation-native-execution-'+kind);
  assert.deepEqual(plan.shard.prerequisites,producers);
  assert.deepEqual(plan.shard.stages,stages);
  assert.deepEqual(plan.checks,[...producers,...stages].map(id=>full.checks.find(check=>check.id===id)));
  assert.equal(plan.checks.at(-1).requiresSharedRuntime,true);
 }
});
test('Native failure evidence retains bounded test locations without TAP titles or diagnostic bodies',()=>{
 const directory=mkdtempSync(join(tmpdir(),'breditor-native-contract-log-'));
 try{
  const file=join(directory,'contracts.log'),testFile='generation-native-input-authentication.test.mjs';
  const failed=[
   'not ok 3 - private fixture title',
   "  location: '/private/fixture/bundled-"+testFile+":14:1'",
   '  error: private synthetic credential',
   '    not ok 4 - nested private diagnostic',
   'not ok 5 - unknown source',
   "  location: '/private/fixture/unregistered.test.mjs:6:2'",
   '# tests 2','# pass 0','# fail 2','# skipped 0','# cancelled 0',
  ].join('\n');
  writeFileSync(file,failed);
  assert.deepEqual(summarizeNativeContractFailure(file,[testFile]),{
   available:true,truncated:false,failures:[{test:3,file:testFile,line:14,column:1},{test:5}],omitted:0,
  });
  assert.throws(()=>verifyNativeContractLog(file,2),error=>error.message==='Unexpected Native contract pass total');
  writeFileSync(file,'private raw log '.repeat(20_000)+'\n'+Array.from({length:24},(_,i)=>`not ok ${i+1} - private`).join('\n'));
  const summary=summarizeNativeContractFailure(file,[testFile]);
  assert.equal(summary.truncated,true);
  assert.equal(summary.failures.length,20);
  assert.equal(summary.omitted,4);
  writeFileSync(file,'# tests 2\n# pass 2\n# fail 0\n# skipped 0\n# cancelled 0\n');
  verifyNativeContractLog(file,2);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
