/** Separate current child exports cannot qualify a complete committed cut. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
test('both profiles require atomic generation records through actual packages and bundle',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];};
  assert.deepEqual(find('generation-record-read-contracts').args,['--test','scripts/persistent-generation-read-development.test.mjs','scripts/persistent-generation-read-disposal.test.mjs','scripts/generation-record-read-candidate-plan.test.mjs']);
  assert.ok(find('generation-record-read-type-fence').args.includes('scripts/fixtures/editor-consumer/types-persistent-generation-read-development.ts'));
  for(const[id,script,path,timeout]of [['generation-record-read','check-generation-record-read-sdk.mjs','target/generation-record-read-sdk.json',900000],['installed-generation-record-read','check-generation-record-read-installed.mjs','target/generation-record-read-installed-consumer.json',1800000]]){
   const stage=find(id);assert.deepEqual(stage.args,['scripts/'+script]);assert.deepEqual(stage.artifacts,[{path,fresh:true}]);assert.ok(stage.timeoutMs>=timeout);
   for(const dependency of ['collaboration-build','generation-record-read-contracts','generation-record-read-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(stage));
  }
  for(const id of ['segmented-storage-contracts','segmented-relay-storage-contracts','segmented-retained-storage-contracts','segmented-observer-storage-contracts','generation-assets-source-contracts','original-record-read','installed-original-record-read'])find(id);
  assert.equal(plan.v1Ready,false);
 }
 const installed=readFileSync(join(repository,'scripts/check-generation-record-read-installed.mjs'),'utf8');
 for(const text of ['--offline','--ignore-scripts','verifySearchConsumerRegistry','Only reversible locations may change','^# pass 290$','^# fail 0$','^# skipped 0$','workspaceLinks:false','sourceUnchanged:true','persistence/generation_record_read.js','persistence/segmented_session.js','segmented_relay/session.js'])assert.ok(installed.includes(text),text);
});
