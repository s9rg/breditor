/** Durable native restart must keep actual cold files, current auth and public native traffic. */
import assert from 'node:assert/strict';import test from 'node:test';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires durable native target and cold service continuation',()=>{
 const plan=candidateReleasePlan({profile});
 for(const id of ['durable-native-activation-plan-contracts','relay-durable-native-activation-native','relay-durable-native-activation-public','relay-native-generation-activation-native','relay-native-generation-activation-public','relay-generation-source-durability-native','relay-native','relay-lint','relay-no-server-lint','relay-docs'])assert.equal(plan.checks.filter(row=>row.id===id).length,1,id);
 for(const[id,suffix]of [['relay-durable-native-activation-native',['--lib','durable_native_activation','--','--nocapture']],['relay-durable-native-activation-public',['--test','log_generations','ten_durable_public_native','--','--nocapture']]]){const row=plan.checks.find(row=>row.id===id);assert.deepEqual(row.args.slice(-suffix.length),suffix);for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));}
 assert.equal(plan.v1Ready,false);
});
