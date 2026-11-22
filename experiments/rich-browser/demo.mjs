// Interactive sample using the actual opt-in package and Rust owner, not a mock editor.
import init,* as wasm from "/wasm.js";
import {mountRichLocalAutosave} from "/dist/browser/persistence/local_autosave.js";
import {compileRichProfile,mountRichEditor,RichAssetStore,RichLocalSessionStore,insertImageFiles,defaultToolbar,
 mountRichSlashCommands,createRichSlashCommands,mountRichSelectionToolbar,mountRichContextMenu,
 mountRichTableColumnResize,richTableColumnResizeCommit,mountRichImageResize,richImageResizeCommit,mountRichBlockDrag,mountRichShortcutHelp,richUiStringsEn,standardRichSlashPicks} from "/rich.js";
// ?ui=pseudo wraps every chrome string to show the opt-in catalog; &dir=rtl mirrors the chrome only, never content.
const query=new URLSearchParams(location.search);
const ui=query.get("ui")==="pseudo"?{strings:Object.fromEntries(Object.entries(richUiStringsEn).map(([key,value])=>[key,`⟦${value}⟧`])),lang:"en-XA",direction:query.get("dir")==="rtl"?"rtl":"ltr"}:undefined;
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
// Opt-in parity features. Each borrows the editor and runs existing Rust commands; remounts dispose them first.
const overlay=document.createElement("div");overlay.id="table-resize";overlay.style.position="relative";
document.getElementById("editor").before(overlay);
const imageOverlay=document.createElement("div");imageOverlay.id="image-resize";imageOverlay.style.position="relative";overlay.after(imageOverlay);
let extras=[],shortcutHelp;
const shortcutButton=document.createElement("button");
shortcutButton.type="button";
shortcutButton.textContent="Keyboard shortcuts";
shortcutButton.setAttribute("aria-haspopup","dialog");
const rtlContent=document.createElement("input"),rtlLabel=document.createElement("label");
rtlContent.type="checkbox";
rtlLabel.append(rtlContent," Right-to-left content");
document.querySelector(".tools").append(shortcutButton,rtlLabel);
shortcutButton.addEventListener("click",()=>{
 shortcutButton.focus({preventScroll:true});
 shortcutHelp.open();
});
function mountExtras(editor){
 for(const extra of extras)extra.dispose();
 extras=[
  mountRichSlashCommands(editor,{items:createRichSlashCommands(defaultToolbar,standardRichSlashPicks,editor.uiLocale()),onError:report}),
  mountRichSelectionToolbar(editor,{onError:report}),
  mountRichContextMenu(editor,{onError:report}),
  mountRichTableColumnResize(overlay,editor,{commit:richTableColumnResizeCommit(editor),onError:report}),
  mountRichImageResize(imageOverlay,editor,{commit:richImageResizeCommit(editor),onError:report}),
  mountRichBlockDrag(editor),
 ];
 shortcutHelp=mountRichShortcutHelp(editor,{onError:report});
 extras.push(shortcutHelp);
}
const saveState=document.getElementById("saved");
saveState.setAttribute("role","status");
const retrySave=document.createElement("button");
retrySave.type="button";
retrySave.textContent="Retry save";
retrySave.hidden=true;
saveState.after(retrySave);
const saveLabels={scheduled:"Saving locally…",saving:"Saving locally…",idle:"Saved locally",paused:"Save paused"};
function startAutosave(owner){
 const mounted=mountRichLocalAutosave(owner,sessions,{delayMs:140,maxLatencyMs:500});
 const showStatus=({phase})=>{
  const label=saveLabels[phase]??"";
  if(saveState.textContent!==label)saveState.textContent=label;
  retrySave.hidden=phase!=="paused";
 };
 mounted.observeStatus(showStatus);
 showStatus(mounted.getStatus());
 return mounted;
}
let editor=mount(owner),autosave=startAutosave(editor);
mountExtras(editor);
rtlContent.addEventListener("change",()=>setContentDirection(editor));
retrySave.addEventListener("click",()=>{void autosave.retry();});
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="hidden")void autosave.flush();
});
function report(error){document.getElementById("notice").textContent=error instanceof Error?error.message:"Local operation failed";}
function setContentDirection(mounted){mounted.surface.style.direction=rtlContent.checked?"rtl":"";}
function mount(owner){
 const mounted=mountRichEditor(document.getElementById("editor"),{core:owner,scrollableTables:true,...(ui?{ui}:{}),
  resolveAsset:binding=>assets.get(binding.asset)??assetStore.resolve(binding.asset),
  onFiles:async(files,position)=>{await insertImageFiles(editor,assetStore,files,position);await showAssets();},
  onError:report,onChange:view=>{document.getElementById("revision").textContent=`Revision ${view.revision} · ${view.undoDepth} undo groups`;}});
 setContentDirection(mounted);
 return mounted;
}
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
window.demo={get editor(){return editor;},get extras(){return extras;},get autosave(){return autosave;},profile,assetStore,sessions};
await showAssets();
document.getElementById("export").addEventListener("click",()=>{
 const blob=new Blob([editor.checkpointJson()],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="breditor-rich-session.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
});
// Word export: the opt-in @breditor/interchange/docx entry, loaded on demand. Image bytes come from
// this page (demo canvases) or the local asset store; nothing is sent over the network.
document.getElementById("export-docx").addEventListener("click",async()=>{
 try{
  const {exportDocxWithImages,docxContentType}=await import("/interchange/docx.js");
  const dataBytes=url=>Uint8Array.from(atob(url.slice(url.indexOf(",")+1)),c=>c.charCodeAt(0));
  const result=await exportDocxWithImages(editor.view().documentJson,{title:"Breditor rich content demo",
   loadImage:binding=>assets.has(binding.asset)?dataBytes(assets.get(binding.asset)):assetStore.blob(binding.asset)});
  window.demo.lastDocx=result.ok?{ok:true,bytes:result.value.length,losses:result.losses}:{ok:false,error:result.error,losses:result.losses};
  if(!result.ok)throw Error(`Word export failed: ${result.error}`);
  const url=URL.createObjectURL(new Blob([result.value],{type:docxContentType})),link=document.createElement("a");link.href=url;link.download="breditor-document.docx";link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  document.getElementById("notice").textContent=result.losses.length?`Exported Word document. Not fully represented: ${result.losses.map(loss=>`${loss.code} ×${loss.count}`).join(", ")}.`:"Exported Word document with no reported losses.";
 }catch(error){document.getElementById("notice").textContent=error instanceof Error?error.message:"Word export failed";}
});
document.getElementById("import").addEventListener("change",async event=>{
 const input=event.currentTarget,file=input.files?.[0];
 if(!file||input.disabled)return;
 input.disabled=true;
 document.getElementById("notice").textContent="Reading session backup…";
 try {
  if(file.size>16*1024*1024)throw Error("Session file exceeds 16 MiB");
  const checkpoint=await file.text();
  const previous=await autosave.flush();
  if(previous.status!=="committed")throw Error("Retry the current save before restoring a different session.");
  let restored;
  try{restored=profile.restoreEditor(checkpoint);}
  catch{throw Error("Could not read this session backup. Choose a file from Export exact local session.");}
  for(const extra of extras)extra.dispose();
  extras=[];
  autosave.dispose();
  editor.dispose();
  editor=mount(restored);
  autosave=startAutosave(editor);
  mountExtras(editor);
  document.getElementById("notice").textContent="Restored the exact local content and undo/redo branch.";
 }
 catch(error){document.getElementById("notice").textContent=error instanceof Error?error.message:"Session restore failed";}
 finally{input.value="";input.disabled=false;}
});
document.getElementById("ready").textContent="Ready — real Rust/Wasm editor";
