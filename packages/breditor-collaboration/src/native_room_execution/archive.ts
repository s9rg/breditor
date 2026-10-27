/** Independently admit complete native recipes and both whole-queue decision
 * edges. The resulting immutable DATA conveys no native/source/server custody. */
import {captureRoomExecutionData} from './capture_data.js';
import {RoomExecutionReadScope} from './read_scope.js';
import {withExecutionPrepared} from './prepared_scope.js';
import {readRoomExecutionFrame} from './framing.js';
import {preparedNativeUploads} from './native_uploads.js';
import {verifyExecutionAssetDecision,tighterExecutionLimits,assertExecutionLimitsWithin,type ExecutionAssetInputs} from './asset_decisions.js';
import {checkExecutionSources} from './plan.js';
import {fail} from './policy.js';
import type {RoomExecutionChoice,RoomExecutionFile,RoomExecutionReadOptions,RoomExecutionCaptureInput} from './contract.js';
const key=Object.freeze({});
interface State{readonly data:RoomExecutionFile;readonly preparation:Blob;readonly union:ReadonlyMap<string,Blob>;readonly adoption:ReadonlyMap<string,Blob>}
export class RoomExecutionArchive{
 #state:State|undefined;
 private constructor(token:object,state:State){if(token!==key)throw fail('room_execution_policy');this.#state=state;Object.freeze(this);}
 #open():State{const s=this.#state;if(!s)throw fail('room_execution_closed');return s;}
 choice():RoomExecutionChoice{return this.#open().data.choice;}
 file():Blob{return this.#open().data.file;}
 preparation():Readonly<{choice:RoomExecutionChoice['plan']['preparation'];file:Blob}>{const s=this.#open();return Object.freeze({choice:s.data.choice.plan.preparation,file:s.preparation});}
 base(id:string,edge:'union'|'adoption'):Blob{const s=this.#open(),file=(edge==='union'?s.union:edge==='adoption'?s.adoption:undefined)?.get(id);if(!file)throw fail('room_execution_policy');return file;}
 dispose():void{this.#state=undefined;}
 static async capture(input:RoomExecutionCaptureInput,provided:RoomExecutionReadOptions):Promise<RoomExecutionArchive>{return new RoomExecutionArchive(key,await captureRoomExecutionData(input,provided));}
 static async read(file:Blob,expected:RoomExecutionChoice,provided:RoomExecutionReadOptions):Promise<RoomExecutionArchive>{const scope=new RoomExecutionReadScope(provided);try{const framed=await readRoomExecutionFrame(file,expected,scope.integrity),plan=framed.choice.plan,preparation=framed.parts[0]!,union=new Map<string,Blob>(),adoption=new Map<string,Blob>();
  await withExecutionPrepared({choice:plan.preparation,file:preparation},scope,async context=>{checkExecutionSources(context.before,context.retained,plan.layout);if(JSON.stringify(context.catalog.selection())!==JSON.stringify(plan.catalog))throw fail();for(const[index,row]of plan.assets.entries()){scope.check();const source=context.before.approval().choice.adoption.participants.find(value=>value.id===row.id),target=plan.preparation.plan.participants.find(value=>value.id===row.id)?.namespaces.find(value=>value.role==='uploads');if(!source||!target)throw fail();const retainedSource=context.retained.approval().choice.adoption.participants.find(value=>value.id===row.id);if(!retainedSource)throw fail();assertExecutionLimitsWithin(row.limits,source.limits);assertExecutionLimitsWithin(row.limits,retainedSource.limits);const limits=tighterExecutionLimits(tighterExecutionLimits(source.limits,row.limits),scope.assets?.limits),input:ExecutionAssetInputs={id:row.id,current:context.before.selectedUploads(row.id),retained:context.retained.selectedUploads(row.id),native:preparedNativeUploads(context.catalog,row.id),currentDatabase:source.targetDatabase,nativeDatabase:target.database,limits},u=framed.parts[1+2*index]!,a=framed.parts[2+2*index]!;await verifyExecutionAssetDecision(input,row,{union:u,adoption:a},scope.integrity.digest,scope.check,scope.signal);scope.check();union.set(row.id,u);adoption.set(row.id,a);}return undefined;});scope.check();return new RoomExecutionArchive(key,{data:{choice:framed.choice,file:framed.file},preparation,union,adoption});
 }finally{scope.close();}}
}
