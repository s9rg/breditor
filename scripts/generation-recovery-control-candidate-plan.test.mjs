/** A standalone generation control cannot be relabeled as a physical ancestor family. */
import assert from 'node:assert/strict';import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires independent native, SDK and installed generation controls',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['generation-recovery-control-plan-contracts','relay-generation-recovery-control-native','generation-recovery-control-contracts','generation-recovery-control-type-fence','generation-recovery-control','installed-generation-recovery-control','physical-recovery-control','installed-physical-recovery-control','relay-native','relay-no-server-lint','relay-docs'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const native=plan.checks.find(row=>row.id==='relay-generation-recovery-control-native');assert.deepEqual(native.args.slice(-2),['--lib','generation_control']);for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(native.args.includes(flag));assert.ok(native.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 assert.ok(ids.indexOf('collaboration-build')<ids.indexOf('generation-recovery-control'));assert.ok(ids.indexOf('generation-recovery-control')<ids.indexOf('installed-generation-recovery-control'));
 for(const[id,path]of [['generation-recovery-control','target/generation-recovery-control-sdk.json'],['installed-generation-recovery-control','target/generation-recovery-control-installed.json']])assert.ok(plan.checks.find(row=>row.id===id).artifacts.some(file=>file.path===path&&file.fresh));
 const contracts=plan.checks.find(row=>row.id==='generation-recovery-control-contracts');assert.equal(contracts.args.length,6);assert.equal(plan.v1Ready,false);
});
