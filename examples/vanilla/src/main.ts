import {createLocalProfile,openLocalEditor,type LocalEditor,type LocalInitial} from "@breditor/editor";

// A dependency-free host: one owner per host element, an AbortController per opening,
// a serial lane so a new opening never races the cleanup of a cancelled one, and an
// exact checkpoint carried across close/open so content and Undo/Redo survive.
const element=<T extends HTMLElement>(selector:string):T=>{
 const found=document.querySelector<T>(selector);
 if(found===null)throw new Error(`Missing ${selector}`);
 return found;
};
const host=element<HTMLElement>("#editor"),status=element<HTMLOutputElement>("#status");
const readOnly=element<HTMLInputElement>("#read-only"),openButton=element<HTMLButtonElement>("#open"),closeButton=element<HTMLButtonElement>("#close"),restartButton=element<HTMLButtonElement>("#restart");
const changes=element<HTMLOutputElement>("#changes");

const demo={ready:0,changes:0,errors:[] as string[],editor:null as LocalEditor|null,open,close};
declare global {interface Window {vanillaDemo:typeof demo}}
window.vanillaDemo=demo;

let controller:AbortController|null=null,checkpoint:string|null=null,lane:Promise<void>=Promise.resolve();

/** Seed document built for the exact compiled schema, so Rust admits it unchanged. */
async function seedDocument():Promise<string>{
 const profile=await createLocalProfile();
 try{
  const {schema,schemaFingerprint}=profile.descriptor();
  return JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"vanilla-example"},children:[
   {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"intro"},children:[{kind:"text",text:"Hello from the vanilla example.",formats:[]}]},
  ]}});
 }finally{profile.dispose();}
}
function report(error:unknown):void{demo.errors.push(String(error));console.error(error);}
function setStatus(value:string):void{
 status.value=value;
 openButton.disabled=value==="Ready"||value==="Starting";closeButton.disabled=value==="Closed"||value==="Failed";
}

function open():void{
 if(controller!==null||demo.editor!==null)return;
 const current=new AbortController();controller=current;setStatus("Starting");
 lane=lane.then(async()=>{
  try{
   const initial:LocalInitial=checkpoint!==null?{kind:"checkpoint",checkpointJson:checkpoint}:{kind:"document",documentJson:await seedDocument()};
   current.signal.throwIfAborted();
   const policy=readOnly.checked;
   const editor=await openLocalEditor({host,initial,label:"Document",readOnly:policy,signal:current.signal,
    onChange:()=>{demo.changes+=1;changes.value=String(demo.changes);},
    onError:report});
   if(current.signal.aborted){editor.dispose();return;}// Late resolution after close().
   if(readOnly.checked!==policy)editor.setReadOnly(readOnly.checked);// Policy changed during startup.
   demo.editor=editor;checkpoint=null;controller=null;demo.ready+=1;setStatus("Ready");
  }catch(error){
   if(current.signal.aborted)return;// Cancellation is not a failure.
   controller=null;setStatus("Failed");report(error);
  }
 });
}

function close():void{
 controller?.abort();controller=null;
 const editor=demo.editor;demo.editor=null;
 if(editor!==null){checkpoint=editor.checkpointJson();editor.dispose();}// dispose() is idempotent.
 setStatus("Closed");
}

readOnly.addEventListener("change",()=>{
 try{demo.editor?.setReadOnly(readOnly.checked);}catch(error){report(error);}
});
openButton.addEventListener("click",open);
closeButton.addEventListener("click",close);
// Close and reopen in one task: the pending or live owner is cancelled first, then the
// new opening waits on the lane until the old one has released the host.
restartButton.addEventListener("click",()=>{close();open();});
// Leaving the page is a teardown boundary too; persist checkpointJson() here if needed.
addEventListener("pagehide",close);
open();
