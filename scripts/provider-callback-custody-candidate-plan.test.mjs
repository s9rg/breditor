/** The reproduced final-callback ordering failures remain mandatory native checks. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires final-provider native/raster custody regressions',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['provider-callback-custody-plan-contracts','relay-provider-callback-custody','relay-server-room-backups','relay-native','relay-no-server-lint'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const native=plan.checks.find(row=>row.id==='relay-provider-callback-custody');
 assert.deepEqual(native.args.slice(-3),['--test','server_room_backups','provider_callback_custody::']);
 for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(native.args.includes(flag),flag);
 assert.ok(native.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));assert.equal(plan.v1Ready,false);
});
