/** Pure two-stage conflict discovery. The second preview requires every first
 * edge choice explicitly. Neither preview saves a choice or opens any target. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {unionChoice as roomPreparationChoice} from '../native_room_union/plan.js';
import {MAX_NATIVE_ROOM_UNION_BYTES as MAX_ROOM_PREPARATION_BYTES} from '../native_room_union/policy.js';
import type {NativeRoomUnionFile as RoomPreparationFile} from '../native_room_union/contract.js';
import type {NativeRoomUnionExecutionReadOptions as RoomExecutionReadOptions} from './contract.js';
import type {RoomExecutionAssetChoices}from'../native_room_execution/contract.js';
import {fields,rows,fail,MAX_ROOM_EXECUTION_MEMBERS} from '../native_room_execution/policy.js';
import {executionAssetChoices} from '../native_room_execution/plan.js';
import {NativeRoomUnionReadScope as RoomExecutionReadScope} from '../native_room_union/read_scope.js';
import {withNativeRoomUnionPrepared as withExecutionPrepared} from '../native_room_union/prepared_scope.js';
import {executionAssetInputs} from '../native_room_execution/asset_inputs.js';
import {previewExecutionAssetUnion,previewExecutionAssetAdoption} from '../native_room_execution/asset_decisions.js';
import type{AuthenticatedNativeRoomUnionReadOptions as AuthRead}from'../native_room_union_authentication/contract.js';
function preparation(value:RoomPreparationFile){const row=fields(value,['choice','file']);return{choice:roomPreparationChoice(row['choice']),file:archiveBlob(row['file'] as Blob,MAX_ROOM_PREPARATION_BYTES)};}
export function previewNativeRoomUnionExecutionUnion(provided:RoomPreparationFile,options:RoomExecutionReadOptions){return previewUnion(provided,options,false);}
export function previewAuthenticatedNativeRoomUnionExecutionUnion(provided:RoomPreparationFile,options:AuthRead){return previewUnion(provided,options,true);}
async function previewUnion(provided:RoomPreparationFile,options:RoomExecutionReadOptions|AuthRead,authenticated:boolean){const input=preparation(provided),scope=new RoomExecutionReadScope(options,authenticated);try{return await withExecutionPrepared(input,scope,async context=>{const result=[];for(const row of input.choice.plan.participants){scope.check();result.push(Object.freeze({id:row.id,preview:await previewExecutionAssetUnion(executionAssetInputs(context,input.choice,row.id,scope.base),scope.check,scope.base.signal)}));}scope.check();return Object.freeze(result);});}finally{scope.close();}}
export function previewNativeRoomUnionExecutionAdoption(provided:RoomPreparationFile,chosen:readonly Pick<RoomExecutionAssetChoices,'id'|'union'>[],options:RoomExecutionReadOptions){return previewAdoption(provided,chosen,options,false);}
export function previewAuthenticatedNativeRoomUnionExecutionAdoption(provided:RoomPreparationFile,chosen:readonly Pick<RoomExecutionAssetChoices,'id'|'union'>[],options:AuthRead){return previewAdoption(provided,chosen,options,true);}
async function previewAdoption(provided:RoomPreparationFile,chosen:readonly Pick<RoomExecutionAssetChoices,'id'|'union'>[],options:RoomExecutionReadOptions|AuthRead,authenticated:boolean){const input=preparation(provided),decisions=executionAssetChoices(rows(chosen,MAX_ROOM_EXECUTION_MEMBERS).map(value=>{const row=fields(value,['id','union']);return{id:row['id'],union:row['union'],adoption:[]};}));if(JSON.stringify(decisions.map(row=>row.id))!==JSON.stringify(input.choice.plan.participants.map(row=>row.id)))throw fail('room_execution_policy');const scope=new RoomExecutionReadScope(options,authenticated);try{return await withExecutionPrepared(input,scope,async context=>{const result=[];for(const row of decisions){scope.check();result.push(Object.freeze({id:row.id,preview:await previewExecutionAssetAdoption(executionAssetInputs(context,input.choice,row.id,scope.base),row.union,scope.check,scope.base.signal)}));}scope.check();return Object.freeze(result);});}finally{scope.close();}}
