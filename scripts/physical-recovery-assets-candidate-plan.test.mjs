/** Complete provider/client byte reads remain distinct from continuity and mandatory in both plans. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires native/client assets, closed contracts, bare types and installed continuation',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['physical-recovery-assets-plan-contracts','relay-physical-recovery-assets-native','physical-recovery-assets-contracts','physical-recovery-assets-type-fence','physical-recovery-assets','installed-physical-recovery-assets','relay-physical-recovery-control-native','physical-recovery-control','installed-physical-recovery-control','relay-native','relay-no-server-lint'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const native=plan.checks.find(row=>row.id==='relay-physical-recovery-assets-native');assert.deepEqual(native.args.slice(-2),['--lib','server::generation_recovery::tests::physical::asset_availability::control::requirements']);for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(native.args.includes(flag));assert.ok(native.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 assert.ok(ids.indexOf('collaboration-build')<ids.indexOf('physical-recovery-assets'));assert.ok(ids.indexOf('physical-recovery-control')<ids.indexOf('physical-recovery-assets'));assert.ok(ids.indexOf('physical-recovery-assets')<ids.indexOf('installed-physical-recovery-assets'));
 for(const[id,path]of [['physical-recovery-assets','target/physical-recovery-assets-sdk.json'],['installed-physical-recovery-assets','target/physical-recovery-assets-installed.json']])assert.ok(plan.checks.find(row=>row.id===id).artifacts.some(file=>file.path===path&&file.fresh===true));assert.equal(plan.v1Ready,false);
});
