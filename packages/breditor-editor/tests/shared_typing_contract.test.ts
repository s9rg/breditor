import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {IDBFactory,IDBDatabase as FakeDatabase} from "fake-indexeddb";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {SharedWriterLease} from "../../breditor-collaboration/src/persistence/writer_lease.js";
import {SharedPersistentSession} from "../../breditor-collaboration/src/persistence/shared_session.js";
import {checkCheckpoint,openSessionDatabase,readCheckpoint,readSessionCheckpoint,writeCheckpoint,writeSessionCheckpoint} from "../../breditor-collaboration/src/persistence/session_database.js";
import {restoreSharedTypingEditor} from "../../breditor-collaboration/src/profile.js";
import {SharedRelaySync} from "../../breditor-collaboration/src/relay/sync.js";
import type {SharedRustOwner,SharedView} from "../../breditor-collaboration/src/types.js";

// Only native publication is stubbed here. Storage transactions and the session coordinator are real.
function owner(grouped=false){
 let revision=1,typing=grouped,steps=0;
 const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(typing?{historyGrouping:"typing-v1",historyStepCount:steps}:{})}) as SharedView;
 const checkpoint=()=>JSON.stringify(typing?{format:"breditor/shared-typing-session",formatVersion:1,modelVersion:11,journalVersion:12,journal:{format:"breditor/rich-replica-typing-journal",version:1,document:"room",writer:"101"},steps}:{format:"breditor/rich-replica-journal",version:12,document:"room",writer:"101",steps});
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>{const json=JSON.stringify(view());return {view_json:()=>json,free:vi.fn()};},free:vi.fn(),typing_history_version:()=>"1",enable_typing_history:vi.fn(()=>{if(typing)return false;typing=true;revision++;return true;}),close_typing_group:vi.fn(()=>{revision++;return true;}),insert_typing_text:vi.fn(()=>{steps++;revision++;return true;}),delete_typing_range:vi.fn(()=>true),typing_checkpoint:checkpoint,checkpoint:vi.fn(()=>{if(typing)throw Error("Original factory cannot flatten grouped history");return checkpoint();}),undo_observed:vi.fn(()=>{steps++;revision++;return false;})};
 return {raw:raw as unknown as SharedRustOwner,checkpoint,methods:raw};
}
const key=["room","101"] as const;
let released:ReturnType<typeof vi.fn>;
beforeEach(()=>{vi.stubGlobal("indexedDB",new IDBFactory());released=vi.fn(async()=>{});vi.spyOn(SharedWriterLease,"acquire").mockResolvedValue({assertLive:()=>{},close:released} as unknown as SharedWriterLease);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("shared native history facade",()=>{
 it("relay admission selects the native owner's declared history family without weakening writer checks",()=>{
  for(const grouped of [false,true]){
   const a=owner(grouped);Object.assign(a.raw,{writer_groups:()=>"unused",writer_clock:()=>JSON.stringify({writer:"101",through:"0",prefixDigest:`sha256:${"0".repeat(64)}`})});const core=new SharedRichEditor(a.raw),getToken=vi.fn();
   const identity={endpoint:"ws://127.0.0.1:49786",principal:"alice",room:"room",writer:"101",credential:"a".repeat(64)};
   expect(()=>new SharedRelaySync(core,{identity:{...identity,writer:"202"},getToken,autoConnect:false})).toThrow("leased room/writer/model/history");
   const sync=new SharedRelaySync(core,{identity,getToken,autoConnect:false});expect(sync.state().localThrough).toBe("0");expect(getToken).not.toHaveBeenCalled();sync.dispose();core.dispose();
  }
 });
 it("requires the exact complete capability and never calls a legacy fallback",()=>{
  const old=owner();delete old.raw.typing_history_version;const core=new SharedRichEditor(old.raw),before=core.checkpointJson();
  expect(core.supportsTypingHistory()).toBe(false);expect(()=>core.enableTypingHistory()).toThrow("matching native shared typing-history");expect(()=>core.typeUser("A","1")).toThrow("matching native shared typing-history");expect(core.checkpointJson()).toBe(before);core.dispose();
  const fallback=vi.fn();expect(()=>restoreSharedTypingEditor({restore:fallback} as never,"room","grouped")).toThrow("matching native shared typing-history recovery");expect(fallback).not.toHaveBeenCalled();
 });
 it("guards revisions before payload publication, seals default policy and publishes false-result history changes",()=>{
  const a=owner(),core=new SharedRichEditor(a.raw),listener=vi.fn();core.subscribe(listener);core.enableTypingHistory();const old=core.view().revision;core.closeTypingGroup();expect(()=>core.typeUser("A","bad",old)).toThrow("older shared publication");expect(a.methods.insert_typing_text).not.toHaveBeenCalled();
  expect(core.undo()).toBe(false);expect(listener).toHaveBeenCalledTimes(3);expect(JSON.parse(core.checkpointJson()).steps).toBe(1);core.dispose();
  const b=owner(),explicit=new SharedRichEditor(b.raw);explicit.sealHistoryPolicy("explicit");expect(()=>explicit.enableTypingHistory()).toThrow("immutable");expect(b.methods.enable_typing_history).not.toHaveBeenCalled();explicit.dispose();
 });
});

describe("declared exact durable shared history",()=>{
 it("retains legacy string bytes and rejects grouped records through the old storage reader",async()=>{
  const db=await openSessionDatabase("records"),old=owner(),grouped=owner(true);await writeSessionCheckpoint(db,key,old.checkpoint(),"explicit");expect(await readCheckpoint(db,key)).toBe(old.checkpoint());expect(await readSessionCheckpoint(db,key)).toEqual({history:"explicit",json:old.checkpoint()});
  await writeSessionCheckpoint(db,key,grouped.checkpoint(),"typing-v1");expect(await readSessionCheckpoint(db,key)).toEqual({history:"typing-v1",json:grouped.checkpoint()});await expect(readCheckpoint(db,key)).rejects.toThrow();db.close();
 });
 it("does not infer or overwrite unknown stored records",async()=>{
  const db=await openSessionDatabase("unknown"),tx=db.transaction("journals","readwrite");tx.objectStore("journals").put({format:"breditor/shared-typing-checkpoint-record",formatVersion:1,checkpointJson:owner(true).checkpoint(),extra:true},[...key]);await new Promise<void>(r=>{tx.oncomplete=()=>r();});
  await expect(readSessionCheckpoint(db,key)).rejects.toThrow("Unknown stored");db.close();
 });
 it("requires explicitly paired journal and model families",()=>{
  const old=owner().checkpoint(),grouped=owner(true).checkpoint();checkCheckpoint(old,"room","101");checkCheckpoint(grouped,"room","101",1,"typing-v1");
  for(const [json,language,history]of [[old,1,"typing-v1"],[grouped,1,"explicit"],[grouped,2,"typing-v1"]] as const)expect(()=>checkCheckpoint(json,"room","101",language,history)).toThrow("history");
 });
 it("atomically upgrades an explicitly opted-in legacy journal and persists false Undo publications",async()=>{
  const db=await openSessionDatabase("upgrade"),old=owner();await writeCheckpoint(db,key,old.checkpoint());const restored=owner(),restore=vi.fn(()=>restored.raw),create=vi.fn();
  const session=await SharedPersistentSession.open({database:"upgrade",room:"room",writer:"101",history:"typing-v1",create,restore});expect(restore).toHaveBeenCalledWith(old.checkpoint(),"explicit");expect(create).not.toHaveBeenCalled();expect(session.recovered).toBe(true);expect((await readSessionCheckpoint(db,key))?.history).toBe("typing-v1");
  const before=session.core.checkpointJson();expect(session.core.undo()).toBe(false);await session.flush();expect((await readSessionCheckpoint(db,key))?.json).toBe(session.core.checkpointJson());expect(session.core.checkpointJson()).not.toBe(before);await session.close();db.close();
 });
 it("default opening rejects a grouped record before restore and leaves it recoverable",async()=>{
  const db=await openSessionDatabase("reopen"),a=owner(true);await writeSessionCheckpoint(db,key,a.checkpoint(),"typing-v1");const restore=vi.fn(()=>owner(true).raw),create=vi.fn();
  await expect(SharedPersistentSession.open({database:"reopen",room:"room",writer:"101",create,restore})).rejects.toThrow("requires explicit typing-v1");expect(restore).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();expect((await readSessionCheckpoint(db,key))?.json).toBe(a.checkpoint());expect(released).toHaveBeenCalledOnce();
  const session=await SharedPersistentSession.open({database:"reopen",room:"room",writer:"101",history:"typing-v1",create,restore});expect(restore).toHaveBeenCalledWith(a.checkpoint(),"typing-v1");await session.close();db.close();
 });
 it("failed atomic upgrade keeps the original durable journal and releases its unannounced owner",async()=>{
  const db=await openSessionDatabase("failed-upgrade"),old=owner(),a=owner();await writeCheckpoint(db,key,old.checkpoint());
  const original=FakeDatabase.prototype.transaction;vi.spyOn(FakeDatabase.prototype,"transaction").mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase["transaction"]>){const tx=original.apply(this,args);if(args[1]==="readwrite")queueMicrotask(()=>tx.abort());return tx;});
  await expect(SharedPersistentSession.open({database:"failed-upgrade",room:"room",writer:"101",history:"typing-v1",create:()=>a.raw,restore:()=>a.raw})).rejects.toThrow();expect(a.methods.free).toHaveBeenCalledOnce();expect(released).toHaveBeenCalled();vi.restoreAllMocks();expect(await readCheckpoint(db,key)).toBe(old.checkpoint());db.close();
 });
});
