
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' keeps actual retained-owner delivery, complete cold resume and installed execution mandatory',()=>{
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
 for(const id of ['retained-delivery-work-contracts','retained-delivery-owner','selected-delivery-preparation-native','selected-delivery-current-inventory-native','selected-delivery-journal-native','coupled-delivery-lifecycle','delivery-resume-admission-cleanup-native','delivery-journal-cold-resume-native','delivery-journal-handover-native','installed-delivery-journal-cold-resume'])for(const prerequisite of ['rich-browser-build','collaboration-build','selected-delivery-native-host'])assert.ok(position(prerequisite)<position(id));
 assert.deepEqual(find('delivery-resume-admission-cleanup-native').args,['--test','scripts/delivery-resume-admission-cleanup.test.mjs']);
 assert.deepEqual(find('delivery-journal-cold-resume-native').args,['--test','scripts/coupled-delivery-cold.test.mjs']);
 assert.deepEqual(find('delivery-journal-handover-native').args,['--test','scripts/coupled-delivery-handover.test.mjs']);
 assert.ok(position('delivery-journal-handover-native')<position('installed-delivery-journal-cold-resume'));
 const installed=find('installed-delivery-journal-cold-resume');assert.deepEqual(installed.args,['scripts/check-delivery-journal-resume-installed.mjs']);assert.deepEqual(installed.artifacts,[{path:'target/delivery-journal-resume-installed-consumer.json',fresh:true}]);
 assert.ok(position('delivery-journal-cold-resume-native')<position('installed-delivery-journal-cold-resume'));assert.ok(find('delivery-journal-resume-private-types').args.includes('scripts/fixtures/editor-consumer/types-delivery-journal-resume.ts'));assert.equal(plan.v1Ready,false);
});
