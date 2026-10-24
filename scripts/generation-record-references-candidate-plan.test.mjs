/** State replay must qualify exact installed source and actual bundled code. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
test('both profiles require native generation state references without current upload lookup',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];};
  assert.deepEqual(find('generation-record-references-contracts').args,['--test','scripts/generation-record-reference-development.test.mjs','scripts/generation-record-reference-disposal.test.mjs','scripts/generation-record-references-candidate-plan.test.mjs']);
  assert.ok(find('generation-record-references-type-fence').args.includes('scripts/fixtures/editor-consumer/types-generation-record-references.ts'));
  for(const[id,script,path,timeout]of [['generation-record-references','check-generation-record-references-sdk.mjs','target/generation-record-references-sdk.json',900000],['installed-generation-record-references','check-generation-record-references-installed.mjs','target/generation-record-references-installed-consumer.json',1800000]]){const stage=find(id);assert.deepEqual(stage.args,['scripts/'+script]);assert.deepEqual(stage.artifacts,[{path,fresh:true}]);assert.ok(stage.timeoutMs>=timeout);for(const dependency of ['collaboration-build','generation-record-references-contracts','generation-record-references-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(stage));}
  for(const id of ['generation-record-read','installed-generation-record-read','original-retained-record-read','installed-original-retained-record-read','generation-assets-source-contracts'])find(id);
  assert.equal(plan.v1Ready,false);
 }
 const installed=readFileSync(join(repository,'scripts/check-generation-record-references-installed.mjs'),'utf8');for(const text of ['--offline','--ignore-scripts','verifySearchConsumerRegistry','Only reversible locations may change','^# pass 755$','^# fail 0$','^# skipped 0$','workspaceLinks:false','sourceUnchanged:true','generation_source/record_reference_capture.js','generation_source/recorded_references.js'])assert.ok(installed.includes(text),text);
 for(const name of ['generation-record-read','original-retained-record-read','generation-record-references'])for(const kind of ['sdk','installed']){const script=readFileSync(join(repository,'scripts/check-'+name+'-'+kind+'.mjs'),'utf8');assert.ok(script.includes('maxBuffer:8*1024*1024'));assert.doesNotMatch(script,/maxBuffer:8\*(?!1024\*)\d{4}\*/);}
 for(const name of ['types-persistent-suggestion-read-development.ts','types-persistent-paired-read-development.ts','types-persistent-generation-read-development.ts','types-original-retained-record-read.ts','types-generation-record-references.ts'])assert.ok(installed.includes(name),name);
});
