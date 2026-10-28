/** Actual persisted mixed execution and independently chosen writer policies. */
import{unionHandoffFixture}from'./handoff.mjs';
import{unionExecutionInput}from'./execution.mjs';
import{selectedPolicy}from'../native-room-retirement/session.mjs';
import{inspectNativeRoomUnionExecution,prepareNativeRoomUnionExecution}from'../../../packages/breditor-collaboration/dist/native_room_union_execution/coordinator.js';
export async function unionRunFixture(options={}){const f=await unionHandoffFixture(options);try{const input=await unionExecutionInput(f),preview=await inspectNativeRoomUnionExecution(f.owner,f.input(),input),execution=await prepareNativeRoomUnionExecution(f.owner,f.input(),{retained:f.retained,authorizations:f.authorizations,expected:preview.choice}),expected={format:'breditor/native-room-union-run',formatVersion:1,database:f.tag+'-union-run',execution:execution.choice},participants=f.data.choice.plan.participants.map(p=>selectedPolicy(f.f.participants.find(old=>old.id===p.id),p));return{...f,execution,layout:input.layout,run:{expected,participants}};}catch(error){await f.close();throw error;}}

/** The TEST HOST explicitly selects output read policies and a fresh lifetime;
 * these executable policies never come from a serialized permission grant. */
export function selectedRunReopenOptions(f,basis,label='observed-selected-reopen'){const{signal,checkAuthority,...original}=f.f.options;return{root:{...original,database:f.layout.operationDatabase,catalogDatabase:f.layout.catalogDatabase,expected:f.execution.choice.plan.catalog,participants:f.run.participants,localPolicies:f.data.choice.plan.participants.filter(p=>p.family==='local-operation-flat').map(p=>({id:p.id,family:'local-operation-flat',original:p.selection.original,options:{session:f.read.reads.find(r=>r.id===p.id).read.session,checkAuthority(){}}})),checkAuthority(){}},basis,reads:{reads:f.read.reads,checkAuthority(){}},intentDatabase:f.tag+'-'+label};}
