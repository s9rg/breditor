/** Require the complete source and independent installed cold-recovery matrix. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {nativeColdTests,nativeColdTypes,nativeColdData,nativeColdCaseCount,nativeColdTimeoutMs,nativeColdBuildReport} from './native-cold-restart-plan.mjs';
for(const profile of ['functional','full'])test(profile+': all cold Native recovery cases and independent packages are mandatory',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const prior=rows.get('installed-independent-current-reconciliation'),build=rows.get('native-cold-restart-native-host'),source=rows.get('native-cold-restart-source'),installed=rows.get('installed-native-cold-restart');
 for(const row of [prior,build,source,installed]){assert.ok(row);assert.notEqual(row.required,false);}
 assert.ok(prior.index<build.index&&build.index<source.index&&source.index<installed.index);
 assert.deepEqual(build.args,['scripts/build-native-cold-restart.mjs']);assert.deepEqual(build.artifacts,[{path:nativeColdBuildReport,fresh:true}]);
 assert.deepEqual(source.args,['scripts/check-native-cold-restart-source.mjs']);assert.deepEqual(installed.args,['scripts/check-native-cold-restart-installed.mjs']);
 assert.deepEqual(source.artifacts,[{path:'target/native-cold-restart-source-qualification.json',fresh:true}]);assert.deepEqual(installed.artifacts,[{path:'target/native-cold-restart-installed-consumer.json',fresh:true}]);
 assert.ok(source.timeoutMs>nativeColdTimeoutMs&&installed.timeoutMs>nativeColdTimeoutMs);
 for(const id of ['current-server-packet-reconciliation-native','installed-current-server-packet-reconciliation','server-packet-recovery-native','installed-server-packet-recovery'])assert.ok(rows.has(id),id);
 assert.equal(plan.v1Ready,false);
});
test('five mandatory real cases retain strict public types and original byte fixtures',()=>{
 assert.equal(nativeColdCaseCount,5);assert.deepEqual(nativeColdTests,['native-cold-restart-authentication.test.mjs','native-cold-current-reconciliation.test.mjs']);
 assert.ok(nativeColdTypes.includes('scripts/fixtures/editor-consumer/types-current-server-packet-reconciliation.ts'));
 assert.ok(nativeColdData.includes('scripts/fixtures/local-metadata/seven-family-packet-recovery.archive'));
});
