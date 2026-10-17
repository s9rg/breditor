import {SharedRelayError} from "../relay/validation.js";
import type {SharedDocumentVersionsIdentity} from "./types.js";
/** Origin-wide cache mutation exclusion, independent of database name and server authorization. */
export class VersionCatalogLease {
 #live=true;readonly #release:()=>void;readonly #finished:Promise<void>;
 private constructor(release:()=>void,finished:Promise<void>){this.#release=release;this.#finished=finished;}
 static async acquire(identity:SharedDocumentVersionsIdentity):Promise<VersionCatalogLease>{
  if(!globalThis.navigator?.locks)throw new SharedRelayError("version_locks_unavailable");
  let release!:()=>void,accept!:(lease:VersionCatalogLease)=>void,reject!:(error:unknown)=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<VersionCatalogLease>((resolve,fail)=>{accept=resolve;reject=fail;});
  const finished=navigator.locks.request(`breditor:version-catalog:${JSON.stringify([identity.endpoint,identity.room,identity.binding,identity.principal,identity.documentWriter])}`,{mode:"exclusive",ifAvailable:true},async lock=>{
   await Promise.resolve();if(!lock){reject(new SharedRelayError("version_catalog_in_use"));return;}accept(new VersionCatalogLease(release,finished));await held;
  });void finished.catch(reject);return ready;
 }
 assertLive():void{if(!this.#live)throw new SharedRelayError("version_lease_closed");}
 async close():Promise<void>{if(this.#live){this.#live=false;this.#release();}await this.#finished;}
}
