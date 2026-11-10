import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';

for(const profile of ['functional','full'])test(profile+' requires metadata handover contracts, native execution and installed execution',()=>{
 const plan=candidateReleasePlan({profile});
 const position=id=>{const index=plan.checks.findIndex(row=>row.id===id);assert.ok(index>=0,id);return index;};
 for(const id of ['metadata-handover-contracts','metadata-handover-types','metadata-handover-native','installed-metadata-handover']){
  for(const prerequisite of ['rich-browser-build','collaboration-build','native-suggestion-room-host'])assert.ok(position(prerequisite)<position(id));
 }
 assert.ok(position('metadata-handover-native')<position('installed-metadata-handover'));
 assert.equal(plan.v1Ready,false);
});
