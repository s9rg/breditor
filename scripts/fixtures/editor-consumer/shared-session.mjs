import {createSharedProfile,openSharedEditor} from "@breditor/editor/collaboration";
import {seed,range} from "./seed.mjs";
const errors=[],profile=await createSharedProfile(),documentJson=seed(JSON.parse(profile.descriptor_json()));profile.free();
const options={database:"sdk-shared-lifecycle",room:"room",writer:"101",initial:{kind:"document",documentJson},onError:error=>errors.push(String(error))};
const a=await openSharedEditor({...options,host:document.querySelector("#a")});
const b=await openSharedEditor({...options,database:"sdk-shared-lifecycle-peer",writer:"202",initial:{kind:"frame",frame:a.core.updateFrame()},host:document.querySelector("#b")});
window.durableSdk={a,b,options,errors,range,openSharedEditor,sync:async()=>{const x=a.core.updateFrame(),y=b.core.updateFrame();await a.core.receiveFrame(y);await b.core.receiveFrame(x);if(a.core.documentJson()!==b.core.documentJson())throw Error("Durable replicas differ");}};
document.querySelector("#ready").textContent="Ready";
