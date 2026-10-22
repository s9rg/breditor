/** Real multi-owner upload custody and installed final guards are mandatory, not inherited from backup checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
test('both profiles require actual operation upload custody, native handoff guards and fresh installed assertions',()=>{
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(value=>value.id===id);assert.ok(row,id);return row;};assert.deepEqual(find('operation-asset-custody-contracts').args,['--test','scripts/operation-asset-handoff.test.mjs','scripts/operation-handoff-guard.test.mjs','scripts/operation-asset-custody.test.mjs','scripts/operation-cohort.test.mjs','scripts/operation-asset-custody-candidate-plan.test.mjs']);assert.ok(find('operation-asset-custody-type-fence').args.includes('scripts/fixtures/editor-consumer/types-operation-asset-custody.ts'));assert.deepEqual(find('installed-operation-asset-custody').artifacts,[{path:'target/operation-asset-custody-installed-consumer.json',fresh:true}]);assert.ok(plan.checks.indexOf(find('collaboration-build'))<plan.checks.indexOf(find('operation-asset-custody-contracts')));assert.equal(plan.v1Ready,false);}
 const installed=readFileSync(join(repository,'scripts/check-operation-asset-custody-installed.mjs'),'utf8');for(const text of ['--offline','--ignore-scripts','verifySearchConsumerRegistry','reversibleLocationsOnly:true','strictPublicTypes:true','workspaceLinks:false','sourceUnchanged:true','^# pass 45$','Only reversible module locations may change'])assert.ok(installed.includes(text),text);
});
