import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {currentNativeCohortEvidence} from './candidate-release/native-cohort-evidence.mjs';
import {captureNativeConsumerArchives,verifyNativeConsumerArchives} from './candidate-release/native-consumer-archives.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';import {generationNativeReconstructionWorkload as workload} from './generation-native-reconstruction-workload.mjs';import {generationNativeExecutionWorkload as prior} from './generation-native-execution-workload.mjs';
for(const profile of ['functional','full'])test(profile+' retains old gates and adds complete installed/bundled generation reconstruction',()=>{
 assert.equal(workload.assertions,108);assert.equal(workload.newReconstructionAssertions,10);assert.equal(workload.priorColdExecutionAssertions,6);assert.deepEqual(workload.tests.slice(0,prior.tests.length),prior.tests);assert.deepEqual(workload.types.slice(0,prior.types.length),prior.types);assert.equal(new Set(workload.tests).size,workload.tests.length);for(const name of ['cold-room-execution-sdk.test.mjs','generation-native-reconstruction-admission.test.mjs','generation-native-reconstruction-evidence.test.mjs','generation-native-reconstruction-lifetime.test.mjs','generation-native-reconstruction-sdk.test.mjs'])assert.ok(workload.tests.includes(name));
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));for(const id of ['generation-native-execution','installed-generation-native-execution','native-execution','installed-native-execution','selected-generation-reconciliation','installed-selected-generation-reconciliation'])find(id);assert.deepEqual(find('generation-native-reconstruction-type-fence').args.slice(-workload.types.length),workload.types.map(name=>'scripts/fixtures/editor-consumer/'+name));
 for(const [id,file,artifact,timeout] of [['generation-native-reconstruction','check-generation-native-reconstruction-sdk.mjs','target/generation-native-reconstruction-sdk.json',18000000],['installed-generation-native-reconstruction','check-generation-native-reconstruction-installed.mjs','target/generation-native-reconstruction-installed-consumer.json',21600000]]){const check=find(id);assert.deepEqual(check.args,['scripts/'+file]);assert.deepEqual(check.artifacts,[{path:artifact,fresh:true,retain:true}]);assert.equal(check.requiresSharedRuntime,true);assert.ok(check.timeoutMs>=timeout);for(const dependency of ['rich-browser-build','collaboration-build','generation-native-reconstruction-contracts','generation-native-reconstruction-type-fence'])assert.ok(position(dependency)<position(id));}assert.equal(plan.v1Ready,false);
});

test('Native cohort prerequisite evidence must identify this source and stay exact',()=>{
 const root=mkdtempSync(join(tmpdir(),'breditor-native-cohort-evidence-'));
 try{
  mkdirSync(join(root,'target'));
  const source={commit:'1'.repeat(40),dirty:false,sha256:'2'.repeat(64),files:1,bytes:1};
  const report={formatVersion:1,passed:true,source};
  const write=(name,overrides={})=>writeFileSync(join(root,'target/complete-'+name+'-native.json'),
   JSON.stringify({...report,format:'breditor/native-complete-'+name+'-check',...overrides}));
  write('cohort');
  write('image-cohort');
  const pinned=currentNativeCohortEvidence(root,source);
  assert.deepEqual(pinned.map(row=>row.path),['target/complete-cohort-native.json','target/complete-image-cohort-native.json']);
  write('image-cohort',{source:{...source,commit:'3'.repeat(40)}});
  assert.throws(()=>currentNativeCohortEvidence(root,source),/another candidate: target\/complete-image-cohort-native.json/);
  write('image-cohort',{passed:false});
  assert.throws(()=>currentNativeCohortEvidence(root,source),/complete-image-cohort-native.json/);
  write('image-cohort',{additionalObservation:true});
  const updated=currentNativeCohortEvidence(root,source);
  assert.deepEqual(updated[0],pinned[0]);
  assert.notEqual(updated[1].sha256,pinned[1].sha256);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('Native archive evidence follows the real offline install lock and rejects later byte changes',()=>{
 const root=mkdtempSync(join(tmpdir(),'breditor-native-consumer-archive-'));
 try{
  const producer=join(root,'producer'),consumer=join(root,'consumer'),archives=join(root,'archives'),cache=join(root,'cache');
  for(const path of [producer,consumer,archives])mkdirSync(path);
  const name='@breditor/native-consumer-test',filename='breditor-native-consumer-test-1.0.0.tgz';
  writeFileSync(join(producer,'package.json'),JSON.stringify({name,version:'1.0.0',files:['index.js']}));
  writeFileSync(join(producer,'index.js'),'module.exports=true;\n');
  const pack=JSON.parse(execFileSync('npm',['pack','--offline','--ignore-scripts','--cache',cache,'--json','--pack-destination',archives],{cwd:producer,encoding:'utf8'}));
  const original=captureNativeConsumerArchives(archives,pack);
  assert.equal(original[0].integrity,pack[0].integrity);
  writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'native-consumer-proof',private:true,dependencies:{[name]:'file:../archives/'+filename}}));
  execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',cache],{cwd:consumer});
  const lock=JSON.parse(readFileSync(join(consumer,'package-lock.json')));
  verifyNativeConsumerArchives(consumer,lock,original);

  const changedLock=structuredClone(lock);
  changedLock.packages[`node_modules/${name}`].integrity='sha512-invalid';
  assert.throws(()=>verifyNativeConsumerArchives(consumer,changedLock,original),/Installed archive integrity differs/);
  changedLock.packages[`node_modules/${name}`].resolved='file:../archives/other.tgz';
  assert.throws(()=>verifyNativeConsumerArchives(consumer,changedLock,original),/Installed archive path differs/);
  const changedArchive=readFileSync(original[0].path);
  changedArchive[20]^=1;
  writeFileSync(original[0].path,changedArchive);
  assert.throws(()=>verifyNativeConsumerArchives(consumer,lock,original),/npm archive changed after packing/);
  assert.throws(()=>captureNativeConsumerArchives(archives,pack),/npm pack integrity differs/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
