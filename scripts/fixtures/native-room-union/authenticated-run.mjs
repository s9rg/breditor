/** Actual authenticated preparation/execution, with independently chosen target writer policies. */
import assert from 'node:assert/strict';
import {authenticatedRoomUnionFixture} from './authenticated.mjs';
import {authenticatedUnionExecutionInput} from './execution.mjs';
import {cancelSelectedUpload} from './fork.mjs';
import {pixelAsset} from '../review-assets/pixels.mjs';
import {selectedPolicy} from '../native-room-retirement/session.mjs';
import {inspectAuthenticatedNativeRoomUnion,prepareAuthenticatedNativeRoomUnion} from '../../../packages/breditor-collaboration/dist/native_room_union/coordinator.js';
import {inspectAuthenticatedNativeRoomUnionExecution,prepareAuthenticatedNativeRoomUnionExecution} from '../../../packages/breditor-collaboration/dist/native_room_union_execution/coordinator.js';
export async function authenticatedRoomRunFixture(fixtures,options={}){
 const f=await authenticatedRoomUnionFixture(fixtures,options);try{
  if(options.selectedQueueBranch){f.retained=await cancelSelectedUpload(f,f.retained,'independent-delivery',pixelAsset);f.preview={...f.preview,retained:f.retained};}
  const preview=await inspectAuthenticatedNativeRoomUnion(f.owner,f.input(),f.preview);assert.equal(preview.kind,'prepared-data');f.data=await prepareAuthenticatedNativeRoomUnion(f.owner,f.input(),{expected:preview.data.choice,retained:f.retained,authentication:f.authentication});
  const input=await authenticatedUnionExecutionInput(f),prepared=await inspectAuthenticatedNativeRoomUnionExecution(f.owner,f.input(),input),execution=await prepareAuthenticatedNativeRoomUnionExecution(f.owner,f.input(),{expected:prepared.choice,retained:f.retained,authentication:f.authentication}),participants=f.data.choice.plan.participants.map(row=>selectedPolicy(f.f.participants.find(old=>old.id===row.id),row)),run={expected:{format:'breditor/native-room-union-run',formatVersion:1,database:f.tag+'-union-run',execution:execution.choice},participants};
  return{...f,execution,layout:input.layout,run,coldOptions(){const{signal,checkAuthority,...root}=f.f.options;return{original:{...root,catalogDatabase:f.tag+'-catalog',checkAuthority(){}},run,reads:f.read,sourceIntentDatabase:f.tag+'-cold-authenticated-original-custody'};}};
 }catch(error){await f.close();throw error;}
}
