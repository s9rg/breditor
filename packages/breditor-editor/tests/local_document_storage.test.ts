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
// Frozen rich V4: the stock fingerprint (`standardSchemaFingerprintV4`) and a second, distinct one.
const v4="sha256:7ac98189f850119abd83956f49b82fdbdcc91a77033781fbde090ba931fccc77",other="sha256:6667773591bde52ef650c498d908ccbe7e8d9303683be0ab7c55400db6dd52b4";
const v4Explicit=(fingerprint=v4)=>JSON.stringify({format:"breditor/rich-document-session",formatVersion:1,baseDocument:{format:"breditor/document",formatVersion:2,schema:{name:"breditor-editor/standard",version:4},schemaFingerprint:fingerprint}});
const v4Natural=(fingerprint=v4)=>JSON.stringify({format:"breditor/rich-document-typing-session",formatVersion:1,checkpoint:JSON.parse(v4Explicit(fingerprint))});
async function stored(name:string):Promise<unknown>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{const tx=db.transaction("checkpoint","readonly"),request=tx.objectStore("checkpoint").get("current:document-v1");return await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}}
/** The exact record admission of runtimes released before V4 was persistable (languages 1–3, record V1). */
function olderRuntimeAccepts(value:unknown,language:1|2|3,history:"explicit"|"typing-v1"):boolean{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;const record=value as Record<string,unknown>;
 return Object.keys(record).sort().join(",")==="checkpointJson,format,formatVersion,history,richLanguage"&&record["format"]==="breditor/local-document-checkpoint-record"&&record["formatVersion"]===1&&record["history"]===history&&record["richLanguage"]===language&&typeof record["checkpointJson"]==="string";
}
describe("frozen rich language 4 local document storage",()=>{
 it("accepts language 4 only bound to one exact schema fingerprint, and V1–V3 never bind one",async()=>{
  for(const options of [{richLanguage:4},{richLanguage:4,schemaFingerprint:""},{richLanguage:4,schemaFingerprint:v4.toUpperCase()},{richLanguage:4,schemaFingerprint:`${v4} `},{richLanguage:3,schemaFingerprint:v4},{richLanguage:5,schemaFingerprint:v4},{richLanguage:"4",schemaFingerprint:v4}])
   await expect(RichDocumentSessionStore.open("v4-options",options as never)).rejects.toThrow();
  const store=await RichDocumentSessionStore.open("v4-options",{richLanguage:4,schemaFingerprint:v4});
  try{expect(store.richLanguageVersion()).toBe(4);expect(store.schemaFingerprint()).toBe(v4);expect(store.historyPolicy()).toBe("explicit");}finally{store.close();}
  const old=await RichDocumentSessionStore.open("v3-options",{richLanguage:3});try{expect(old.schemaFingerprint()).toBeNull();}finally{old.close();}
 });
 it("round-trips exact V4 bytes in record V2 for both history families",async()=>{
  for(const history of ["explicit","typing-v1"] as const){
   const name=`v4-${history}`,bytes=history==="typing-v1"?v4Natural():v4Explicit(),store=await RichDocumentSessionStore.open(name,{richLanguage:4,schemaFingerprint:v4,history});
   await store.save(bytes);await store.flush();store.close();
   expect(await stored(name)).toEqual({format:"breditor/local-document-checkpoint-record",formatVersion:2,history,richLanguage:4,schemaFingerprint:v4,checkpointJson:bytes});
   const reader=await RichDocumentSessionStore.open(name,{richLanguage:4,schemaFingerprint:v4,history});try{expect(await reader.load()).toBe(bytes);}finally{reader.close();}
  }
  // Language 1–3 records keep record V1 byte-for-byte.
  const v3=await RichDocumentSessionStore.open("v3-record",{richLanguage:3});await v3.save(explicit);await v3.flush();v3.close();
  expect(await stored("v3-record")).toEqual({format:"breditor/local-document-checkpoint-record",formatVersion:1,history:"explicit",richLanguage:3,checkpointJson:explicit});
 });
 it("refuses checkpoints and records bound to another fingerprint, family or language",async()=>{
  const store=await RichDocumentSessionStore.open("v4-mismatch",{richLanguage:4,schemaFingerprint:v4}),natural=await RichDocumentSessionStore.open("v4-mismatch-natural",{richLanguage:4,schemaFingerprint:v4,history:"typing-v1"});
  try{
   // A checkpoint whose embedded base names another fingerprint (or none) is refused before queueing.
   for(const bytes of [v4Explicit(other),explicit,v4Natural()])expect(()=>store.save(bytes)).toThrow();
   for(const bytes of [v4Natural(other),v4Explicit(),JSON.stringify({...JSON.parse(v4Natural()),checkpoint:JSON.parse(explicit)})])expect(()=>natural.save(bytes)).toThrow();
   await store.save(v4Explicit());await store.flush();
  }finally{store.close();natural.close();}
  // The same record never opens under another fingerprint, history or language.
  for(const options of [{richLanguage:4,schemaFingerprint:other},{richLanguage:4,schemaFingerprint:v4,history:"typing-v1"},{richLanguage:3},{richLanguage:2},{richLanguage:1}] as const){
   const reader=await RichDocumentSessionStore.open("v4-mismatch",options);try{await expect(reader.load()).rejects.toThrow("does not match");}finally{reader.close();}
  }
  // Forged or older-shaped language 4 records are refused rather than read.
  const record={format:"breditor/local-document-checkpoint-record",formatVersion:2,history:"explicit",richLanguage:4,schemaFingerprint:v4,checkpointJson:v4Explicit()};
  const reader=await RichDocumentSessionStore.open("v4-mismatch",{richLanguage:4,schemaFingerprint:v4});
  try{
   for(const forged of [{...record,formatVersion:1},{...record,formatVersion:3},(({schemaFingerprint:_,...rest})=>({...rest,formatVersion:1}))(record),(({schemaFingerprint:_,...rest})=>rest)(record),{...record,schemaFingerprint:other},{...record,checkpointJson:v4Explicit(other)},{...record,richLanguage:3},{...record,extra:true}]){
    await replace("v4-mismatch",forged);await expect(reader.load()).rejects.toThrow();
   }
   // A language 3 record is never read as language 4.
   await replace("v4-mismatch",{format:"breditor/local-document-checkpoint-record",formatVersion:1,history:"explicit",richLanguage:3,checkpointJson:explicit});await expect(reader.load()).rejects.toThrow();
  }finally{reader.close();}
 });
 it("older runtimes refuse a saved V4 record instead of misreading it",async()=>{
  for(const history of ["explicit","typing-v1"] as const){
   const name=`v4-older-${history}`,store=await RichDocumentSessionStore.open(name,{richLanguage:4,schemaFingerprint:v4,history});
   await store.save(history==="typing-v1"?v4Natural():v4Explicit());await store.flush();store.close();
   const record=await stored(name);
   for(const language of [1,2,3] as const)expect(olderRuntimeAccepts(record,language,history)).toBe(false);
  }
  // The original string family is language-neutral: V4 bytes stay exact and only a matching native profile restores them.
  const original=await RichLocalSessionStore.open("v4-original");try{await original.save(v4Explicit());expect(await original.load()).toBe(v4Explicit());}finally{original.close();}
 });
});
