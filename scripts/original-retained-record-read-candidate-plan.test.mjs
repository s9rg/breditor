/** Committed original native/catalog/outbox state cannot be qualified by LIVE export alone. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
test('both profiles require original native and dependent actual rows through source/packages/bundle',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];};
  assert.deepEqual(find('original-retained-record-read-contracts').args,['--test','scripts/original-native-record-read.test.mjs','scripts/original-version-record-read.test.mjs','scripts/original-revision-record-read.test.mjs','scripts/original-record-read-isolation.test.mjs','scripts/original-record-read-disposal.test.mjs','scripts/original-retained-record-read-candidate-plan.test.mjs']);
  assert.ok(find('original-retained-record-read-type-fence').args.includes('scripts/fixtures/editor-consumer/types-original-retained-record-read.ts'));
  for(const[id,script,path,timeout]of [['original-retained-record-read','check-original-retained-record-read-sdk.mjs','target/original-retained-record-read-sdk.json',900000],['installed-original-retained-record-read','check-original-retained-record-read-installed.mjs','target/original-retained-record-read-installed-consumer.json',1800000]]){
   const stage=find(id);assert.deepEqual(stage.args,['scripts/'+script]);assert.deepEqual(stage.artifacts,[{path,fresh:true}]);assert.ok(stage.timeoutMs>=timeout);for(const dependency of ['collaboration-build','original-retained-record-read-contracts','original-retained-record-read-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(stage));
  }
  for(const id of ['participant-operation','paired-session-backups','retained-version-recovery-contracts','pending-recovery-contracts','original-record-read','installed-original-record-read','generation-record-read','installed-generation-record-read'])find(id);
  assert.equal(plan.v1Ready,false);
 }
 const installed=readFileSync(join(repository,'scripts/check-original-retained-record-read-installed.mjs'),'utf8');
 for(const text of ['--offline','--ignore-scripts','verifySearchConsumerRegistry','Only reversible locations may change','^# pass 487$','^# fail 0$','^# skipped 0$','workspaceLinks:false','sourceUnchanged:true','persistence/original_record_read.js','persistence/shared_session.js','versions/catalog.js','versions/store.js','versions/sync.js','suggestion_revisions/outbox.js'])assert.ok(installed.includes(text),text);
});
