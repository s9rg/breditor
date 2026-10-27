/** Fresh native/asset readers and separately supplied original-role windows. No stored grant is executed. */
import{RoomExecutionReadScope}from'../native_room_execution/read_scope.js';
import{unionAuthorizations}from'./plan.js';
import type{NativeRoomUnionReadOptions}from'./contract.js';
import{fields}from'./policy.js';
export class NativeRoomUnionReadScope{
 readonly base;readonly authorizations;
 constructor(options:NativeRoomUnionReadOptions){const r=fields(options,['wasm','reads','authorizations','checkAuthority'],['signal','assets']),{authorizations,...rest}=r;this.authorizations=unionAuthorizations(authorizations);this.base=new RoomExecutionReadScope(rest as unknown as Omit<NativeRoomUnionReadOptions,'authorizations'>);Object.freeze(this);}
 check=()=>{this.base.check();};
 close(){this.base.close();}
}
