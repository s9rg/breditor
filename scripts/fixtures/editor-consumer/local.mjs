import {openLocalEditor,createLocalProfile,RichAssetStore} from "@breditor/editor";
import {seed,range} from "./seed.mjs";
const errors=[],profile=await createLocalProfile(),documentJson=seed(profile.descriptor());profile.dispose();const assets=await RichAssetStore.open("installed-sdk-assets");
const saved=sessionStorage.getItem("installed-sdk-checkpoint");
const editor=await openLocalEditor({host:document.querySelector("#editor"),initial:saved?{kind:"checkpoint",checkpointJson:saved}:{kind:"document",documentJson},resolveAsset:binding=>assets.resolve(binding.asset),onError:error=>errors.push(String(error)),onFiles:(files,position)=>editor.insertImageFiles(assets,files,position)});
window.sdk={editor,openLocalEditor,errors,assets,range,save:()=>sessionStorage.setItem("installed-sdk-checkpoint",editor.checkpointJson()),dispose:()=>{editor.dispose();assets.close();}};
document.querySelector("#files").addEventListener("change",async event=>{try{await editor.insertImageFiles(assets,[...event.currentTarget.files],{parent:{kind:"document"},before:null});}catch(error){errors.push(String(error));}});
document.querySelector("#save").addEventListener("click",window.sdk.save);document.querySelector("#ready").textContent="Ready";
