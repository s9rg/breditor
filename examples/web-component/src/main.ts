import {createLocalProfile,openLocalEditor} from "@breditor/editor";
import {defineBreditorEditorElement,type BreditorEditorElement} from "./breditor_editor_element.js";

defineBreditorEditorElement({open:openLocalEditor});

const element=<T extends Element>(selector:string):T=>{
 const found=document.querySelector<T>(selector);
 if(found===null)throw new Error(`Missing ${selector}`);
 return found;
};
const slotA=element<HTMLElement>("#slot-a"),slotB=element<HTMLElement>("#slot-b"),parking=document.createElement("div");
const status=element<HTMLOutputElement>("#status"),changes=element<HTMLOutputElement>("#changes");
const readOnly=element<HTMLInputElement>("#read-only");

const demo={ready:0,changes:0,errors:[] as string[],editor:document.createElement("breditor-editor") as BreditorEditorElement};
demo.editor.label="Document";
declare global {interface Window {webComponentDemo:typeof demo}}
window.webComponentDemo=demo;

// Seed the first opening through the property. The attribute form is identical:
// <breditor-editor initial-document='{"format":"breditor/document",...}'>.
const profile=await createLocalProfile();
try{
 const {schema,schemaFingerprint}=profile.descriptor();
 demo.editor.initialDocument=JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"web-component-example"},children:[
  {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"intro"},children:[{kind:"text",text:"Hello from a custom element.",formats:[]}]},
 ]}});
}finally{profile.dispose();}

const show=():void=>{status.value=demo.editor.phase;changes.value=String(demo.changes);};
demo.editor.addEventListener("breditor-ready",()=>{demo.ready+=1;show();});
demo.editor.addEventListener("breditor-change",()=>{demo.changes+=1;show();});
demo.editor.addEventListener("breditor-error",event=>{demo.errors.push(String(event.detail.error));show();});

readOnly.addEventListener("change",()=>{demo.editor.readOnly=readOnly.checked;});
// A synchronous move keeps the same native owner, content, selection and history.
element<HTMLButtonElement>("#move").addEventListener("click",()=>{(demo.editor.parentElement===slotA?slotB:slotA).append(demo.editor);show();});
// Removal disposes the owner after a microtask; reattaching reopens from its exact checkpoint.
element<HTMLButtonElement>("#detach").addEventListener("click",()=>{parking.append(demo.editor);queueMicrotask(show);});
element<HTMLButtonElement>("#attach").addEventListener("click",()=>{slotA.append(demo.editor);show();});
// Insert the element only now, after its seed was set, so the first opening uses it.
slotA.append(demo.editor);show();
