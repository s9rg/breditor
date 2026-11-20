import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {IDBFactory,IDBDatabase as FakeDatabase} from "fake-indexeddb";
import {SharedWriterLease} from "../../breditor-collaboration/src/persistence/writer_lease.js";
import {SharedPersistentSession} from "../../breditor-collaboration/src/persistence/shared_session.js";
import {checkCheckpoint,openSessionDatabase,readCheckpoint,readSessionCheckpoint,writeSessionCheckpoint} from "../../breditor-collaboration/src/persistence/session_database.js";
import type {SharedHistoryPolicy,SharedRustOwner} from "../../breditor-collaboration/src/types.js";
const key=["room","101"] as const;
function owner(general=false,typing=false,language:1|2|3=1){
 let revision=1,steps=0;const model=language+10,journalVersion=language+11;
 const checkpoint=()=>{const journal={format:general?(typing?"breditor/rich-replica-general-typing-journal":"breditor/rich-replica-general-journal"):(typing?"breditor/rich-replica-typing-journal":"breditor/rich-replica-journal"),version:general||typing?1:journalVersion,document:"room",writer:"101",steps};return JSON.stringify(typing?{format:general?"breditor/shared-general-typing-session":"breditor/shared-typing-session",formatVersion:1,modelVersion:model,journalVersion,journal,joins:[]}:journal);};
 const publish=()=>{steps++;revision++;return true;};
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:model,journalVersion,...(language===1?{}:{richLanguageVersion:language}),...(language===3?{blockLayoutVersion:1}:{})}),observe:()=>{const json=JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(general?{rangeEditing:"general-v1"}:{}),...(typing?{historyGrouping:"typing-v1",historyStepCount:steps}:{})});return {view_json:()=>json,free:vi.fn()};},free:vi.fn(),
  general_range_version:()=>"1",enable_general_ranges:vi.fn(()=>{if(general)return false;general=true;revision++;return true;}),replace_general_range_text:vi.fn(publish),replace_general_range_plain_text:vi.fn(publish),replace_general_range_typing_text:vi.fn(publish),general_checkpoint:()=>{if(!general||typing)throw Error("Wrong general family");return checkpoint();},general_typing_checkpoint:()=>{if(!general||!typing)throw Error("Wrong general typing family");return checkpoint();},
  typing_history_version:()=>"1",enable_typing_history:vi.fn(()=>{if(typing)return false;typing=true;revision++;return true;}),close_typing_group:vi.fn(()=>false),insert_typing_text:vi.fn(publish),delete_typing_range:vi.fn(publish),typing_checkpoint:()=>{if(general||!typing)throw Error("Wrong typing family");return checkpoint();},checkpoint:()=>{if(general||typing)throw Error("Wrong original family");return checkpoint();},insert_plain_text:vi.fn(publish),undo_observed:vi.fn(()=>{publish();return false;}),block_layout_version:()=>"1",block_layout_state_json:()=>"{}",change_selection_layout:vi.fn(publish)};
 return {raw:raw as unknown as SharedRustOwner,methods:raw,checkpoint};
}
let released:ReturnType<typeof vi.fn>;
beforeEach(()=>{vi.stubGlobal("indexedDB",new IDBFactory());released=vi.fn(async()=>{});vi.stubGlobal("navigator",Object.assign(Object.create(globalThis.navigator),{locks:{request:(_n:string,_o:unknown,callback:(lock:object)=>Promise<void>)=>Promise.resolve().then(()=>callback({})).then(()=>{void released();})}}));vi.spyOn(SharedWriterLease,"acquire");});
// SharedWriterLease rejects look-alike objects (private-field brand checks, prototype methods captured at load), so
// sessions acquire a real lease over a stubbed, asynchronously granting Web Locks API; `released` fires when the lock is freed.
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function put(db:IDBDatabase,value:unknown){const tx=db.transaction("journals","readwrite");tx.objectStore("journals").put(value,[...key]);await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
describe("declared general session records",()=>{
 it("keeps exact general families separate across every language and history policy",async()=>{
  for(const language of [1,2,3] as const)for(const history of ["explicit","typing-v1"] as const){const db=await openSessionDatabase(`records-${language}-${history}`),a=owner(true,history==="typing-v1",language),json=a.checkpoint();
   await writeSessionCheckpoint(db,key,json,history,"general-v1",language);expect(await readSessionCheckpoint(db,key)).toEqual({json,history,rangeEditing:"general-v1",richLanguage:language});await expect(readCheckpoint(db,key)).rejects.toThrow();expect(()=>checkCheckpoint(json,"room","101",language,history,"general-v1")).not.toThrow();expect(()=>checkCheckpoint(json,"room","101",language,history)).toThrow();expect(()=>checkCheckpoint(json,"room","202",language,history,"general-v1")).toThrow();expect(()=>checkCheckpoint(json,"other","101",language,history,"general-v1")).toThrow();expect(()=>checkCheckpoint(json,"room","101",language,history==="explicit"?"typing-v1":"explicit","general-v1")).toThrow();db.close();}
 });
 it("rejects malformed record metadata without rewriting an opaque native save",async()=>{
  const db=await openSessionDatabase("unknown-general"),valid={format:"breditor/shared-general-checkpoint-record",formatVersion:1,history:"explicit",richLanguage:1,checkpointJson:owner(true).checkpoint()};
  for(const mutation of [{extra:true},{history:"automatic"},{richLanguage:4},{checkpointJson:4},{formatVersion:2}]){await put(db,{...valid,...mutation});await expect(readSessionCheckpoint(db,key)).rejects.toThrow("Unknown stored shared general");}db.close();
 });
 it("requires explicit matching range and language metadata before invoking a factory",async()=>{
  const db=await openSessionDatabase("guard-general"),a=owner(true,false,2);await writeSessionCheckpoint(db,key,a.checkpoint(),"explicit","general-v1",2);const create=vi.fn(),restore=vi.fn();
  for(const options of [{richLanguage:2 as const},{richLanguage:3 as const,rangeEditing:"general-v1" as const}])await expect(SharedPersistentSession.open({database:"guard-general",room:"room",writer:"101",create,restore,...options})).rejects.toThrow("explicit matching");
  expect(create).not.toHaveBeenCalled();expect(restore).not.toHaveBeenCalled();expect((await readSessionCheckpoint(db,key))?.json).toBe(a.checkpoint());expect(released).toHaveBeenCalledTimes(2);db.close();
 });
 it("never infers grouping from an explicitly general but naturally grouped record",async()=>{
  const db=await openSessionDatabase("guard-history"),a=owner(true,true);await writeSessionCheckpoint(db,key,a.checkpoint(),"typing-v1","general-v1");const restore=vi.fn();await expect(SharedPersistentSession.open({database:"guard-history",room:"room",writer:"101",rangeEditing:"general-v1",create:vi.fn(),restore})).rejects.toThrow("requires explicit typing-v1");expect(restore).not.toHaveBeenCalled();expect((await readSessionCheckpoint(db,key))?.json).toBe(a.checkpoint());db.close();
 });
 it.each([[false,false,"explicit"],[false,true,"typing-v1"],[false,false,"typing-v1"],[true,false,"typing-v1"],[true,true,"typing-v1"]] as const)("explicitly upgrades or restores general=%s grouped=%s to %s",async(general,grouped,history)=>{
  const db=await openSessionDatabase("upgrade-general"),before=owner(general,grouped),after=owner(general,grouped);await writeSessionCheckpoint(db,key,before.checkpoint(),grouped?"typing-v1":"explicit",general?"general-v1":"original");const create=vi.fn(),restore=vi.fn(()=>after.raw);
  const session=await SharedPersistentSession.open({database:"upgrade-general",room:"room",writer:"101",rangeEditing:"general-v1",history,create,restore});expect(session.recovered).toBe(true);expect(create).not.toHaveBeenCalled();if(general)expect(restore).toHaveBeenCalledWith(before.checkpoint(),grouped?"typing-v1":"explicit","general-v1");else expect(restore).toHaveBeenCalledWith(before.checkpoint(),grouped?"typing-v1":"explicit");
  expect((await readSessionCheckpoint(db,key))?.rangeEditing).toBe("general-v1");expect((await readSessionCheckpoint(db,key))?.history).toBe(history);const checkpoint=session.core.checkpointJson();expect(session.core.undo()).toBe(false);await session.flush();expect(session.core.checkpointJson()).not.toBe(checkpoint);expect((await readSessionCheckpoint(db,key))?.json).toBe(session.core.checkpointJson());await session.close();db.close();
 });
 it("keeps original sessions sealed and rejects a mismatched new-mode creator before saving",async()=>{
  const a=owner(),session=await SharedPersistentSession.open({database:"original",room:"room",writer:"101",create:()=>a.raw,restore:()=>a.raw});expect(()=>session.core.enableGeneralRanges()).toThrow("immutable");expect(a.methods.enable_general_ranges).not.toHaveBeenCalled();await session.close();
  const b=owner(true);await expect(SharedPersistentSession.open({database:"wrong-creator",room:"room",writer:"101",create:()=>b.raw,restore:()=>b.raw})).rejects.toThrow("Range policy");expect(b.methods.free).toHaveBeenCalledOnce();const db=await openSessionDatabase("wrong-creator");expect(await readSessionCheckpoint(db,key)).toBeNull();db.close();
 });
 it("missing native capability never upgrades a legacy value",async()=>{
  const db=await openSessionDatabase("old-module"),before=owner(),after=owner();await writeSessionCheckpoint(db,key,before.checkpoint(),"explicit");delete after.raw.general_range_version;await expect(SharedPersistentSession.open({database:"old-module",room:"room",writer:"101",rangeEditing:"general-v1",create:()=>after.raw,restore:()=>after.raw})).rejects.toThrow("matching native general-range");expect(await readCheckpoint(db,key)).toBe(before.checkpoint());expect(after.methods.free).toHaveBeenCalledOnce();db.close();
 });
 it.each(["explicit","typing-v1"] as const)("failed general upgrade retains the exact original %s value",async(history)=>{
  const db=await openSessionDatabase("failed-general"),before=owner(false,history==="typing-v1"),after=owner(false,history==="typing-v1");await writeSessionCheckpoint(db,key,before.checkpoint(),history);const original=FakeDatabase.prototype.transaction;
  vi.spyOn(FakeDatabase.prototype,"transaction").mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase["transaction"]>){const tx=original.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;});
  await expect(SharedPersistentSession.open({database:"failed-general",room:"room",writer:"101",rangeEditing:"general-v1",history,create:()=>after.raw,restore:()=>after.raw})).rejects.toThrow();expect(after.methods.free).toHaveBeenCalledOnce();expect(released).toHaveBeenCalled();vi.restoreAllMocks();expect(await readSessionCheckpoint(db,key)).toEqual({history,json:before.checkpoint()});db.close();
 });
 it.each(["explicit","typing-v1"] as const)("failed %s close retains its general family, writer and exact journal until retry",async(history:SharedHistoryPolicy)=>{
  const a=owner(),session=await SharedPersistentSession.open({database:"close-general",room:"room",writer:"101",history,rangeEditing:"general-v1",create:()=>a.raw,restore:()=>a.raw}),original=FakeDatabase.prototype.transaction;
  const spy=vi.spyOn(FakeDatabase.prototype,"transaction").mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase["transaction"]>){const tx=original.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;});
  session.core.type("keep");const exact=session.core.checkpointJson();await expect(session.close()).rejects.toThrow();expect(session.core.checkpointJson()).toBe(exact);expect(session.core.view().rangeEditing).toBe("general-v1");expect(a.methods.free).not.toHaveBeenCalled();expect(released).not.toHaveBeenCalled();expect(()=>session.core.type("late")).toThrow("retired");spy.mockRestore();await session.close();expect(a.methods.free).toHaveBeenCalledOnce();expect(released).toHaveBeenCalledOnce();const db=await openSessionDatabase("close-general");expect(await readSessionCheckpoint(db,key)).toEqual({history,json:exact,rangeEditing:"general-v1",richLanguage:1});db.close();
 });
 it("invalid range policy rejects before acquiring a writer or opening storage",async()=>{
  const acquire=vi.mocked(SharedWriterLease.acquire);await expect(SharedPersistentSession.open({database:"invalid",room:"room",writer:"101",rangeEditing:"auto" as "general-v1",create:vi.fn(),restore:vi.fn()})).rejects.toThrow("rangeEditing original or general-v1");expect(acquire).not.toHaveBeenCalled();
 });
});
