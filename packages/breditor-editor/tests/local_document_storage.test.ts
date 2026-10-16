import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {IDBFactory,IDBDatabase as FakeDatabase} from "fake-indexeddb";
import {RichLocalSessionStore} from "../../breditor-experimental-rich-content/src/persistence/local_session_store.js";
import {RichDocumentSessionStore} from "../../breditor-experimental-rich-content/src/persistence/document_session_store.js";
const explicit=JSON.stringify({format:"breditor/rich-document-session",formatVersion:1});
const natural=JSON.stringify({format:"breditor/rich-document-typing-session",formatVersion:1,checkpoint:JSON.parse(explicit)});
// Header-only fixtures prove storage routing/limits, not native schema or causal replay.
beforeEach(()=>{vi.stubGlobal("indexedDB",new IDBFactory());});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function replace(name:string,value:unknown):Promise<void>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{const tx=db.transaction("checkpoint","readwrite");tx.objectStore("checkpoint").put(value,"current:document-v1");await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
describe("separate local document storage",()=>{
 it("never overwrites the original current-string key, including later original saves",async()=>{
  const old=await RichLocalSessionStore.open("keys"),store=await RichDocumentSessionStore.open("keys",{richLanguage:3});
  try{await old.save("exact original bytes");expect(await store.load()).toBeNull();expect(await store.loadLegacy()).toBe("exact original bytes");await store.save(explicit);expect(await store.load()).toBe(explicit);expect(await old.load()).toBe("exact original bytes");await old.save("new original bytes");expect(await store.load()).toBe(explicit);expect(await store.loadLegacy()).toBe("new original bytes");}
  finally{old.close();store.close();}
 });
 it("retains exact explicit/natural payloads and rejects mismatched declared reopening",async()=>{
  for(const history of ["explicit","typing-v1"] as const){const name=`mode-${history}`,bytes=history==="typing-v1"?natural:explicit,store=await RichDocumentSessionStore.open(name,{richLanguage:2,history});await store.save(bytes);await store.flush();store.close();const reader=await RichDocumentSessionStore.open(name,{richLanguage:2,history}),wrongLanguage=await RichDocumentSessionStore.open(name,{richLanguage:3,history}),wrongHistory=await RichDocumentSessionStore.open(name,{richLanguage:2,history:history==="explicit"?"typing-v1":"explicit"});try{expect(await reader.load()).toBe(bytes);await expect(wrongLanguage.load()).rejects.toThrow("explicit language/history");await expect(wrongHistory.load()).rejects.toThrow("explicit language/history");}finally{reader.close();wrongLanguage.close();wrongHistory.close();}}
 });
 it("rejects malformed/newer records rather than returning null or falling back to old bytes",async()=>{
  const old=await RichLocalSessionStore.open("unknown"),store=await RichDocumentSessionStore.open("unknown",{richLanguage:1});await old.save("old bytes");
  const base={format:"breditor/local-document-checkpoint-record",formatVersion:1,history:"explicit",richLanguage:1,checkpointJson:explicit};
  try{for(const record of [null,"not a record",{...base,extra:true},{...base,formatVersion:2},{...base,checkpointJson:natural}]){await replace("unknown",record);await expect(store.load()).rejects.toThrow();expect(await old.load()).toBe("old bytes");}}
  finally{store.close();old.close();}
 });
 it("rejects wrong checkpoint families and budgets before queueing; original byte budgets stay unchanged",async()=>{
  const store=await RichDocumentSessionStore.open("limits",{richLanguage:1,maxBytes:200}),old=await RichLocalSessionStore.open("legacy-limit",3);
  try{for(const bytes of [natural,explicit.replace("document-session","local-session"),explicit.replace('"formatVersion":1','"formatVersion":2'),"[]","x".repeat(201)])expect(()=>store.save(bytes)).toThrow();await store.save(explicit);expect(await store.load()).toBe(explicit);expect(()=>old.save("🙂")).toThrow("byte budget");await old.save("abc");expect(await old.load()).toBe("abc");}
  finally{old.close();store.close();}
 });
 it("retains the previous transaction on failure and recovers its bounded queue on retry",async()=>{
  const store=await RichDocumentSessionStore.open("retry",{richLanguage:1});await store.save(explicit);const latest=JSON.stringify({...JSON.parse(explicit),revision:"new"}),transaction=FakeDatabase.prototype.transaction;
  vi.spyOn(FakeDatabase.prototype,"transaction").mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase["transaction"]>){const tx=transaction.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;});await expect(store.save(latest)).rejects.toThrow();vi.restoreAllMocks();
  const reader=await RichDocumentSessionStore.open("retry",{richLanguage:1});try{expect(await reader.load()).toBe(explicit);await store.save(latest);await store.flush();expect(await reader.load()).toBe(latest);}finally{reader.close();store.close();}
 });
 it("uses the same 64-write queue limit and closed-state behavior without losing accepted work",async()=>{
  const store=await RichDocumentSessionStore.open("queue",{richLanguage:1}),pending=[];for(let n=0;n<64;n++)pending.push(store.save(explicit));expect(()=>store.save(explicit)).toThrow("queue exceeds");await Promise.all(pending);expect(await store.load()).toBe(explicit);store.close();expect(()=>store.save(explicit)).toThrow("closed");await expect(store.load()).rejects.toThrow("closed");
  const old=await RichLocalSessionStore.open("old-queue"),writes=[];for(let n=0;n<64;n++)writes.push(old.save(String(n)));expect(()=>old.save("overflow")).toThrow("queue exceeds");await Promise.all(writes);expect(await old.load()).toBe("63");old.close();
 });
});
