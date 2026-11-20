import {beforeEach,describe,expect,it,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
const storage=vi.hoisted(()=>({open:vi.fn(),read:vi.fn(),write:vi.fn()}));
vi.mock("../../breditor-collaboration/src/persistence/session_database.js",async importOriginal=>({
 ...await importOriginal<object>(),openSessionDatabase:storage.open,readSessionCheckpoint:storage.read,writeSessionCheckpoint:storage.write
}));
// The writer lease is not mocked: SharedWriterLease rejects look-alike objects (private-field brand checks,
// prototype methods captured at module load), so sessions acquire a real lease over a stubbed Web Locks API.
// `lease.close` records the moment the held origin-wide lock is actually released.
import {SharedPersistentSession} from "../../breditor-collaboration/src/persistence/shared_session.js";

function owner(){
 let revision=0,text="";
 const raw={
  descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),
  observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({text})}),free:vi.fn()}),
  insert_plain_text:vi.fn((_observation:unknown,input:string)=>{revision++;text+=input;return true;}),
  receive_frame:vi.fn(()=>{revision++;}),checkpoint:()=>JSON.stringify({format:"breditor/rich-replica-journal",version:12,document:"room",writer:"101",revision,text}),update_frame:()=>"frame",free:vi.fn()
 };
 return {raw,typed:raw as unknown as SharedRustOwner};
}
function setup(){
 const native=owner(),db={close:vi.fn(),onversionchange:null},lease={close:vi.fn()};
 // Like the browser, grant the lock asynchronously: acquire's callback reads the request's own promise.
 const locks={request:(_name:string,_options:unknown,callback:(lock:object)=>Promise<void>)=>Promise.resolve().then(()=>callback({})).then(()=>{lease.close();})};
 Object.defineProperty(globalThis.navigator,"locks",{value:locks,configurable:true});
 storage.open.mockResolvedValue(db);storage.read.mockResolvedValue(null);storage.write.mockResolvedValue(undefined);
 return {...native,db,lease,options:{database:"store",room:"room",writer:"101",create:()=>native.typed,restore:()=>native.typed}};
}
beforeEach(()=>{for(const fn of Object.values(storage))fn.mockReset();});
describe("shared writer retirement and durability",()=>{
 it("a database version change fences a still-pending native opening before any journal write",async()=>{
  const t=setup();let finish!:(raw:SharedRustOwner)=>void;const create=vi.fn(()=>new Promise<SharedRustOwner>(resolve=>{finish=resolve;}));let opened:SharedPersistentSession|undefined;
  const result=SharedPersistentSession.open({...t.options,create}).then(session=>{opened=session;return {error:undefined};},error=>({error}));await vi.waitFor(()=>expect(create).toHaveBeenCalledOnce());
  const changed=t.db.onversionchange as unknown as (()=>void)|null;if(changed)changed();finish(t.typed);const outcome=await result;
  try{expect(outcome.error).toMatchObject({code:"session_open_versionchange"});expect(storage.write).not.toHaveBeenCalled();expect(t.db.close).toHaveBeenCalled();expect(t.raw.free).toHaveBeenCalledOnce();expect(t.lease.close).toHaveBeenCalledOnce();}finally{await opened?.discardAndClose();}
 });
 it("hard break uses its guarded native capability or the identical old-ABI LF path",()=>{
  const first=owner(),legacy=new SharedRichEditor(first.typed);legacy.hardBreak();expect(first.raw.insert_plain_text).toHaveBeenLastCalledWith(expect.anything(),"\n");legacy.dispose();
  const second=owner(),hardBreak=vi.fn((observation:unknown)=>second.raw.insert_plain_text(observation,"\n"));Object.assign(second.raw,{insert_hard_break:hardBreak});const current=new SharedRichEditor(second.typed);current.hardBreak();expect(hardBreak).toHaveBeenCalledTimes(1);current.retire();expect(()=>current.hardBreak()).toThrow("retired");current.dispose();
 });
 it("retirement rejects queued and new publications without disposing checkpoint reads",async()=>{
  const t=owner(),core=new SharedRichEditor(t.typed),release=core.holdRemotes(),queued=core.receiveFrame("queued");const rejected=expect(queued).rejects.toMatchObject({code:"retired"});
  core.retire();core.retire();await rejected;release();expect(()=>core.type("late")).toThrow("retired");await expect(core.receiveFrame("late")).rejects.toMatchObject({code:"retired"});expect(t.raw.receive_frame).not.toHaveBeenCalled();expect(core.pendingRemote()).toEqual({frames:0,bytes:0});expect(core.checkpointJson()).toContain('"writer":"101"');expect(t.raw.free).not.toHaveBeenCalled();core.dispose();expect(t.raw.free).toHaveBeenCalledTimes(1);
 });
 it("invalid transferred queue options free their new owner, never a previously owned writer",()=>{
  const first=owner();expect(()=>new SharedRichEditor(first.typed,{maxPendingFrames:0})).toThrow("tighten defaults");expect(first.raw.free).toHaveBeenCalledTimes(1);
  const second=owner(),core=new SharedRichEditor(second.typed);expect(()=>new SharedRichEditor(second.typed,{maxPendingFrames:0})).toThrow("transferred once");expect(second.raw.free).not.toHaveBeenCalled();core.dispose();
 });
 it("close seals synchronously and releases neither native owner nor lease before a pending transaction completes",async()=>{
  const t=setup(),session=await SharedPersistentSession.open(t.options);let commit!:()=>void;storage.write.mockImplementationOnce(()=>new Promise<void>(resolve=>{commit=resolve;}));session.core.type("Committed ");
  const a=session.close(),b=session.close();expect(a).toBe(b);expect(()=>session.core.type("Too late")).toThrow("retired");expect(t.raw.free).not.toHaveBeenCalled();expect(t.lease.close).not.toHaveBeenCalled();commit();await a;expect(t.raw.free).toHaveBeenCalledTimes(1);expect(t.lease.close).toHaveBeenCalledTimes(1);expect(session.state().status).toBe("closed");await session.close();
 });
 it("failed close preserves its exact journal and lease for retry, without reopening authoring",async()=>{
  const t=setup(),session=await SharedPersistentSession.open(t.options);storage.write.mockRejectedValue(Error("Quota"));session.core.type("Retain this");const checkpoint=session.core.checkpointJson();await expect(session.close()).rejects.toThrow("Quota");expect(session.core.checkpointJson()).toBe(checkpoint);expect(t.raw.free).not.toHaveBeenCalled();expect(t.lease.close).not.toHaveBeenCalled();expect(()=>session.core.type("No new edits")).toThrow("retired");
  storage.write.mockResolvedValue(undefined);await session.close();expect(storage.write.mock.calls.at(-1)![2]).toBe(checkpoint);expect(t.lease.close).toHaveBeenCalledTimes(1);expect(t.raw.free).toHaveBeenCalledTimes(1);
 });
 it("explicit discard waits for an already-started transaction before releasing the identity",async()=>{
  const t=setup(),session=await SharedPersistentSession.open(t.options);let commit!:()=>void;storage.write.mockImplementationOnce(()=>new Promise<void>(resolve=>{commit=resolve;}));session.core.type("In flight");const discarded=session.discardAndClose();expect(t.raw.free).toHaveBeenCalledTimes(1);expect(t.db.close).toHaveBeenCalledTimes(1);expect(t.lease.close).not.toHaveBeenCalled();commit();await discarded;expect(t.lease.close).toHaveBeenCalledTimes(1);await session.discardAndClose();expect(t.lease.close).toHaveBeenCalledTimes(1);
 });
 it("database version change unblocks storage but retains an unsaved retired writer for explicit recovery",async()=>{
  const t=setup(),session=await SharedPersistentSession.open(t.options);storage.write.mockRejectedValue(Error("Quota"));session.core.type("Keep across upgrade");await expect(session.flush()).rejects.toThrow("Quota");const checkpoint=session.core.checkpointJson();
  (t.db.onversionchange as unknown as ()=>void)();expect(t.db.close).toHaveBeenCalledTimes(1);expect(session.state().status).toBe("failed");expect(session.core.checkpointJson()).toBe(checkpoint);expect(()=>session.core.type("Too late")).toThrow("retired");expect(t.raw.free).not.toHaveBeenCalled();expect(t.lease.close).not.toHaveBeenCalled();await session.discardAndClose();expect(t.lease.close).toHaveBeenCalledTimes(1);
 });
});
