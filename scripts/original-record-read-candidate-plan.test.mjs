/** A LIVE export is not proof of the actual original committed record. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
import {join} from 'node:path';
test('both profiles require actual original rows in source, fresh packages and bundles',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];};
  assert.deepEqual(find('original-record-read-contracts').args,['--test','scripts/persistent-paired-read-development.test.mjs','scripts/persistent-paired-read-disposal.test.mjs','scripts/persistent-suggestion-read-development.test.mjs','scripts/persistent-suggestion-read-disposal.test.mjs','scripts/original-record-read-candidate-plan.test.mjs']);
  for(const name of ['types-persistent-paired-read-development.ts','types-persistent-suggestion-read-development.ts'])assert.ok(find('original-record-read-type-fence').args.includes('scripts/fixtures/editor-consumer/'+name));
  for(const[id,script,path,timeout]of [['original-record-read','check-original-record-read-sdk.mjs','target/original-record-read-sdk.json',900000],['installed-original-record-read','check-original-record-read-installed.mjs','target/original-record-read-installed-consumer.json',1800000]]){
   const stage=find(id);assert.deepEqual(stage.args,['scripts/'+script]);assert.deepEqual(stage.artifacts,[{path,fresh:true}]);assert.ok(stage.timeoutMs>=timeout);
   for(const dependency of ['collaboration-build','original-record-read-contracts','original-record-read-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(stage));
  }
  for(const id of ['participant-operation-storage-contracts','participant-operation','paired-session-backups','segmented-retained-storage-contracts','operation-references','installed-operation-references'])find(id);
  assert.equal(plan.v1Ready,false);
 }
 const installed=readFileSync(join(repository,'scripts/check-original-record-read-installed.mjs'),'utf8');
 for(const text of ['--offline','--ignore-scripts','verifySearchConsumerRegistry','Only reversible locations may change','const expectedAssertions=74+retainedStorageRegressionLaws;',"new RegExp('^# pass '+expectedAssertions+'$','m')",'^# fail 0$','^# skipped 0$','workspaceLinks:false','sourceUnchanged:true'])assert.ok(installed.includes(text),text);
});
