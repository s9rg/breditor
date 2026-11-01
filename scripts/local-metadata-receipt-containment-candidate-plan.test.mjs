/** New evidence is additive; every previous original metadata stage remains required. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': original local receipt containment requires genuine source and independent installed workflows',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const build=rows.get('server-metadata-native-host'),native=rows.get('local-metadata-receipt-containment-native'),installed=rows.get('installed-local-metadata-receipt-containment');
 assert.ok(build);assert.ok(native);assert.ok(installed);assert.ok(native.index>build.index);assert.ok(installed.index>native.index);
 assert.equal(native.required===false,false);assert.equal(installed.required===false,false);
 assert.ok(native.args.includes('scripts/local-metadata-receipt-containment-native.test.mjs'));
 assert.deepEqual(installed.artifacts,[{path:'target/local-metadata-receipt-containment-installed-consumer.json',fresh:true}]);
 assert.ok(rows.has('server-metadata-sdk-contracts'));assert.ok(rows.has('installed-server-metadata'));assert.ok(rows.has('metadata-reconciliation-native'));assert.ok(rows.has('installed-metadata-reconciliation'));assert.equal(plan.v1Ready,false);
});
test('independent receipt workflow cannot omit original cases, strict types, actual Native binaries or source identity',()=>{
 const script=readFileSync(new URL('./check-local-metadata-receipt-containment-installed.mjs',import.meta.url),'utf8');
 for(const text of ["['tests',23],['pass',23]",'local-metadata-receipt-containment-native.test.mjs','metadata-receipt-comparison-native.test.mjs','types-local-metadata-receipt-containment.ts','workspaceLinks:false','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','reversibleModuleLocationsOnly:true','sourceUnchanged:true','target/server-metadata-native/release/examples/'])assert.ok(script.includes(text),text);
});
