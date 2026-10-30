/** Required real Native workflow, strict consumer types and fresh evidence in both profiles. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {readFileSync} from 'node:fs';
import {metadataRecoveryArtifacts} from './metadata-recovery-artifacts.mjs';
for(const profile of ['functional','full'])test(profile+': release requires genuine room/metadata/provider reconciliation and original ownership regressions',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const ids=['metadata-reconciliation-plan-contracts','metadata-reconciliation-private-types','metadata-reconciliation-component-contracts','metadata-reconciliation-native','installed-metadata-reconciliation'];
 for(const id of ids){const row=rows.get(id);assert.ok(row,id);assert.notEqual(row.required,false);for(const dependency of ['collaboration-build','rich-browser-build','native-suggestion-room-host','selected-delivery-native-host','segmented-relay-native-host','metadata-reconciliation-root-host'])assert.ok(rows.get(dependency).index<row.index);}
 const native=rows.get('metadata-reconciliation-native');for(const file of ['metadata-reconciliation-input-native.test.mjs','original-retention-version-loan-native.test.mjs','original-recovery-owner-version-loan-native.test.mjs','original-retained-root-version-loan-native.test.mjs','metadata-provider-reconciliation-native.test.mjs','metadata-provider-reconciliation-cold-native.test.mjs'])assert.ok(native.args.includes('scripts/'+file));
 const producer=rows.get('metadata-reconciliation-root-host');assert.ok(producer.args.includes('generation_complete_control_functional'));assert.ok(producer.artifacts.some(row=>row.path.endsWith('/generation_complete_control_functional')));
 assert.ok(native.timeoutMs>=7200000);assert.ok(native.index<rows.get('installed-metadata-reconciliation').index);
 const types=rows.get('metadata-reconciliation-private-types');for(const flag of ['--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess'])assert.ok(types.args.includes(flag));
 assert.ok(types.args.includes('scripts/fixtures/editor-consumer/types-local-metadata-reconciliation.ts'));
 assert.deepEqual(rows.get('installed-metadata-reconciliation').artifacts,[{path:metadataRecoveryArtifacts.reconciliation,fresh:true}]);assert.ok(rows.get('installed-metadata-reconciliation').timeoutMs>=7200000);
 assert.ok(rows.get('segmented-retained-storage-contracts').index<rows.get('installed-metadata-reconciliation').index);
 assert.ok(rows.has('installed-metadata-server-bytes'));assert.ok(rows.has('installed-recoverable-metadata'));assert.equal(plan.v1Ready,false);
});

test('installed reconciliation keeps every original case and requires the complete post-ACK cold workflow',()=>{const script=readFileSync(new URL('./check-metadata-reconciliation-installed.mjs',import.meta.url),'utf8');for(const text of ["'metadata-provider-reconciliation-native.test.mjs'","'metadata-provider-reconciliation-cold-native.test.mjs'","['tests',114],['pass',114]",'workspaceLinks:false','sourceUnchanged:true'])assert.ok(script.includes(text),text);});
