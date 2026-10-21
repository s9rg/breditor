/** Actual IndexedDB commit/abort is observed before delaying its owner acknowledgement.
 * No guessed scheduling delay or private production hook establishes the precondition. */
import {IDBDatabase} from 'fake-indexeddb';
export function cleanupTransactionBarrier(database,outcome){
 const original=IDBDatabase.prototype.transaction;let armed=true,continueEvent,event;let reachedResolve;
 const reached=new Promise(resolve=>{reachedResolve=resolve;});
 IDBDatabase.prototype.transaction=function(...args){
  const tx=original.apply(this,args);if(!armed||this.name!==database||args[1]!=='readwrite')return tx;armed=false;
  for(const kind of ['complete','abort'])Object.defineProperty(tx,'on'+kind,{configurable:true,set(handler){tx.addEventListener(kind,actual=>{event=kind;continueEvent=()=>handler?.call(tx,actual);reachedResolve();});}});
  if(outcome==='abort')queueMicrotask(()=>tx.abort());return tx;
 };
 return{reached,event:()=>event,release(){if(!continueEvent)throw Error('The actual transaction has not reached its terminal event');const run=continueEvent;continueEvent=undefined;run();},restore(){IDBDatabase.prototype.transaction=original;}};
}
