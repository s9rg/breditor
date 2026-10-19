/** Synthetic storage guards and local-Blob-only decoding. No browser/platform claim is made. */
import {IDBDatabase,IDBObjectStore} from "fake-indexeddb";
export async function withoutInfrastructure(run,counts){
 const saved=new Map(),deny=()=>{counts.forbiddenCalls++;throw Error("PRIVATE_UNEXPECTED_INFRASTRUCTURE");},fetchLocal=globalThis.fetch,methods=[];
 for(const[prototype,names]of [[IDBDatabase.prototype,["transaction"]],[IDBObjectStore.prototype,["add","put","delete","clear"]]])for(const name of names){methods.push([prototype,name,prototype[name]]);prototype[name]=deny;}
 for(const[name,value]of Object.entries({indexedDB:new Proxy({}, {get:deny}),navigator:{locks:{request:deny}},fetch:(url,...rest)=>{if(typeof url==="string"&&url.startsWith("blob:")){counts.localBlobReads++;return fetchLocal(url,...rest);}return deny();},WebSocket:class{constructor(){deny();}}})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}
 try{return await run();}finally{for(const[prototype,name,value]of methods)prototype[name]=value;for(const[name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}
}
