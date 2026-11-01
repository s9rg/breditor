/** Server knowledge cannot replace original metadata recovery qualification. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': full Native server knowledge requires a separate build, real lagged-client/physical reads and independent installation',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}])),build=rows.get('server-native-dependencies-host'),native=rows.get('server-native-dependencies-native'),installed=rows.get('installed-server-native-dependencies');
 assert.ok(build);assert.ok(native);assert.ok(installed);assert.ok(build.index>rows.get('collaboration-build').index);assert.ok(native.index>build.index);assert.ok(installed.index>native.index);
 for(const row of [build,native,installed])assert.notEqual(row.required,false);
 for(const name of ['contracts','unseen-native','physical-native'])assert.ok(native.args.includes('scripts/server-native-dependencies-'+name+'.test.mjs'));
 assert.deepEqual(build.artifacts,[{path:'target/server-native-dependencies-native-build.json',fresh:true},{path:'target/server-native-dependencies-native/release/examples/selected_suggestion_delivery_functional'},{path:'target/server-native-dependencies-native/release/examples/complete_cohort_control_functional'}]);
 assert.deepEqual(installed.artifacts,[{path:'target/server-native-dependencies-installed-consumer.json',fresh:true}]);
 for(const id of ['server-metadata-native-host','server-metadata-sdk-contracts','installed-server-metadata','local-metadata-packet-recovery-native','installed-local-metadata-packet-recovery','metadata-reconciliation-native','installed-metadata-reconciliation'])assert.ok(rows.has(id),id);
 assert.equal(plan.v1Ready,false);
});
test('installed dependency workflow retains every original metadata case, strict types, separate genuine hosts and source/runtime checks',()=>{
 const script=readFileSync(new URL('./check-server-native-dependencies-installed.mjs',import.meta.url),'utf8');
 for(const value of ["['tests',30],['pass',30]",'server-native-dependencies-unseen-native.test.mjs','server-native-dependencies-physical-native.test.mjs','server-metadata-collection-native.test.mjs','server-metadata-packets-native.test.mjs','types-server-metadata.ts','types-server-native-dependencies.ts','workspaceLinks:false','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','sourceUnchanged:true','reversibleModuleLocationsOnly:true',"['server-metadata-native','server-native-dependencies-native']",'normalWasmSha256'])assert.ok(script.includes(value),value);
});
