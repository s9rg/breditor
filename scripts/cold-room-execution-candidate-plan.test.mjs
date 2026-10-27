import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {journalSourceOpeningWorkload as prior} from './journal-source-opening-workload.mjs';
import {coldRoomExecutionWorkload as work} from './cold-room-execution-workload.mjs';
test('cold interrupted execution extends every prior law and adds actual source, installed and production-bundle gates',()=>{assert.equal(prior.assertions,353);assert.equal(work.assertions,377);assert.equal(work.priorAssertions+work.newExecutionAssertions,work.assertions);assert.deepEqual(work.tests,[...prior.tests,'cold-root-authority.test.mjs','cold-room-captured-packets.test.mjs','cold-room-execution-sdk.test.mjs']);assert.deepEqual(work.types,[...prior.types,'types-cold-room-execution.ts']);assert.equal(work.types.length,14);
 for(const profile of['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
  for(const[id,script,path]of[['cold-room-execution','check-cold-room-execution-sdk.mjs','target/cold-room-execution-sdk.json'],['installed-cold-room-execution','check-cold-room-execution-installed.mjs','target/cold-room-execution-installed-consumer.json']]){assert.deepEqual(find(id).args,['scripts/'+script]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);assert.equal(find(id).timeoutMs,10800000);for(const dependency of['rich-browser-build','collaboration-build','native-complete-cohort','native-complete-image-cohort','cold-room-recovery','installed-cold-room-recovery','completed-room-inspection','installed-completed-room-inspection','journal-source-opening','installed-journal-source-opening','cold-room-execution-contracts','cold-room-execution-type-fence'])assert.ok(position(dependency)<position(id),dependency);}
  assert.equal(plan.v1Ready,false);
 }
});
