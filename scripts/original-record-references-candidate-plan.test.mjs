/** One unchanged assertion domain must reach source, fresh packages and bundled code. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
import {originalRecordReferenceWorkload as workload} from './original-record-references-workload.mjs';
test('both candidate profiles require original complete-state native/packet reference reads',()=>{
 assert.equal(workload.assertions,workload.newOriginalReferenceAssertions+workload.priorAssertions);assert.equal(workload.newOriginalReferenceAssertions,146);assert.equal(workload.priorAssertions,755);assert.equal(workload.types.length,6);assert.equal(new Set(workload.tests).size,workload.tests.length);
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(s=>s.id===id);assert.equal(rows.length,1,id);return rows[0];};assert.deepEqual(find('original-record-references-contracts').args,['--test','scripts/original-record-reference-development.test.mjs','scripts/original-record-reference-disposal.test.mjs','scripts/original-record-references-candidate-plan.test.mjs']);assert.ok(find('original-record-references-type-fence').args.includes('scripts/fixtures/editor-consumer/types-original-record-references.ts'));
  for(const[id,script,path,timeout]of[['original-record-references','check-original-record-references-sdk.mjs','target/original-record-references-sdk.json',900000],['installed-original-record-references','check-original-record-references-installed.mjs','target/original-record-references-installed-consumer.json',1800000]]){const stage=find(id);assert.deepEqual(stage.args,['scripts/'+script]);assert.deepEqual(stage.artifacts,[{path,fresh:true}]);assert.ok(stage.timeoutMs>=timeout);for(const dependency of['collaboration-build','original-record-references-contracts','original-record-references-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(stage));}
  for(const id of['generation-record-references','installed-generation-record-references','original-retained-record-read','installed-original-retained-record-read','generation-assets-source-contracts'])find(id);assert.equal(plan.v1Ready,false);
 }
 for(const kind of['sdk','installed']){const text=readFileSync(join(repository,'scripts/check-original-record-references-'+kind+'.mjs'),'utf8');for(const value of["originalRecordReferenceWorkload as workload","const {tests,types,assertions,scope}=workload","new RegExp('^# pass '+assertions+'$','m')",'^# fail 0$','^# skipped 0$','maxBuffer:8*1024*1024'])assert.ok(text.includes(value),value);}
 const installed=readFileSync(join(repository,'scripts/check-original-record-references-installed.mjs'),'utf8');for(const value of['--offline','--ignore-scripts','verifySearchConsumerRegistry','Only reversible locations may change','workspaceLinks:false','sourceUnchanged:true','persistence/original_record_reference_capture.js','persistence/original_reference_replay.js','persistence/original_reference_packets.js'])assert.ok(installed.includes(value),value);
});
