/** DATA-only release evidence laws over records extracted from actual Native
 * execution. These checks do not substitute for the Native workflows. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkIndependentCurrentEvidence} from './independent-current-reconciliation-evidence.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/local-metadata/independent-current-evidence.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(fixture.records);
const log=rows=>rows.map(row=>'# '+row.marker+' '+JSON.stringify(row.value)).join('\n');
const marker=(rows,name)=>rows.find(row=>row.marker===name).value;
test('actual three-pair evidence accepts complete audit rows while comparing only the policy pair',()=>{
 const data=checkIndependentCurrentEvidence(log(copy()));assert.equal(data.observations.length,3);assert.equal(data.future.length,3);assert.equal(data.current.length,3);
});
test('missing actual policy cases cannot satisfy independent acceptance',()=>{
 const rows=copy(),index=rows.findIndex(row=>row.marker==='INDEPENDENT_CURRENT_RECONCILIATION_NATIVE');rows.splice(index,1);assert.throws(()=>checkIndependentCurrentEvidence(log(rows)));
});
test('repeating a selected pair cannot replace a different Native policy pair',()=>{
 const rows=copy(),independent=rows.filter(row=>row.marker==='INDEPENDENT_CURRENT_RECONCILIATION_NATIVE');independent[1].value.selected=structuredClone(independent[0].value.selected);assert.throws(()=>checkIndependentCurrentEvidence(log(rows)));
});
test('a changed future Native policy is rejected even with successful history flags',()=>{
 const rows=copy(),audit=marker(rows,'INDEPENDENT_FUTURE_NATIVE_HISTORIES');audit.rows.find(row=>row.id==='independent-local').document='segmented-v1';assert.throws(()=>checkIndependentCurrentEvidence(log(rows)));
});
test('a failed exact comment restoration cannot be recorded as successful acceptance',()=>{
 const rows=copy();marker(rows,'INDEPENDENT_FUTURE_NATIVE_HISTORIES').rows[0].exactFutureCommentViewRestored=false;assert.throws(()=>checkIndependentCurrentEvidence(log(rows)));
});
test('actual cache activity cannot satisfy the no-cache current read contract',()=>{
 const rows=copy();marker(rows,'LAZY_VERSION_RECONCILIATION_NATIVE').cacheCalls=1;assert.throws(()=>checkIndependentCurrentEvidence(log(rows)));
});
test('current provider loss cannot satisfy a checked independent workflow',()=>{
 const rows=copy();marker(rows,'LAZY_VERSION_RECONCILIATION_NATIVE').currentProviderMissing=1;assert.throws(()=>checkIndependentCurrentEvidence(log(rows)));
});
