/** Both candidate profiles must execute all genuine SDK cases from source and installed archives. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': original server metadata requires separate Native hosts, full SDK workflow and installed evidence',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const build=rows.get('server-metadata-native-host'),native=rows.get('server-metadata-sdk-contracts'),installed=rows.get('installed-server-metadata');assert.ok(build);assert.ok(native);assert.ok(installed);
 assert.ok(build.index>rows.get('collaboration-build').index);assert.ok(native.index>build.index);assert.ok(installed.index>native.index);
 assert.equal(native.required===false,false);assert.equal(installed.required===false,false);
 for(const name of ['page-contracts','packet-contracts','generation-native','version-native','physical-native','collection-native','packets-native'])assert.ok(native.args.includes('scripts/server-metadata-'+name+'.test.mjs'));
 assert.deepEqual(build.artifacts,[{path:'target/server-metadata-native-build.json',fresh:true},{path:'target/server-metadata-native/release/examples/selected_suggestion_delivery_functional'},{path:'target/server-metadata-native/release/examples/complete_cohort_control_functional'}]);
 assert.deepEqual(installed.artifacts,[{path:'target/server-metadata-installed-consumer.json',fresh:true}]);assert.equal(plan.v1Ready,false);
});
test('independent package check cannot reduce the original Native cases or public types',()=>{const script=readFileSync(new URL('./check-server-metadata-installed.mjs',import.meta.url),'utf8');for(const text of ["['tests',21],['pass',21]",'workspaceLinks:false','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','types-server-metadata.ts','sourceUnchanged:true'])assert.ok(script.includes(text),text);});
