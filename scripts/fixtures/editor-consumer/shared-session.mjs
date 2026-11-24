import {createSharedProfile,openSharedEditor} from "@breditor/editor/collaboration";
import {seed,range} from "./seed.mjs";
const errors=[],profile=await createSharedProfile(),documentJson=seed(JSON.parse(profile.descriptor_json()));profile.free();
const query=new URLSearchParams(location.search);
const natural=query.get("history")==="typing",history=natural?{history:"typing-v1"}:{};
const general=query.get("ranges")==="general-v1";
const options={...history,...(general?{rangeEditing:"general-v1"}:{}),
 database:`sdk-shared-lifecycle${natural?"-typing":""}${general?"-general":""}`,room:"room",writer:"101",initial:{kind:"document",documentJson},onError:error=>errors.push(String(error))};
const a=await openSharedEditor({...options,host:document.querySelector("#a")});
const b=await openSharedEditor({...options,database:`${options.database}-peer`,writer:"202",initial:{kind:"frame",frame:a.core.updateFrame()},host:document.querySelector("#b")});
window.durableSdk={a,b,options,errors,range,createSharedProfile,openSharedEditor,sync:async()=>{const x=a.core.updateFrame(),y=b.core.updateFrame();await a.core.receiveFrame(y);await b.core.receiveFrame(x);if(a.core.documentJson()!==b.core.documentJson())throw Error("Durable replicas differ");}};
document.querySelector("#ready").textContent="Ready";
