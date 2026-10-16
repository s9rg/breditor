import {it,expect,vi} from "vitest";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {insertSharedImageFiles} from "../../breditor-collaboration/src/insert_image_files.js";
function setup(capability=true){
 let revision=0,readOnly=false,policy:string|undefined;
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),...(readOnly?{readOnly:true}:{}),...(policy?{readOnlyRevision:policy}:{})}),free:()=>{}}),read_only_version:capability?()=>"1":undefined,set_read_only:capability?vi.fn((_o:unknown,value:boolean)=>{if(readOnly===value)return false;readOnly=value;policy=String(++revision);return true;}):undefined,dispatch:vi.fn(()=>{revision++;return true;}),insert_plain_text:vi.fn(),set_pending_formats:vi.fn(),undo_observed:vi.fn(),redo_observed:vi.fn(),set_selection:vi.fn(()=>{revision++;return true;}),navigate_grid:vi.fn(()=>JSON.stringify({kind:"unchanged"})),receive_frame:vi.fn(()=>{revision++;}),free:vi.fn()};
 return {raw,core:new SharedRichEditor(raw as unknown as SharedRustOwner)};
}
it("native read-only capability blocks every wrapper write but retains selection navigation and remotes",async()=>{
 const {raw,core}=setup();expect(core.supportsReadOnly()).toBe(true);core.setReadOnly(true);const locked=core.view();expect(locked.readOnly).toBe(true);
 for(const work of [()=>core.dispatch({commands:[]}),()=>core.type("X"),()=>core.setPendingFormats([]),()=>core.undo(),()=>core.redo()])expect(work).toThrow(expect.objectContaining({code:"read_only"}));
 expect(raw.dispatch).not.toHaveBeenCalled();expect(raw.insert_plain_text).not.toHaveBeenCalled();expect(raw.set_pending_formats).not.toHaveBeenCalled();expect(raw.undo_observed).not.toHaveBeenCalled();
 core.select(null);core.navigate("next");await core.receiveFrame("remote");expect(raw.receive_frame).toHaveBeenCalledOnce();expect(core.view().readOnly).toBe(true);expect(core.view().readOnlyRevision).toBe(locked.readOnlyRevision);core.dispose();
});
it("lock/unlock fences older revisions, identical policy is a no-op, and retirement remains distinct",()=>{
 const {raw,core}=setup(),initial=core.view().revision,events=vi.fn();core.subscribe(events);expect(core.setReadOnly(false)).toBe(false);expect(events).not.toHaveBeenCalled();core.setReadOnly(true);const locked=core.view();expect(core.setReadOnly(true)).toBe(false);expect(events).toHaveBeenCalledOnce();core.setReadOnly(false);
 expect(()=>core.dispatch({commands:[]},initial)).toThrow(expect.objectContaining({code:"stale_observation"}));expect(()=>core.setReadOnly(true,locked.revision)).toThrow(expect.objectContaining({code:"stale_observation"}));expect(raw.dispatch).not.toHaveBeenCalled();core.retire();expect(()=>core.setReadOnly(false)).toThrow(expect.objectContaining({code:"retired"}));core.dispose();
});
it("an older owner never pretends to enforce read-only and non-Boolean modes reject",()=>{
 const {core}=setup(false);expect(core.supportsReadOnly()).toBe(false);expect(()=>core.setReadOnly(true)).toThrow(expect.objectContaining({code:"read_only_unavailable"}));expect(()=>core.setReadOnly("yes" as unknown as boolean)).toThrow(TypeError);expect(core.view().revision).toBe("0");core.dispose();
});
it("shared image ingestion cannot survive lock/unlock and always releases queued remote work",async()=>{
 const {raw,core}=setup();let finish!:(value:{asset:string;width:number;height:number})=>void;
 const store={ingest:vi.fn(()=>new Promise<{asset:string;width:number;height:number}>(resolve=>{finish=resolve;}))};
 const inserting=insertSharedImageFiles(core,store,[new File(["fixture"],"image.png")],{parent:null,before:null});
 const received=core.receiveFrame("remote");expect(core.pendingRemote().frames).toBe(1);core.setReadOnly(true);core.setReadOnly(false);
 finish({asset:"asset",width:1,height:1});await expect(inserting).rejects.toThrow(expect.objectContaining({code:"stale_observation"}));await received;
 expect(store.ingest).toHaveBeenCalledOnce();expect(raw.dispatch).not.toHaveBeenCalled();expect(raw.receive_frame).toHaveBeenCalledOnce();expect(core.pendingRemote().frames).toBe(0);core.dispose();
});
