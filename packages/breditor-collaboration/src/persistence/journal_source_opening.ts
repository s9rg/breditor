/** SDK-private ownership between native construction and journal admission.
 * An actual returned source remains reachable from its genuine journal after a
 * rejected admission or cleanup. This registry grants no read or writer access.
 * Ordinary journal records, source factories and successful returns are unchanged. */
const openings=new WeakMap<object,JournalSourceOpening<object>>();
const fail=(code='journal_source_opening_closed')=>Object.assign(new Error('Finish the actual unreturned journal source cleanup before opening another source'),{code});
class JournalSourceOpening<T extends object>{
 readonly #journal:object;readonly #discard:(source:T)=>Promise<void>;
 #source:T|undefined;#running:Promise<void>|undefined;#cleanup:Promise<void>|undefined;
 #ready=false;#closing=false;#closed=false;#taken=false;#discarding=false;
 constructor(journal:object,discard:(source:T)=>Promise<void>){
  if(openings.has(journal))throw fail('journal_source_opening_busy');
  this.#journal=journal;this.#discard=discard;openings.set(journal,this as unknown as JournalSourceOpening<object>);Object.freeze(this);
 }
 run(open:()=>Promise<T>,admit:(source:T)=>void):Promise<T>{
  let accept!:()=>void,reject!:(error:unknown)=>void;
  const work=new Promise<void>((resolve,fail)=>{accept=resolve;reject=fail;});this.#running=work;
  // Preserve ordinary call-time constructor snapshots. Ownership and its real
  // running Promise are registered BEFORE the constructor executes callbacks.
  try{
   if(this.#closing)throw fail();const pending=open();
   void Promise.resolve(pending).then(source=>{
    this.#source=source;if(this.#closing)throw fail();
    const result:unknown=admit(source);
    if(result!==undefined){void Promise.resolve(result).catch(()=>{});throw fail('journal_source_admission_async');}
    if(this.#closing)throw fail();this.#ready=true;
   }).then(accept,reject);
  }catch(error){reject(error);}
  return work.finally(()=>{this.#running=undefined;}).then(()=>{
   if(this.#closing||!this.#ready||!this.#source)throw fail();
   // No callback, await or destructor can split the synchronous pointer move.
   const source=this.#source;this.#source=undefined;this.#taken=true;openings.delete(this.#journal);return source;
  });
 }
 ownsRelease():boolean{return this.#discarding;}
 close():Promise<void>{
  if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;
  // Publish cleanup before calling the canonical native destructor. A failed
  // release leaves this SAME source registered for the journal's next Close.
  this.#cleanup=Promise.resolve().then(async()=>{
   await this.#running?.catch(()=>{});
   if(this.#source){this.#discarding=true;try{await this.#discard(this.#source);}finally{this.#discarding=false;}this.#source=undefined;}
   openings.delete(this.#journal);this.#closed=true;
  }).finally(()=>{this.#cleanup=undefined;});return this.#cleanup;
 }
}
/** The caller already holds the real journal opening reservation. Construction
 * is retained here before any asynchronous native factory can run. */
export function openJournalSource<T extends object>(journal:object,open:()=>Promise<T>,admit:(source:T)=>void,discard:(source:T)=>Promise<void>):Promise<T>{
 let owner:JournalSourceOpening<T>;try{owner=new JournalSourceOpening(journal,discard);}catch(error){return Promise.reject(error);}
 return owner.run(open,admit).catch(async error=>{await owner.close();throw error;});
}
/** Cleanup only: no authority callback, source replay, save, ACK or deletion. */
export function closeUnreturnedJournalSource(journal:object):Promise<void>{return openings.get(journal)?.close()??Promise.resolve();}
/** Actual native cleanup is already awaited by the retained opening. Its
 * internal journal-release callback must not recursively await its own Close.
 * The outer failed opening/parent still closes the journal after source cleanup. */
export function journalSourceCleanupOwnsRelease(journal:object):boolean{return openings.get(journal)?.ownsRelease()??false;}
