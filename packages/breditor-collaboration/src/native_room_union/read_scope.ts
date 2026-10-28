/** Original caller windows and explicit authenticated scopes remain separate closed entry paths. */
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {unionAuthorizations} from './plan.js';
import {NativeRoomUnionAuthentication} from '../native_room_union_authentication/source.js';
import type {NativeRoomUnionReadOptions,NativeRoomUnionTarget} from './contract.js';
import type {AuthenticatedNativeRoomUnionReadOptions} from '../native_room_union_authentication/contract.js';
import type {LoadedNativeReconstructionCurrent} from '../selected_native_reconstruction/loaded_current.js';
import {fields} from './policy.js';
export class NativeRoomUnionReadScope {
 readonly #current:(()=>void)|undefined;readonly base;readonly authentication:NativeRoomUnionAuthentication|undefined;#authorizations:NativeRoomUnionReadOptions['authorizations'];
 constructor(options:NativeRoomUnionReadOptions|AuthenticatedNativeRoomUnionReadOptions,authenticated=false,current?:()=>void){
  this.#current=current;
  const r=fields(options,['wasm','reads',authenticated?'authentication':'authorizations','checkAuthority'],['signal','assets']);
  const {authorizations,authentication,...rest}=r;
  this.authentication=authenticated?new NativeRoomUnionAuthentication(authentication as AuthenticatedNativeRoomUnionReadOptions['authentication']):undefined;
  this.#authorizations=authenticated?[]:unionAuthorizations(authorizations);this.base=new RoomExecutionReadScope(rest as unknown as Omit<NativeRoomUnionReadOptions,'authorizations'>);Object.freeze(this);
 }
 get authorizations(){return this.#authorizations;}
 // Runtime custody is not a host permission callback: preserve its own bounded error.
 check=()=>{this.#current?.();this.base.check();this.#current?.();};
 async authorize(targets:readonly Pick<NativeRoomUnionTarget,'id'|'mode'>[]):Promise<void>{this.check();if(this.authentication)this.#authorizations=await this.authentication.read(targets,this.check,this.base.signal);this.check();}
 checkCatalogs(...inputs:readonly LoadedNativeReconstructionCurrent[]):void{this.check();this.authentication?.checkCatalogs(...inputs);this.check();}
 async verify():Promise<void>{this.check();await this.authentication?.verify(this.check,this.base.signal);this.check();}
 close(){this.base.close();}
}
