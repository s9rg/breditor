/** The actual lifecycle laws and independent package check are required in both plans. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
test('candidate plans require native storage lifecycle checks and fresh installed evidence',()=>{
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),unit=plan.checks.find(row=>row.id==='storage-terminal-lifecycle-contracts'),installed=plan.checks.find(row=>row.id==='installed-storage-terminal-lifecycle');assert.ok(unit);assert.ok(installed);assert.deepEqual(unit.args,['--test','scripts/storage-terminal-lifecycle.test.mjs','scripts/native-storage-lifecycle.test.mjs','scripts/storage-terminal-lifecycle-candidate-plan.test.mjs']);assert.deepEqual(installed.artifacts,[{path:'target/storage-terminal-lifecycle-installed-consumer.json',fresh:true}]);assert.ok(plan.checks.indexOf(unit)>plan.checks.findIndex(row=>row.id==='collaboration-build'));assert.equal(plan.v1Ready,false);}
});
