/** Explicit Node storage/lock fixtures, never browser or cross-device fencing evidence. */
import assert from "node:assert/strict";
import {IDBFactory} from "fake-indexeddb";
import {ReviewFixtureImage} from "../review-assets/pixels.mjs";
export function environment(){
 const saved=new Map(),held=new Set();
 const values={indexedDB:new IDBFactory(),Image:ReviewFixtureImage,navigator:{locks:{request(name,options,run){if(typeof options==="function")run=options;return Promise.resolve().then(async()=>{if(held.has(name))return run(null);held.add(name);try{return await run({name});}finally{held.delete(name);}});}}}};
 for(const [name,value]of Object.entries(values)){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true});}
 return()=>{assert.equal(held.size,0,"Every borrowed recovery/native writer lock must be released");for(const [name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];};
}
