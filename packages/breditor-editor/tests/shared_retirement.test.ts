import {beforeEach,describe,expect,it,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
const storage=vi.hoisted(()=>({open:vi.fn(),read:vi.fn(),write:vi.fn(),acquire:vi.fn()}));
vi.mock("../../breditor-collaboration/src/persistence/session_database.js",async importOriginal=>({
 ...await importOriginal<object>(),openSessionDatabase:storage.open,readCheckpoint:storage.read,writeCheckpoint:storage.write
}));
vi.mock("../../breditor-collaboration/src/persistence/writer_lease.js",()=>({SharedWriterLease:{acquire:storage.acquire}}));
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
 const native=owner(),db={close:vi.fn(),onversionchange:null},lease={assertLive:vi.fn(),close:vi.fn(async()=>{})};
 storage.open.mockResolvedValue(db);storage.read.mockResolvedValue(null);storage.write.mockResolvedValue(undefined);storage.acquire.mockResolvedValue(lease);
 return {...native,db,lease,options:{database:"store",room:"room",writer:"101",create:()=>native.typed,restore:()=>native.typed}};
}
beforeEach(()=>{for(const fn of Object.values(storage))fn.mockReset();});
describe("shared writer retirement and durability",()=>{
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
