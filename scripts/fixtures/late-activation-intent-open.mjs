/** Exercise an actual queued IndexedDB open whose original caller stops waiting. */
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';

export async function assertActivationReopensAfterLateClose({database,createStore,create,busyCode,closedCode}) {
 const factory=indexedDB,stop=new AbortController(),store=createStore(stop.signal);
 const originalOpen=IDBFactory.prototype.open;
 let foreign,first,late,fresh;
 try {
  foreign=await new Promise((resolve,reject)=>{
   const request=factory.open(database,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('foreign');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  const deletion=factory.deleteDatabase(database);
  await new Promise(resolve=>{deletion.onblocked=resolve;});
  let requested;
  const atRequest=new Promise(resolve=>{requested=resolve;});
  IDBFactory.prototype.open=function(...args){
   const request=originalOpen.apply(this,args);
   if(args[0]===database){
    late=new Promise(resolve=>request.addEventListener('error',resolve,{once:true}));
    requested();
   }
   return request;
  };
  first=create(store);
  const rejected=assert.rejects(first,{code:closedCode});
  await atRequest;
  IDBFactory.prototype.open=originalOpen;
  stop.abort();
  await rejected;
  await assert.rejects(store.close(),{code:busyCode});

  const competing=createStore();
  try {await assert.rejects(create(competing),{code:busyCode});}
  finally {await competing.close();}

  const removed=new Promise((resolve,reject)=>{
   deletion.onsuccess=resolve;
   deletion.onerror=()=>reject(deletion.error);
  });
  foreign.close();
  foreign=undefined;
  await removed;
  await late;
  assert.equal((await factory.databases()).some(row=>row.name===database),false);
  fresh=createStore();
  const reopened=await create(fresh);
  assert.equal(reopened.state?.phase??reopened.phase,'prepared');
 } finally {
  IDBFactory.prototype.open=originalOpen;
  foreign?.close();
  await first?.catch(()=>{});
  await late;
  await fresh?.close();
  await store.close();
 }
}
