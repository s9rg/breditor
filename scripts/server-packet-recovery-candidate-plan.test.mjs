/** Both profiles exercise the stronger inspection superset of original packet
 * recovery, with its actual Native build before source and installed cases. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {packetInspectionTests,packetInspectionTypes,packetInspectionData,packetInspectionCaseCount} from './server-packet-inspection-plan.mjs';
for(const profile of ['functional','full'])test(profile+': complete client/server recovery includes actual portable inspection and an independent installed consumer',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}])),prior=rows.get('server-native-dependencies-host'),build=rows.get('server-packet-inspection-native-host'),native=rows.get('server-packet-recovery-native'),installed=rows.get('installed-server-packet-recovery');
 for(const row of [prior,build,native,installed]){assert.ok(row);assert.notEqual(row.required,false);}
 assert.ok(build.index>prior.index);assert.ok(native.index>build.index);assert.ok(installed.index>native.index);
 assert.deepEqual(build.artifacts,[{path:'target/server-packet-inspection-native-build.json',fresh:true},{path:'target/server-packet-inspection-native/release/examples/selected_suggestion_delivery_functional'},{path:'target/server-packet-inspection-native/release/examples/complete_cohort_control_functional'}]);
 for(const name of ['server-packet-closure-contracts.test.mjs','server-packet-source-native.test.mjs','server-packet-inspection-native.test.mjs','server-packet-inspection-cohort-native.test.mjs','saved-packet-native-replay.test.mjs','server-packet-inspection-disabled-native.test.mjs'])assert.ok(native.args.includes('scripts/'+name),name);
 assert.ok(installed.args.includes('scripts/check-server-packet-inspection-installed.mjs'));assert.deepEqual(installed.artifacts,[{path:'target/server-packet-inspection-installed-consumer.json',fresh:true}]);
 for(const id of ['server-native-dependencies-native','installed-server-native-dependencies','server-metadata-sdk-contracts','installed-server-metadata','local-metadata-packet-recovery-native','installed-local-metadata-packet-recovery','metadata-reconciliation-native','installed-metadata-reconciliation'])assert.ok(rows.has(id),id);
 assert.equal(plan.v1Ready,false);
});
test('the shared installed set preserves original cases and runs the complete original owner before new inspection',()=>{
 const old=readFileSync(new URL('./check-server-packet-recovery-installed.mjs',import.meta.url),'utf8'),match=old.match(/const tests=(\[[^\n]+\]);/);assert.ok(match);const prior=JSON.parse(match[1].replaceAll("'",'"'));
 for(const name of prior)if(name!=='server-packet-recovery-native.test.mjs')assert.ok(packetInspectionTests.includes(name),name);
 for(const name of ['server-packet-inspection-native.test.mjs','server-packet-inspection-cohort-native.test.mjs','saved-packet-native-replay.test.mjs','server-packet-inspection-disabled-native.test.mjs'])assert.ok(packetInspectionTests.includes(name),name);
 assert.equal(packetInspectionCaseCount,36);assert.ok(packetInspectionTypes.includes('scripts/fixtures/editor-consumer/types-server-packet-inspection.ts'));assert.ok(packetInspectionData.includes('scripts/fixtures/local-metadata/seven-family-packet-recovery.archive'));
 const fixture=readFileSync(new URL('./fixtures/local-metadata/server-packet-inspection.mjs',import.meta.url),'utf8');assert.ok(fixture.includes('await testServerPacketRecovery(args)'));assert.ok(fixture.includes('metadata.inspectServerPacketRecovery(bundle,reader)'));assert.ok(fixture.includes('checkCompleteInspectionRefusals'));
});
