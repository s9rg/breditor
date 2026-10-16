import {it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {insertSharedImageFiles} from "../../breditor-collaboration/src/insert_image_files.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
function setup(){
 let revision=0;const events:string[]=[];
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision)}),free:()=>{}}),dispatch:vi.fn(()=>{events.push("image action");revision++;return true;}),set_selection:()=>{revision++;return true;},receive_frame:vi.fn(()=>{events.push("remote publication");revision++;}),free:()=>{}};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner),file=new File(["fixture"],"image.png",{type:"image/png"});
 let finish!:(value:{asset:string;width:number;height:number})=>void;
 const store={ingest:vi.fn(()=>{events.push("ingest");return new Promise<{asset:string;width:number;height:number}>(resolve=>{finish=resolve;});})};
 return {core,raw,events,file,store,finish:()=>finish({asset:"sha256:fixture",width:1,height:1})};
}
it("image ingestion holds bounded remote publications until its original guarded action commits",async()=>{
 const t=setup(),files=[t.file],inserting=insertSharedImageFiles(t.core,t.store,files,{parent:null,before:null}),received=t.core.receiveFrame("remote");files.push(t.file);
 expect(t.core.pendingRemote().frames).toBe(1);expect(t.raw.receive_frame).not.toHaveBeenCalled();t.finish();await inserting;await received;
 expect(t.events).toEqual(["ingest","image action","remote publication"]);expect(t.store.ingest).toHaveBeenCalledOnce();expect(t.core.pendingRemote().frames).toBe(0);t.core.dispose();
});
it("a local publication still rejects stale insertion without discarding bytes or holding the remote queue",async()=>{
 const t=setup(),inserting=insertSharedImageFiles(t.core,t.store,[t.file],{parent:null,before:null});t.core.select(null);const remote=t.core.receiveFrame("remote");t.finish();
 await expect(inserting).rejects.toMatchObject({code:"stale_observation"});await remote;expect(t.raw.dispatch).not.toHaveBeenCalled();expect(t.events).toEqual(["ingest","remote publication"]);t.core.dispose();
});
it("known stale intent rejects before ingestion or a hold, and storage failure releases queued remotes",async()=>{
 const t=setup();await expect(insertSharedImageFiles(t.core,t.store,[t.file],{parent:null,before:null},"old")).rejects.toMatchObject({code:"stale_observation"});expect(t.store.ingest).not.toHaveBeenCalled();
 let fail!:(error:Error)=>void;const store={ingest:()=>new Promise<{asset:string;width:number;height:number}>((_resolve,reject)=>{fail=reject;})},inserting=insertSharedImageFiles(t.core,store,[t.file],{parent:null,before:null}),remote=t.core.receiveFrame("remote");fail(Error("Storage failed"));
 await expect(inserting).rejects.toThrow("Storage failed");await remote;expect(t.core.pendingRemote().frames).toBe(0);expect(t.raw.dispatch).not.toHaveBeenCalled();t.core.dispose();
});
