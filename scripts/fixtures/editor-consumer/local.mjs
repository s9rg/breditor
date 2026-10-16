import {openLocalEditor,createLocalProfile,RichAssetStore} from "@breditor/editor";
import {seed,range} from "./seed.mjs";
const errors=[],profile=await createLocalProfile(),documentJson=seed(profile.descriptor());profile.dispose();const assets=await RichAssetStore.open("installed-sdk-assets");
const natural=new URL(location.href).searchParams.get("history")==="typing",storageKey=natural?"installed-sdk-typing":"installed-sdk-checkpoint",saved=sessionStorage.getItem(storageKey);
const editor=await openLocalEditor({host:document.querySelector("#editor"),...(natural?{history:"typing-v1"}:{}),initial:saved?{kind:natural?"typingCheckpoint":"checkpoint",checkpointJson:saved}:{kind:"document",documentJson},resolveAsset:binding=>assets.resolve(binding.asset),onError:error=>errors.push(String(error)),onFiles:(files,position)=>editor.insertImageFiles(assets,files,position)});
window.sdk={editor,openLocalEditor,createLocalProfile,errors,assets,range,save:()=>sessionStorage.setItem(storageKey,editor.checkpointJson()),dispose:()=>{editor.dispose();assets.close();}};
document.querySelector("#files").addEventListener("change",async event=>{try{await editor.insertImageFiles(assets,[...event.currentTarget.files],{parent:{kind:"document"},before:null});}catch(error){errors.push(String(error));}});
document.querySelector("#save").addEventListener("click",window.sdk.save);document.querySelector("#ready").textContent="Ready";
