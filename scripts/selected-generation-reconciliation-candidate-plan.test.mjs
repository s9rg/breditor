/** Native/selected generation coverage must not replace older cumulative gates. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {selectedGenerationReconciliationWorkload as workload} from './selected-generation-reconciliation-workload.mjs';
import {selectedReconciliationWorkload as physical} from './selected-reconciliation-workload.mjs';
import {generationHistoryProviderWorkload as parent} from './generation-history-provider-workload.mjs';
for(const profile of ['functional','full'])test(profile+' requires actual selected generation reconciliation and installed production bundle assertions',()=>{
 assert.equal(workload.assertions,198);assert.equal(workload.newSelectedGenerationAssertions,92);assert.equal(workload.migratedOriginAssertions,6);assert.equal(workload.priorPhysicalSelectedAssertions,38);assert.equal(workload.priorParentProviderAssertions,68);assert.equal(physical.assertions,1991);assert.equal(parent.assertions,68);
 for(const file of ['migrated-generation-reconciliation-sdk.test.mjs','selected-reconciliation-sdk.test.mjs','selected-native-recovery-sdk.test.mjs','generation-history-provider-sdk.test.mjs','complete-history-provider-sdk.test.mjs'])assert.ok(workload.tests.includes(file));
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},pos=id=>plan.checks.indexOf(find(id));
 for(const id of ['selected-reconciliation','installed-selected-reconciliation','generation-history-provider','installed-generation-history-provider','complete-history-provider','installed-complete-history-provider'])find(id);
 assert.deepEqual(find('selected-generation-reconciliation-type-fence').args.slice(-4),workload.types.map(name=>'scripts/fixtures/editor-consumer/'+name));
 for(const[id,file,artifact,timeout]of [['selected-generation-reconciliation','check-selected-generation-reconciliation-sdk.mjs','target/selected-generation-reconciliation-sdk.json',10800000],['installed-selected-generation-reconciliation','check-selected-generation-reconciliation-installed.mjs','target/selected-generation-reconciliation-installed-consumer.json',14400000]]){const row=find(id);assert.deepEqual(row.args,['scripts/'+file]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true}]);assert.ok(row.timeoutMs>=timeout);for(const dep of ['rich-browser-build','collaboration-build','selected-generation-reconciliation-contracts','selected-generation-reconciliation-type-fence'])assert.ok(pos(dep)<pos(id));}
 assert.equal(plan.v1Ready,false);
});
