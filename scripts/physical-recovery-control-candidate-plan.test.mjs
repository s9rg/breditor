/** A live native/client join cannot be replaced by portable metadata or omitted from qualification. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires live native control, SDK contracts/types and installed continuity',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['physical-recovery-control-plan-contracts','relay-physical-recovery-control-native','physical-recovery-control-contracts','physical-recovery-control-type-fence','physical-recovery-control','installed-physical-recovery-control','relay-native','relay-no-server-lint','relay-physical-host-assets-public','physical-room-operation','installed-physical-room-operation'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const native=plan.checks.find(row=>row.id==='relay-physical-recovery-control-native');assert.deepEqual(native.args.slice(-2),['--lib','server::generation_recovery::tests::physical::asset_availability::control']);for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(native.args.includes(flag));assert.ok(native.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 assert.ok(ids.indexOf('collaboration-build')<ids.indexOf('physical-recovery-control'));assert.ok(ids.indexOf('physical-room-operation')<ids.indexOf('physical-recovery-control'));assert.ok(ids.indexOf('physical-recovery-control')<ids.indexOf('installed-physical-recovery-control'));
 for(const[id,path]of [['physical-recovery-control','target/physical-recovery-control-sdk.json'],['installed-physical-recovery-control','target/physical-recovery-control-installed.json']])assert.ok(plan.checks.find(row=>row.id===id).artifacts.some(file=>file.path===path&&file.fresh===true));assert.equal(plan.v1Ready,false);
});
