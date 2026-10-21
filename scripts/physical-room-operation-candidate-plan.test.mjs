/** Physical client functionality cannot silently disappear from either candidate profile. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires physical client-operation source/types/storage/installed checks',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['native-server-generation-inventory','physical-room-stage','physical-room-operation-contracts','physical-room-operation-type-fence','physical-room-operation','installed-physical-room-operation','room-recovery-catalog-v2','installed-room-operational-recovery-v2'])assert.equal(ids.filter(value=>value===id).length,1,id);
 assert.ok(ids.indexOf('collaboration-build')<ids.indexOf('physical-room-operation'));assert.ok(ids.indexOf('native-server-generation-inventory')<ids.indexOf('physical-room-operation'));assert.ok(ids.indexOf('physical-room-stage')<ids.indexOf('physical-room-operation'));assert.ok(ids.indexOf('physical-room-operation')<ids.indexOf('installed-physical-room-operation'));
 for(const[id,path]of [['physical-room-operation','target/physical-room-operation-sdk.json'],['installed-physical-room-operation','target/physical-room-operation-installed.json']])assert.ok(plan.checks.find(row=>row.id===id).artifacts.some(file=>file.path===path&&file.fresh===true));assert.equal(plan.v1Ready,false);
});
