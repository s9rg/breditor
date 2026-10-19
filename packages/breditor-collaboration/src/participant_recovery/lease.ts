import {recoveryFailure} from "./errors.js";
/** Cooperative origin-wide attempt/destination exclusion. Never a cross-device author grant. */
export class RecoveryLease {
 readonly #release:()=>void;readonly #finished:Promise<void>;#closed=false;
 private constructor(release:()=>void,finished:Promise<void>){this.#release=release;this.#finished=finished;}
 static async acquire(name:string):Promise<RecoveryLease>{
  if(!globalThis.navigator?.locks)throw recoveryFailure("recovery_policy");
  let release!:()=>void,accept!:(lease:RecoveryLease)=>void,fail!:(error:unknown)=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<RecoveryLease>((resolve,reject)=>{accept=resolve;fail=reject;});
  const finished=navigator.locks.request(`breditor:participant-recovery:${name}`,{mode:"exclusive",ifAvailable:true},async lock=>{
   await Promise.resolve();if(!lock){fail(recoveryFailure("recovery_in_use"));return;}accept(new RecoveryLease(release,finished));await held;
  });void finished.catch(()=>fail(recoveryFailure("recovery_in_use")));return ready;
 }
 async close():Promise<void>{if(!this.#closed){this.#closed=true;this.#release();}await this.#finished;}
}
