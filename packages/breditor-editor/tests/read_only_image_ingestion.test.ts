import {it,expect,vi} from "vitest";
import {insertImageFiles} from "../../breditor-experimental-rich-content/src/assets/insert_image_files.js";
import type {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import type {RichAssetStore} from "../../breditor-experimental-rich-content/src/assets/store.js";
function setup(){
 let policy:string|undefined,locked=false,revision="0",finish!:(value:{asset:string;width:number;height:number})=>void;
 const owner={view:()=>({readOnly:locked,readOnlyRevision:policy,revision}),execute:vi.fn()},store={ingest:vi.fn(()=>new Promise<{asset:string;width:number;height:number}>(resolve=>{finish=resolve;}))},file=new File(["fixture"],"image.png",{type:"image/png"});
 return {owner,editor:owner as unknown as RichDomEditor,store:store as unknown as RichAssetStore,ingest:store.ingest,file,lock:(value:boolean)=>{locked=value;policy=String(Number(policy??0)+1);},edit:()=>{revision="1";},finish:()=>finish({asset:"asset",width:1,height:1})};
}
it("read-only image requests reject before touching storage",async()=>{const t=setup();t.lock(true);await expect(insertImageFiles(t.editor,t.store,[t.file],{parent:{kind:"document"},before:null})).rejects.toThrow("read-only");expect(t.ingest).not.toHaveBeenCalled();});
it("an in-flight image cannot resurrect after a lock/unlock cycle; independent bytes remain retained",async()=>{const t=setup(),pending=insertImageFiles(t.editor,t.store,[t.file],{parent:{kind:"document"},before:null});t.lock(true);t.lock(false);t.finish();await expect(pending).rejects.toThrow("policy changed");expect(t.owner.execute).not.toHaveBeenCalled();expect(t.ingest).toHaveBeenCalledOnce();});
it("ordinary local edits retain the original stable-target contract and file lists are captured",async()=>{const t=setup(),files=[t.file],pending=insertImageFiles(t.editor,t.store,files,{parent:{kind:"document"},before:null});files.push(t.file);t.edit();t.finish();await pending;expect(t.ingest).toHaveBeenCalledOnce();expect(t.owner.execute).toHaveBeenCalledOnce();});
