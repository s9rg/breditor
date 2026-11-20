import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {IDBFactory,IDBDatabase as FakeDatabase} from "fake-indexeddb";
import {SharedWriterLease} from "../../breditor-collaboration/src/persistence/writer_lease.js";
import {SharedPersistentSession} from "../../breditor-collaboration/src/persistence/shared_session.js";
import {checkCheckpoint,checkDocumentCheckpoint,openSessionDatabase,readCheckpoint,readSessionCheckpoint,readDocumentSessionCheckpoint,writeCheckpoint,writeDocumentSessionCheckpoint} from "../../breditor-collaboration/src/persistence/session_database.js";
import type {SharedHistoryPolicy} from "../../breditor-collaboration/src/types.js";
const key=["room","303"] as const;
// Headers test storage identity, not native causal admission. The real-Wasm probe proves replay.
function journal(history:SharedHistoryPolicy="explicit",language:1|2|3=1):string{
 const header={format:history==="typing-v1"?"breditor/rich-replica-document-typing-journal":"breditor/rich-replica-document-journal",version:1,document:"room",writer:"303"};
 return JSON.stringify(history==="typing-v1"?{format:"breditor/shared-document-typing-session",formatVersion:1,modelVersion:language===3?13:language===2?12:11,journalVersion:language===3?14:language===2?13:12,journal:header}:header);
}
async function put(db:IDBDatabase,value:unknown):Promise<void>{const tx=db.transaction("journals","readwrite");tx.objectStore("journals").put(value,[...key]);await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
let release:ReturnType<typeof vi.fn>;
beforeEach(()=>{vi.stubGlobal("indexedDB",new IDBFactory());release=vi.fn(async()=>{});vi.spyOn(SharedWriterLease,"acquire").mockResolvedValue({assertLive:()=>{},close:release} as unknown as SharedWriterLease);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("declared document-family durable records",()=>{
 it("keeps a separate closed record for every language/history, refused by original readers",async()=>{
  const db=await openSessionDatabase("records");
  try{for(const language of [1,2,3] as const)for(const history of ["explicit","typing-v1"] as const){const bytes=journal(history,language);await writeDocumentSessionCheckpoint(db,key,bytes,history,language);expect(await readDocumentSessionCheckpoint(db,key)).toEqual({json:bytes,history,richLanguage:language,rangeEditing:"general-v1",selectionEditing:"document-v1"});await expect(readSessionCheckpoint(db,key)).rejects.toThrow("Unknown stored");await expect(readCheckpoint(db,key)).rejects.toThrow();expect(()=>checkCheckpoint(bytes,...key,language,history,"general-v1")).toThrow("policy");}}
  finally{db.close();}
 });
 it("does not sniff a document journal hidden in a legacy string or infer unknown record variants",async()=>{
  const db=await openSessionDatabase("closed"),bytes=journal();
  try{
   await writeCheckpoint(db,key,bytes);expect(await readDocumentSessionCheckpoint(db,key)).toEqual({history:"explicit",json:bytes});
   const base={format:"breditor/shared-document-checkpoint-record",formatVersion:1,history:"explicit",richLanguage:1,checkpointJson:bytes};
   for(const value of [{...base,extra:true},{...base,formatVersion:2},{...base,history:"auto"},{...base,richLanguage:5},{...base,format:"breditor/shared-future-checkpoint-record"}]){await put(db,value);await expect(readDocumentSessionCheckpoint(db,key)).rejects.toThrow("Unknown stored");}
  }finally{db.close();}
 });
 it("rejects wrong identity/family/history/model before starting a write transaction",async()=>{
  const db=await openSessionDatabase("identity"),transaction=vi.spyOn(db,"transaction");
  try{
   for(const bytes of [journal().replace('"303"','"404"'),journal().replace('"room"','"other"'),journal().replace("document-journal","general-journal"),journal("typing-v1"),"[]","null"]){await expect(writeDocumentSessionCheckpoint(db,key,bytes,"explicit")).rejects.toThrow();}
   expect(()=>checkDocumentCheckpoint(journal("typing-v1",2),...key,1,"typing-v1")).toThrow("policy");
   expect(()=>checkDocumentCheckpoint(journal(),...key,5 as 1)).toThrow("policy");
   expect(transaction).not.toHaveBeenCalled();
  }finally{transaction.mockRestore();db.close();}
 });
 it("an aborted document upgrade retains the byte-identical previous legacy value",async()=>{
  const db=await openSessionDatabase("atomic"),old="opaque original native journal";await writeCheckpoint(db,key,old);
  const transaction=FakeDatabase.prototype.transaction;vi.spyOn(FakeDatabase.prototype,"transaction").mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase["transaction"]>){const tx=transaction.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;});
  await expect(writeDocumentSessionCheckpoint(db,key,journal(),"explicit")).rejects.toThrow();vi.restoreAllMocks();expect(await readCheckpoint(db,key)).toBe(old);db.close();
 });
 it("invalid document policies reject before a lease or any native factory",async()=>{
  const create=vi.fn(),restore=vi.fn(),restoreDocument=vi.fn(),options={database:"invalid",room:"room",writer:"303",create,restore,restoreDocument};
  await expect(SharedPersistentSession.openDocument({...options,rangeEditing:"original"} as never)).rejects.toThrow("Document sessions require");
  await expect(SharedPersistentSession.openDocument({...options,restoreDocument:undefined} as never)).rejects.toThrow("Document sessions require");
  await expect(SharedPersistentSession.open({...options,editor:{selectionEditing:"document-v1"}} as never)).rejects.toThrow("must match");
  expect(SharedWriterLease.acquire).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();expect(restore).not.toHaveBeenCalled();expect(restoreDocument).not.toHaveBeenCalled();
 });
 it("default reopening and natural-history downgrades fail before restore and preserve the declared record",async()=>{
  const db=await openSessionDatabase("reopen"),bytes=journal("typing-v1");await writeDocumentSessionCheckpoint(db,key,bytes,"typing-v1");const before=await readDocumentSessionCheckpoint(db,key),create=vi.fn(),restore=vi.fn(),restoreDocument=vi.fn(),options={database:"reopen",room:"room",writer:"303",create,restore,restoreDocument};
  try{await expect(SharedPersistentSession.open(options)).rejects.toThrow("Unknown stored");await expect(SharedPersistentSession.openDocument(options)).rejects.toThrow("requires explicit typing-v1");expect(await readDocumentSessionCheckpoint(db,key)).toEqual(before);expect(create).not.toHaveBeenCalled();expect(restore).not.toHaveBeenCalled();expect(restoreDocument).not.toHaveBeenCalled();expect(release).toHaveBeenCalledTimes(2);}
  finally{db.close();}
 });
 it("document replay rejection never falls back to old/general recovery or overwrites the saved record",async()=>{
  const db=await openSessionDatabase("native"),bytes=journal();await writeDocumentSessionCheckpoint(db,key,bytes,"explicit");const before=await readDocumentSessionCheckpoint(db,key),create=vi.fn(),restore=vi.fn(),restoreDocument=vi.fn(()=>{throw Error("Native exact replay refused");});
  try{await expect(SharedPersistentSession.openDocument({database:"native",room:"room",writer:"303",create,restore,restoreDocument})).rejects.toThrow("Native exact replay refused");expect(restoreDocument).toHaveBeenCalledWith(bytes,"explicit");expect(create).not.toHaveBeenCalled();expect(restore).not.toHaveBeenCalled();expect(await readDocumentSessionCheckpoint(db,key)).toEqual(before);expect(release).toHaveBeenCalledOnce();}
  finally{db.close();}
 });
 it("a legacy-looking record containing new-family bytes cannot bypass its declared old restore",async()=>{
  const db=await openSessionDatabase("no-sniff"),bytes=journal();await writeCheckpoint(db,key,bytes);const create=vi.fn(),restore=vi.fn(),restoreDocument=vi.fn();
  try{await expect(SharedPersistentSession.openDocument({database:"no-sniff",room:"room",writer:"303",create,restore,restoreDocument})).rejects.toThrow("policy");expect(await readCheckpoint(db,key)).toBe(bytes);expect(create).not.toHaveBeenCalled();expect(restore).not.toHaveBeenCalled();expect(restoreDocument).not.toHaveBeenCalled();}
  finally{db.close();}
 });
});
