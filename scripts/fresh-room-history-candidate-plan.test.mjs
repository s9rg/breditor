import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
import {freshRoomHistoryWorkload as workload} from './fresh-room-history-workload.mjs';
test('both profiles require fresh native fixtures and the full cumulative room-history domain',()=>{
 assert.equal(workload.assertions,workload.newRoomHistoryAssertions+workload.priorAssertions);assert.equal(workload.newRoomHistoryAssertions,15);assert.equal(workload.priorAssertions,1230);assert.equal(workload.types.length,12);assert.equal(new Set(workload.tests).size,workload.tests.length);
 const contracts=workload.tests.filter(name=>name.startsWith('physical-operation-v3-history-'));
 assert.equal(contracts.length,5);
 for(const profile of['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(s=>s.id===id);assert.equal(rows.length,1,id);return rows[0];};assert.deepEqual(find('fresh-room-history-contracts').args,['--test',...contracts.map(path=>'scripts/'+path),'scripts/fresh-room-history-candidate-plan.test.mjs']);assert.ok(find('fresh-room-history-type-fence').args.includes('scripts/fixtures/editor-consumer/types-complete-history-read.ts'));
  for(const[id,script,path,timeout]of[['fresh-room-history','check-fresh-room-history-sdk.mjs','target/fresh-room-history-sdk.json',3600000],['installed-fresh-room-history','check-fresh-room-history-installed.mjs','target/fresh-room-history-installed-consumer.json',7200000]]){const stage=find(id);assert.deepEqual(stage.args,['scripts/'+script]);assert.deepEqual(stage.artifacts,[{path,fresh:true}]);assert.ok(stage.timeoutMs>=timeout);for(const dependency of['collaboration-build','native-complete-cohort','fresh-room-history-contracts','fresh-room-history-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(stage));}
  for(const id of['participant-operation','generation-operation-live','fresh-delivery-history','installed-fresh-delivery-history','physical-operation-v3-contracts','operational-native-read-contracts'])find(id);assert.equal(plan.v1Ready,false);
 }
 for(const kind of['sdk','installed']){const text=readFileSync(join(repository,'scripts/check-fresh-room-history-'+kind+'.mjs'),'utf8');for(const value of['freshRoomHistoryWorkload as workload','const {tests,types,assertions,scope}=workload',"new RegExp('^# pass '+assertions+'$','m')",'^# fail 0$','^# skipped 0$','nativeInputsFreshForSource:true','native.files.length,50','assert.deepEqual(native.source,source'])assert.ok(text.includes(value),value);}
 const installed=readFileSync(join(repository,'scripts/check-fresh-room-history-installed.mjs'),'utf8');for(const value of['--offline','--ignore-scripts','verifySearchConsumerRegistry','Only reversible locations may change','workspaceLinks:false','sourceUnchanged:true','physical_room_operation_v3/history_read.js','complete_operation_cohort/history_read.js','operation_read/protected_history_group.js'])assert.ok(installed.includes(value),value);
});
