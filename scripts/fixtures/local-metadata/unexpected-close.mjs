import assert from 'node:assert/strict';
import {IDBFactory,forceCloseDatabase} from 'fake-indexeddb';

export async function openAndForceCloseJournal(store,name,openJournal=()=>store.open()){
 const open=IDBFactory.prototype.open;
 let connection,snapshot;
 IDBFactory.prototype.open=function(selected,...args){
  const request=open.call(this,selected,...args);
  if(selected===name)request.addEventListener('success',()=>{connection=request.result;},{once:true});
  return request;
 };
 try{snapshot=await openJournal();}
 finally{IDBFactory.prototype.open=open;}
 assert.ok(connection,'Expected the actual journal connection');
 const closed=new Promise(resolve=>connection.addEventListener('close',resolve,{once:true}));
 forceCloseDatabase(connection);
 await closed;
 return snapshot;
}
