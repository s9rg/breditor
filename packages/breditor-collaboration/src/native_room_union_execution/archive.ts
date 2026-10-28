/** Complete mixed native proof plus independently chosen full queue decisions.
 * Admission is DATA only. No writer is retired and no target is opened. */
import{archiveBlob}from'../archive_integrity/policy.js';
import{NativeRoomUnionReadScope as Scope}from'../native_room_union/read_scope.js';
import{withNativeRoomUnionPrepared}from'../native_room_union/prepared_scope.js';
import{unionChoice}from'../native_room_union/plan.js';
import{MAX_NATIVE_ROOM_UNION_BYTES}from'../native_room_union/policy.js';
import{executionLayout,executionAssetChoices,checkExecutionSources}from'../native_room_execution/plan.js';
import{executionAssetInputs}from'../native_room_execution/asset_inputs.js';
import{buildExecutionAssetDecision,verifyExecutionAssetDecision,assertExecutionLimitsWithin,tighterExecutionLimits}from'../native_room_execution/asset_decisions.js';
import{encodeUnionExecution,readUnionExecutionFrame}from'./framing.js';
import{unionExecutionPlan,checkUnionExecutionLayout}from'./plan.js';
import type{RoomExecutionAssetPlan}from'../native_room_execution/contract.js';
import type{NativeRoomUnionExecutionReadOptions as Read,NativeRoomUnionExecutionCaptureInput as Capture,NativeRoomUnionExecutionChoice as Choice,NativeRoomUnionExecutionFile as File}from'./contract.js';
import{fields,fail}from'./policy.js';
interface State{readonly data:File;readonly preparation:Blob;readonly parts:readonly Blob[]}
const token=Object.freeze({});
function input(provided:Capture){const r=fields(provided,['preparation','layout','decisions']),p=fields(r['preparation'],['choice','file']),preparation={choice:unionChoice(p['choice']),file:archiveBlob(p['file'] as Blob,MAX_NATIVE_ROOM_UNION_BYTES)},layout=executionLayout(r['layout']),decisions=executionAssetChoices(r['decisions']);checkUnionExecutionLayout(preparation.choice,layout);if(JSON.stringify(preparation.choice.plan.participants.map(p=>p.id))!==JSON.stringify(decisions.map(p=>p.id)))throw fail('room_union_execution_policy');return{preparation,layout,decisions};}
export class NativeRoomUnionExecutionArchive{
 #state:State|undefined;
 private constructor(key:object,state:State){if(key!==token)throw fail('room_union_execution_policy');this.#state=state;Object.freeze(this);}
 #open(){const state=this.#state;if(!state)throw fail('room_union_execution_closed');return state;}
 choice(){return this.#open().data.choice;}
 file(){return this.#open().data.file;}
 preparation(){const s=this.#open();return Object.freeze({choice:s.data.choice.plan.preparation,file:s.preparation});}
 base(id:string,edge:'union'|'adoption'){const s=this.#open(),i=s.data.choice.plan.assets.findIndex(p=>p.id===id);if(i<0||edge!=='union'&&edge!=='adoption')throw fail('room_union_execution_policy');return s.parts[1+2*i+(edge==='adoption'?1:0)]!;}
 dispose(){this.#state=undefined;}
 static async capture(provided:Capture,read:Read):Promise<NativeRoomUnionExecutionArchive>{if(this!==NativeRoomUnionExecutionArchive)throw fail('room_union_execution_policy');const chosen=input(provided),scope=new Scope(read);try{return await withNativeRoomUnionPrepared(chosen.preparation,scope,async context=>{checkExecutionSources(context.before,context.retained,chosen.layout);const parts:Blob[]=[chosen.preparation.file],assets:RoomExecutionAssetPlan[]=[];for(const decision of chosen.decisions){scope.check();const built=await buildExecutionAssetDecision(executionAssetInputs(context,chosen.preparation.choice,decision.id,scope.base),decision,scope.base.integrity.digest,scope.check,scope.base.signal);assets.push(built.plan);parts.push(built.union,built.adoption);}const plan=unionExecutionPlan({format:'breditor/native-room-union-execution-plan',formatVersion:1,preparation:chosen.preparation.choice,layout:chosen.layout,catalog:context.catalog.selection(),assets}),data=await encodeUnionExecution(plan,parts,scope.base.integrity);scope.check();return new NativeRoomUnionExecutionArchive(token,{data,preparation:chosen.preparation.file,parts});});}finally{scope.close();}}
 static async read(file:Blob,expected:Choice,read:Read):Promise<NativeRoomUnionExecutionArchive>{if(this!==NativeRoomUnionExecutionArchive)throw fail('room_union_execution_policy');const scope=new Scope(read);try{const framed=await readUnionExecutionFrame(file,expected,scope.base.integrity),plan=framed.choice.plan,preparation={choice:plan.preparation,file:framed.parts[0]!};await withNativeRoomUnionPrepared(preparation,scope,async context=>{checkExecutionSources(context.before,context.retained,plan.layout);if(JSON.stringify(context.catalog.selection())!==JSON.stringify(plan.catalog))throw fail();for(const[i,row]of plan.assets.entries()){const selected=executionAssetInputs(context,plan.preparation,row.id,scope.base);const a=context.before.approval().choice.adoption.participants.find(p=>p.id===row.id),b=context.retained.approval().choice.adoption.participants.find(p=>p.id===row.id);if(!a||!b)throw fail();assertExecutionLimitsWithin(row.limits,a.limits);assertExecutionLimitsWithin(row.limits,b.limits);const input={...selected,limits:tighterExecutionLimits(selected.limits,row.limits)};await verifyExecutionAssetDecision(input,row,{union:framed.parts[1+2*i]!,adoption:framed.parts[2+2*i]!},scope.base.integrity.digest,scope.check,scope.base.signal);scope.check();}return undefined;});scope.check();return new NativeRoomUnionExecutionArchive(token,{data:{choice:framed.choice,file:framed.file},preparation:preparation.file,parts:framed.parts});}finally{scope.close();}}
}
