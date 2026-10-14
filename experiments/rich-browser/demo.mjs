// Interactive sample using the actual opt-in package and Rust owner, not a mock editor.
import init,* as wasm from "/wasm.js";
import {compileRichProfile,mountRichEditor,RichAssetStore,RichLocalSessionStore,insertImageFiles} from "/rich.js";
await init();
const profile=compileRichProfile(wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-demo",version:1},extensions:[]}));
const binding=profile.descriptor(),canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const original=await(await fetch("/root.json")).json();
const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(original)}));
const paragraph=(block,text)=>({kind:"paragraph",block,text,formatsJson:"[]"});
core.execute({kind:"insertBlocks",data:{position:{parent:{kind:"document"},before:"table-block"},blocks:[{kind:"heading",block:"demo-heading",level:2,text:"One Rust document. Rich content.",formatsJson:"[]"},paragraph("demo-intro","Type here, or edit any table cell and image caption. Every content action uses the Rust owner and exact local history.")]}});
core.execute({kind:"insertBlocks",data:{position:{parent:{kind:"document"},before:null},blocks:[paragraph("demo-footer","Try selecting cells, merging, splitting, resizing, or changing the image metadata. Undo and Redo retain the content and your logical selection.")]}});
core.execute({kind:"insertTableRow",data:{table:"t",before:null,row:{block:"demo-row2",id:"r2",cells:[{block:"demo-cell2",column:"c",header:false,body:[paragraph("demo-p2","Keep independent source-cell content.")]}]}}});
core.execute({kind:"insertTableColumn",data:{table:"t",before:null,column:{id:"c2",width:300},cells:[{row:"r",cell:{block:"demo-cell12",column:"c2",header:false,body:[{kind:"heading",block:"demo-p12",level:3,text:"Rich cells",formatsJson:"[]"},paragraph("demo-extra","Headings, lists, text and images use the same AST.")]}},{row:"r2",cell:{block:"demo-cell22",column:"c2",header:false,body:[paragraph("demo-p22","Select cell + Shift-select to choose a rectangle.")]}}]}});
core.execute({kind:"setImageCaption",data:{image:"image",caption:{block:"demo-caption",text:"This caption is ordinary editable rich text.",formatsJson:"[]"}}});
core.execute({kind:"resizeImage",data:{image:"image",size:{width:340,height:150}}});
core.execute({kind:"resizeTableColumn",data:{table:"t",column:"c",width:380}});
const assets=new Map();
for(const [asset,color] of [["asset","#285f91"],["alternate-asset","#398a79"]]){
 const canvas=document.createElement("canvas");canvas.width=680;canvas.height=300;const paint=canvas.getContext("2d");
 paint.fillStyle=color;paint.fillRect(0,0,680,300);paint.fillStyle="#ffffff";paint.font="bold 42px system-ui";paint.fillText("breditor",38,78);paint.font="25px system-ui";paint.fillText("Rust core · one document",38,133);
 for(const [i,label] of ["Tables","Images","Rich text"].entries()){paint.fillStyle="rgba(255,255,255,.15)";paint.fillRect(38+i*202,180,182,72);paint.fillStyle="#ffffff";paint.font="22px system-ui";paint.fillText(label,56+i*202,225);}
 assets.set(asset,canvas.toDataURL("image/png"));
}
const tabKey="breditor/rich-demo/tab";
let tab=sessionStorage.getItem(tabKey);if(!tab){tab=crypto.randomUUID();sessionStorage.setItem(tabKey,tab);}
const sessions=await RichLocalSessionStore.open(`breditor-rich-demo/session/${tab}`);
const assetStore=await RichAssetStore.open("breditor-rich-demo/assets",{onChange:()=>{void showAssets();}});
const saved=await sessions.load();let owner=core;
if(saved){try{owner=profile.restoreEditor(saved);core.dispose();}catch(error){core.dispose();throw error;}}
let editor=mount(owner),saveSequence=0;
function save(){
 const sequence=++saveSequence;document.getElementById("saved").textContent="Saving locally…";
 try{void sessions.save(editor.checkpointJson()).then(()=>{if(sequence===saveSequence)document.getElementById("saved").textContent="Saved locally";}).catch(error=>report(error));}
 catch(error){report(error);}
}
function report(error){document.getElementById("saved").textContent="Not saved";document.getElementById("notice").textContent=error instanceof Error?error.message:"Local operation failed";}
function mount(owner){return mountRichEditor(document.getElementById("editor"),{core:owner,
 resolveAsset:binding=>assets.get(binding.asset)??assetStore.resolve(binding.asset),
 onFiles:async(files,position)=>{await insertImageFiles(editor,assetStore,files,position);await showAssets();},
 onError:report,onChange:view=>{document.getElementById("revision").textContent=`Revision ${view.revision} · ${view.undoDepth} undo groups`;save();}});}
async function showAssets(){
 const list=document.getElementById("assets");if(!list)return;
 const records=await assetStore.list();list.replaceChildren();
 for(const record of records){const row=document.createElement("li"),label=document.createElement("span");
  label.textContent=`${record.asset.slice(0,19)}… · ${record.mime} · ${record.bytes} bytes · ${record.status}`;row.append(label);
  if(record.status!=="uploaded"){const button=document.createElement("button");button.type="button";button.textContent=record.status==="cancelled"||record.status==="failed"?"Retry":"Cancel upload";
   button.addEventListener("click",async()=>{try{if(record.status==="cancelled"||record.status==="failed")await assetStore.retry(record.asset);else await assetStore.cancel(record.asset);await showAssets();}catch(error){report(error);}});row.append(button);}
  list.append(row);
 }
}
document.getElementById("images").addEventListener("change",async event=>{
 const files=[...(event.target.files??[])];if(!files.length)return;
 try{await insertImageFiles(editor,assetStore,files,{parent:{kind:"document"},before:null});await showAssets();}
 catch(error){report(error);}finally{event.target.value="";}
});
window.demo={get editor(){return editor;},profile,assetStore,sessions};
save();await showAssets();
document.getElementById("export").addEventListener("click",()=>{
 const blob=new Blob([editor.checkpointJson()],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="breditor-rich-session.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
});
document.getElementById("import").addEventListener("change",async event=>{
 const file=event.target.files?.[0];if(!file)return;
 try {if(file.size>16*1024*1024)throw Error("Session file exceeds 16 MiB");const restored=profile.restoreEditor(await file.text());editor.dispose();editor=mount(restored);save();document.getElementById("notice").textContent="Restored the exact local content and undo/redo branch.";}
 catch(error){document.getElementById("notice").textContent=error instanceof Error?error.message:"Session restore failed";}
 finally{event.target.value="";}
});
document.getElementById("ready").textContent="Ready — real Rust/Wasm editor";
