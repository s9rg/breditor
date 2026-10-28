/** Separate family admission never removes the cumulative physical history gate. */
import assert from 'node:assert/strict';import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {generationHistoryProviderWorkload as workload} from './generation-history-provider-workload.mjs';
import {completeHistoryProviderWorkload as old} from './complete-history-provider-workload.mjs';
for(const profile of ['functional','full'])test(profile+' requires source, installed and bundled seven-family generation provider reads',()=>{
 assert.equal(workload.assertions,68);assert.equal(workload.newGenerationAssertions,53);assert.equal(workload.priorPhysicalAssertions,15);assert.deepEqual(workload.tests,['generation-history-provider-sdk.test.mjs','complete-history-provider-sdk.test.mjs']);assert.equal(old.assertions,1421);
 const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},pos=id=>plan.checks.indexOf(find(id));
 for(const id of ['complete-history-provider','installed-complete-history-provider','generation-recovery-control','installed-generation-recovery-control','generation-history-provider-contracts'])find(id);
 assert.deepEqual(find('generation-history-provider-type-fence').args.slice(-2),workload.types.map(name=>'scripts/fixtures/editor-consumer/'+name));
 for(const[id,script,artifact,timeout]of [['generation-history-provider','check-generation-history-provider-sdk.mjs','target/generation-history-provider-sdk.json',7200000],['installed-generation-history-provider','check-generation-history-provider-installed.mjs','target/generation-history-provider-installed-consumer.json',14400000]]){const row=find(id);assert.deepEqual(row.args,['scripts/'+script]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true}]);assert.ok(row.timeoutMs>=timeout);for(const dependency of ['rich-browser-build','collaboration-build','generation-history-provider-contracts','generation-history-provider-type-fence'])assert.ok(pos(dependency)<pos(id));}
 assert.equal(plan.v1Ready,false);
});
