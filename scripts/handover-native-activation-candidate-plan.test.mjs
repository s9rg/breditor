import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires actual SDK handover activation and installed closure',()=>{
 const plan=candidateReleasePlan({profile}),at=id=>{const value=plan.checks.findIndex(row=>row.id===id);assert.ok(value>=0,id);return value;};
 for(const id of ['handover-native-activation-host','handover-native-activation-native','installed-handover-native-activation'])assert.ok(at('native-handover-activation-host-build')<at(id));
 assert.ok(plan.checks[at('handover-native-activation-host')].args.includes('scripts/native-sealed-handover-process-recovery.test.mjs'));
 assert.ok(plan.checks[at('handover-native-activation-host')].args.includes('scripts/native-sealed-published-process-recovery.test.mjs'));
 assert.ok(at('handover-activation-intent-native')<at('handover-native-activation-native'));
 assert.ok(at('handover-native-activation-native')<at('installed-handover-native-activation'));
 assert.equal(plan.v1Ready,false);
});
