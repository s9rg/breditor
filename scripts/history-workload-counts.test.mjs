/** Approved declarations and cumulative reader domains, not skipped-body acceptance. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {retainedStorageRegressionLaws} from './retained-storage-regression-count.mjs';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/history-workload-counts.json',import.meta.url))),counts=fixture.counts;
const specifications=[{"file": "fresh-delivery-history-workload.mjs", "key": "freshDeliveryHistoryWorkload", "expected": 1232}, {"file": "fresh-room-history-workload.mjs", "key": "freshRoomHistoryWorkload", "expected": 1249}, {"file": "generation-operational-record-read-workload.mjs", "key": "generationOperationalRecordReadWorkload", "expected": 1052}, {"file": "operational-history-reference-workload.mjs", "key": "operationalHistoryReferenceWorkload", "expected": 1183}, {"file": "original-operational-record-read-workload.mjs", "key": "originalOperationalRecordReadWorkload", "expected": 955}, {"file": "original-record-references-workload.mjs", "key": "originalRecordReferenceWorkload", "expected": 903}, {"file": "protected-history-group-workload.mjs", "key": "protectedHistoryGroupWorkload", "expected": 1201}];
for(const row of specifications)test('complete declared history count '+row.file,async()=>{const workload=(await import('./'+row.file))[row.key];assert.equal(new Set(workload.tests).size,workload.tests.length);assert.equal(workload.assertions,row.expected);for(const file of workload.tests)assert.ok(Object.hasOwn(counts,file),file);assert.equal(workload.tests.reduce((sum,file)=>sum+counts[file],0),workload.assertions);});
test('full reader domain retains every approved file and the two existing snapshot laws',async()=>{const {freshRoomHistoryWorkload:full}=await import('./fresh-room-history-workload.mjs');assert.equal(retainedStorageRegressionLaws,30);assert.equal(counts['segmented-retained-storage.test.mjs'],retainedStorageRegressionLaws);assert.deepEqual([...full.tests].sort(),Object.keys(counts).sort());assert.equal(Object.keys(counts).length,33);assert.equal(full.assertions,1249);assert.equal(fixture.retainedSnapshotRegressionsAddedIn,'fe0f66d5');});
for(const profile of ['full','functional'])test(profile+' checks approved history declaration counts before qualification',()=>{const plan=candidateReleasePlan({profile}),rows=plan.checks.filter(row=>row.id==='history-workload-count-contracts');assert.equal(rows.length,1);assert.deepEqual(rows[0].args,['--test','scripts/history-workload-counts.test.mjs']);assert.equal(plan.v1Ready,false);});

// Descendants retain the complete reader domain and derive totals from it.
const descendants=[
 ['complete-history-provider-workload.mjs','completeHistoryProviderWorkload',1426],
 ['room-record-cut-workload.mjs','roomRecordCutWorkload',1487],
 ['room-asset-approval-workload.mjs','roomAssetApprovalWorkload',1559],
 ['retained-native-continuation-workload.mjs','retainedNativeContinuationWorkload',1577],
 ['selected-owner-workload.mjs','selectedOwnerWorkload',1963],
 ['selected-reconciliation-workload.mjs','selectedReconciliationWorkload',1990],
];
for(const [file,key,total] of descendants)test('complete inherited history count '+file,async()=>{
 const workload=(await import('./'+file))[key];
 assert.equal(workload.assertions,total);
 assert.equal(new Set(workload.tests).size,workload.tests.length);
 for(const name of Object.keys(counts))assert.ok(workload.tests.includes(name),name);
});
