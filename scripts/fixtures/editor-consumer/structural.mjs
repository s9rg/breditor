import {openLocalEditor,createLocalProfile,createStructuralLocalProfileV2,RichAssetStore} from "@breditor/editor";
import {structuralSeed,range} from "./structural-seed.mjs";
const errors=[],profile=await createStructuralLocalProfileV2(),binding=profile.descriptor(),documentJson=structuralSeed(binding);profile.dispose();
const assets=await RichAssetStore.open("installed-sdk-v2-assets"),saved=sessionStorage.getItem("installed-sdk-v2");
const editor=await openLocalEditor({host:document.querySelector("#editor"),richLanguage:2,initial:saved?{kind:"checkpoint",checkpointJson:saved}:{kind:"document",documentJson},resolveAsset:b=>assets.resolve(b.asset),onFiles:(files,position)=>editor.insertImageFiles(assets,files,position),onError:error=>errors.push(String(error))});
window.v2={editor,openLocalEditor,errors,binding,assets,range,createLocalProfile,createStructuralLocalProfileV2,save:()=>sessionStorage.setItem("installed-sdk-v2",editor.checkpointJson())};
document.querySelector("#save").addEventListener("click",window.v2.save);document.querySelector("#ready").textContent="Ready";
