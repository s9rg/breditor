/** Runtime-only custody for an async handoff result. The attempt owns this
 * recipient BEFORE the final barrier. A rejected Promise cannot hide a newly
 * active successor; no serialized phase can make an inactive owner usable. */
import {selectedOwnerHasRetiredActors,checkSelectedAssetOwnerCurrent,discardSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import {fail} from '../native_room_execution/policy.js';
export class RoomRunSuccessorRecipient {
 #owner:RetainedSelectedAssetOwner|undefined;#ready=false;#taken=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 #checkEmpty():void{if(this.#owner||this.#ready||this.#taken||this.#closed)throw fail('room_execution_closed');}
 checkEmpty():void{this.#checkEmpty();}
 stage(owner:RetainedSelectedAssetOwner):void{this.#checkEmpty();selectedOwnerHasRetiredActors(owner);this.#owner=owner;}
 checkStaged():void{if(!this.#owner||this.#ready||this.#taken||this.#closed)throw fail('room_execution_closed');selectedOwnerHasRetiredActors(this.#owner);}
 /** Private flag write only. Canonical staged admission precedes the barrier. */
 activate():void{this.#ready=true;}
 abandon():void{if(!this.#ready)this.#owner=undefined;}
 ready():boolean{return this.#ready&&!this.#taken&&!this.#closed&&this.#owner!==undefined;}
 #value():RetainedSelectedAssetOwner{if(!this.#ready||this.#taken||this.#closed||!this.#owner)throw fail('room_execution_closed');checkSelectedAssetOwnerCurrent(this.#owner);return this.#owner;}
 owner():RetainedSelectedAssetOwner{return this.#value();}
 take():RetainedSelectedAssetOwner{const owner=this.#value();this.#owner=undefined;this.#taken=true;return owner;}
 close():Promise<void>{if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;
  this.#cleanup=(async()=>{if(this.#ready&&this.#owner)await discardSelectedAssetOwner(this.#owner);this.#owner=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;
 }
}
