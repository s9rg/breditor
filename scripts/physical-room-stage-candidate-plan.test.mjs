/** Both candidate profiles require source, type, intent and genuinely installed staging checks. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires physical staging without replacing older catalog checks',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['native-server-generation-inventory','physical-room-catalog','physical-room-stage-contracts','physical-room-stage-type-fence','physical-room-stage','installed-physical-room-stage','room-recovery-catalog-v2','installed-room-operational-recovery-v2'])assert.equal(ids.filter(value=>value===id).length,1,id);
 assert.ok(ids.indexOf('collaboration-build')<ids.indexOf('physical-room-stage'));assert.ok(ids.indexOf('native-server-generation-inventory')<ids.indexOf('physical-room-stage'));assert.ok(ids.indexOf('physical-room-stage')<ids.indexOf('installed-physical-room-stage'));
 for(const[id,path]of [['physical-room-stage','target/physical-room-stage-sdk.json'],['installed-physical-room-stage','target/physical-room-stage-installed.json']])assert.ok(plan.checks.find(row=>row.id===id).artifacts.some(file=>file.path===path&&file.fresh===true));
 assert.equal(plan.v1Ready,false);
});
