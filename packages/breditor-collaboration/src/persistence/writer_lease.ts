import {SharedEditorError} from "../core.js";
/** Runtime construction admission: TypeScript private alone is erased. */
const actorLeaseConstructionKey=Object.freeze({});

/** Origin-wide exclusion for one causal writer. This is not a server authorization token. */
let checkNormal:(owner:SharedWriterLease,room:string,id:string)=>void;
let createEscrow:(owner:SharedWriterLease,room:string,id:string)=>SharedWriterLeaseEscrow;
let makeEscrow:(custodian:SharedWriterLease,room:string,id:string)=>SharedWriterLeaseEscrow;
let makeLoan:(custodian:SharedWriterLease,escrow:SharedWriterLeaseEscrow)=>SharedWriterLease;
let returnLoan:(escrow:SharedWriterLeaseEscrow,loan:SharedWriterLease)=>void;
let checkLoan:(escrow:SharedWriterLeaseEscrow,custodian:SharedWriterLease,loan:SharedWriterLease)=>void;
let promoteLoan:(escrow:SharedWriterLeaseEscrow,custodian:SharedWriterLease,loan:SharedWriterLease)=>void;
let checkEscrow:(owner:SharedWriterLeaseEscrow,room:string,id:string,mode:'idle'|'commit')=>void;
let borrowEscrow:(owner:SharedWriterLeaseEscrow,room:string,id:string)=>SharedWriterLease;
let commitEscrow:(owner:SharedWriterLeaseEscrow,room:string,id:string)=>void;
let checkEscrowClose:(owner:SharedWriterLeaseEscrow)=>void;
let closeEscrow:(owner:SharedWriterLeaseEscrow)=>Promise<void>;
/** Private actor resource custody, not document/server authority. Original
 * factories continue acquiring normal leases unless genuine custody is selected. */
export const createSharedWriterLeaseEscrow=(owner:SharedWriterLease,room:string,id:string):SharedWriterLeaseEscrow=>createEscrow(owner,room,id);
export const checkSharedWriterLeaseEscrow=(owner:SharedWriterLeaseEscrow,room:string,id:string,mode:'idle'|'commit'):void=>checkEscrow(owner,room,id,mode);
export const borrowSharedWriterLeaseEscrow=(owner:SharedWriterLeaseEscrow,room:string,id:string):SharedWriterLease=>borrowEscrow(owner,room,id);
export const commitSharedWriterLeaseEscrow=(owner:SharedWriterLeaseEscrow,room:string,id:string):void=>commitEscrow(owner,room,id);
export const checkSharedWriterLeaseEscrowClose=(owner:SharedWriterLeaseEscrow):void=>checkEscrowClose(owner);
export const closeSharedWriterLeaseEscrow=(owner:SharedWriterLeaseEscrow):Promise<void>=>closeEscrow(owner);
/** Pair creation pre-admits both actual handles before moving either owner. */
export const checkSharedWriterLeaseForEscrow=(owner:SharedWriterLease,room:string,id:string):void=>checkNormal(owner,room,id);
export class SharedWriterLease {
 #live=true;#moved=false;readonly #room:string;readonly #writer:string;#release:()=>void;#finished:Promise<void>;#loan:SharedWriterLeaseEscrow|undefined;
 private constructor(room:string,id:string,release:()=>void,finished:Promise<void>,key:object){if(key!==actorLeaseConstructionKey)throw new SharedEditorError('writer_lease_source','Use the actual acquired actor lease');this.#room=room;this.#writer=id;this.#release=release;this.#finished=finished;}
 static{
  const real=(owner:SharedWriterLease)=>{if(!owner||typeof owner!=='object'||!(#room in owner))throw new SharedEditorError('writer_lease_source','Use the actual acquired actor lease');};
  checkNormal=(owner,room,id)=>{real(owner);if(!owner.#live)throw new SharedEditorError('writer_lease_closed','This handle no longer owns its actor lease');if(owner.#room!==room||owner.#writer!==id)throw new SharedEditorError('writer_lease_identity','The actual actor binding differs');if(owner.#loan)throw new SharedEditorError('writer_lease_borrowed','A staged borrower cannot create another recovery custodian');};
  createEscrow=(owner,room,id)=>{checkNormal(owner,room,id);const custodian=new SharedWriterLease(owner.#room,owner.#writer,owner.#release,owner.#finished,actorLeaseConstructionKey),escrow=makeEscrow(custodian,room,id);owner.#moved=true;owner.#live=false;return escrow;};
  makeLoan=(custodian,escrow)=>{checkNormal(custodian,custodian.#room,custodian.#writer);const loan=new SharedWriterLease(custodian.#room,custodian.#writer,()=>returnLoan(escrow,loan),Promise.resolve(),actorLeaseConstructionKey);loan.#loan=escrow;return loan;};
  checkLoan=(escrow,custodian,loan)=>{checkNormal(custodian,custodian.#room,custodian.#writer);real(loan);if(!loan.#live||loan.#loan!==escrow||loan.#room!==custodian.#room||loan.#writer!==custodian.#writer)throw new SharedEditorError('writer_escrow_borrower','The actual staged borrower is no longer available');};
  promoteLoan=(escrow,custodian,loan)=>{checkLoan(escrow,custodian,loan);loan.#release=custodian.#release;loan.#finished=custodian.#finished;loan.#loan=undefined;custodian.#moved=true;custodian.#live=false;};
 }

 static async acquire(room:string,writer:string):Promise<SharedWriterLease>{
  if(!room||new TextEncoder().encode(room).length>200||!/^\d+$/.test(writer)||writer.length>20||BigInt(writer)<1n||BigInt(writer)>=18446744073709551615n||BigInt(writer).toString()!==writer)throw new SharedEditorError("writer_identity","Invalid room or canonical causal writer");
  if(!globalThis.navigator?.locks)throw new SharedEditorError("writer_locks_unavailable","Shared recovery requires the browser Web Locks API");
  let release!:()=>void,accept!:(value:SharedWriterLease)=>void,reject!:(reason:unknown)=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<SharedWriterLease>((resolve,fail)=>{accept=resolve;reject=fail;});
  // The lock is independent of the database name: another store cannot clone a live writer.
  const finished=navigator.locks.request(`breditor:shared-writer:${JSON.stringify([room,writer])}`,{mode:"exclusive",ifAvailable:true},async lock=>{
   if(!lock){reject(new SharedEditorError("writer_in_use","This shared writer is already active in another session"));return;}
   accept(new SharedWriterLease(room,writer,release,finished,actorLeaseConstructionKey));await held;
  });
  void finished.catch(reject);return ready;
 }
 assertLive():void{if(!this.#live)throw new SharedEditorError("writer_lease_closed","The shared writer lease is closed");}
 async close():Promise<void>{if(this.#moved)return;if(this.#live){this.#live=false;this.#release();}await this.#finished;}
}

const closeActualSharedWriterLease=SharedWriterLease.prototype.close;
/** Recovery retains the actual origin-wide lock while targets are staged.
 * Failed target Close returns its loan; only whole-room commit gives the target
 * final release authority. This object contains no persisted permission flag. */
export class SharedWriterLeaseEscrow{
 readonly #custodian:SharedWriterLease;readonly #room:string;readonly #id:string;
 #state:'held'|'committed'|'closed'='held';#loan:SharedWriterLease|undefined;
 private constructor(custodian:SharedWriterLease,room:string,id:string,key:object){if(key!==actorLeaseConstructionKey)throw new SharedEditorError('writer_escrow_source','Use actual recovery-owned actor custody');this.#custodian=custodian;this.#room=room;this.#id=id;}
 static{
  const real=(owner:SharedWriterLeaseEscrow)=>{if(!owner||typeof owner!=='object'||!(#custodian in owner))throw new SharedEditorError('writer_escrow_source','Use actual recovery-owned actor custody');};
  checkEscrow=(owner,room,id,mode)=>{real(owner);if(owner.#room!==room||owner.#id!==id)throw new SharedEditorError('writer_escrow_identity','The selected recovery actor differs');if(owner.#state!=='held')throw new SharedEditorError('writer_escrow_closed','Recovery no longer owns this actor');checkNormal(owner.#custodian,room,id);if(mode==='idle'){if(owner.#loan)throw new SharedEditorError('writer_escrow_in_use','A staged target still owns this actor loan');}else{if(!owner.#loan)throw new SharedEditorError('writer_escrow_borrower','No actual staged target owns this actor');checkLoan(owner,owner.#custodian,owner.#loan);}};
  makeEscrow=(custodian,room,id)=>new SharedWriterLeaseEscrow(custodian,room,id,actorLeaseConstructionKey);
  borrowEscrow=(owner,room,id)=>{checkEscrow(owner,room,id,'idle');const loan=makeLoan(owner.#custodian,owner);owner.#loan=loan;return loan;};
  returnLoan=(owner,loan)=>{real(owner);if(owner.#state!=='held'||owner.#loan!==loan)throw new SharedEditorError('writer_escrow_borrower','Only the actual current loan can return actor custody');owner.#loan=undefined;};
  commitEscrow=(owner,room,id)=>{checkEscrow(owner,room,id,'commit');promoteLoan(owner,owner.#custodian,owner.#loan!);owner.#loan=undefined;owner.#state='committed';};
  checkEscrowClose=owner=>{real(owner);if(owner.#state==='held'&&owner.#loan)throw new SharedEditorError('writer_escrow_in_use','Close the actual staged target before recovery custody');};
  closeEscrow=async owner=>{checkEscrowClose(owner);if(owner.#state==='committed')return;owner.#state='closed';await closeActualSharedWriterLease.call(owner.#custodian);};
 }
 borrow(room:string,id:string):SharedWriterLease{return borrowEscrow(this,room,id);}
 commit(room:string,id:string):void{commitEscrow(this,room,id);}
 close():Promise<void>{return closeEscrow(this);}
}
