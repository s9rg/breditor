import {createSharedProfile,createStructuralSharedProfileV2,structuralSharedProfileConfigurationV2,openSharedEditor,insertSharedImageFiles} from "@breditor/editor/collaboration";
import {RichAssetStore} from "@breditor/editor";
import {structuralSeed,range} from "./structural-seed.mjs";
const errors=[],profile=await createStructuralSharedProfileV2(),binding=JSON.parse(profile.descriptor_json()),documentJson=structuralSeed(binding);profile.free();
const assets=await RichAssetStore.open("installed-shared-v2-assets");
const options={richLanguage:2,database:"installed-shared-v2",room:"room",writer:"101",initial:{kind:"document",documentJson},resolveAsset:b=>assets.resolve(b.asset),onError:error=>errors.push(String(error))};
let a,b;
a=await openSharedEditor({...options,host:document.querySelector("#a"),onFiles:(files,position,revision)=>insertSharedImageFiles(a.core,assets,files,position,revision)});
b=await openSharedEditor({...options,database:"installed-shared-v2-peer",writer:"202",initial:{kind:"frame",frame:a.core.updateFrame()},host:document.querySelector("#b"),onFiles:(files,position,revision)=>insertSharedImageFiles(b.core,assets,files,position,revision)});
window.sharedV2={a,b,binding,configuration:structuralSharedProfileConfigurationV2,documentJson,options,assets,errors,range,createSharedProfile,createStructuralSharedProfileV2,openSharedEditor,
 sync:async()=>{const x=a.core.updateFrame(),y=b.core.updateFrame();await a.core.receiveFrame(y);await b.core.receiveFrame(x);if(a.core.documentJson()!==b.core.documentJson())throw Error("Shared V2 replicas differ");},
 close:async()=>{await a.flush();await b.flush();const value={checkpoint:a.checkpointJson(),document:a.view().documentJson};await a.close();await b.close();return value;}
};
document.querySelector("#ready").textContent="Ready";
