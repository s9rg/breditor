/** Private runtime rollback custody, never a persisted completion or authority grant.
 * Register before acquiring resources. Successful transfer forgets the cleanup;
 * failed cleanup retains its actual closure and can be retried by the parent.
 * All independent entries are attempted, and concurrent retries share one call.
 */
interface CleanupEntry {readonly cleanup:()=>Promise<void>;running:Promise<void>|undefined}
export interface RecoveryCleanupTicket {complete():void;rollback():Promise<void>}
export class RecoveryCleanupScope {
 readonly #failure:()=>Error;
 readonly #entries=new Set<CleanupEntry>();
 #draining:Promise<void>|undefined;
 constructor(failure:()=>Error){this.#failure=failure;}
 get pending():boolean{return this.#entries.size!==0;}
 retain(cleanup:()=>Promise<void>):RecoveryCleanupTicket {
  if(this.#draining||typeof cleanup!=="function")throw this.#failure();
  const entry:CleanupEntry={cleanup,running:undefined};this.#entries.add(entry);
  return Object.freeze({
   complete:()=>{if(entry.running||!this.#entries.has(entry))throw this.#failure();this.#entries.delete(entry);},
   rollback:()=>this.#run(entry).catch(()=>{throw this.#failure();}),
  });
 }
 #run(entry:CleanupEntry):Promise<void>{
  if(!this.#entries.has(entry))return Promise.resolve();if(entry.running)return entry.running;
  entry.running=Promise.resolve().then(entry.cleanup).then(()=>{this.#entries.delete(entry);}).finally(()=>{entry.running=undefined;});return entry.running;
 }
 drain():Promise<void>{
  if(this.#draining)return this.#draining;
  this.#draining=Promise.resolve().then(async()=>{
   const results=await Promise.allSettled([...this.#entries].reverse().map(entry=>this.#run(entry)));
   if(results.some(result=>result.status==="rejected"))throw this.#failure();
  }).finally(()=>{this.#draining=undefined;});return this.#draining;
 }
}
