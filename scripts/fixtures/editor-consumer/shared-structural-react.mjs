import {StrictMode,createElement,useState,createRef} from "react";
import {createRoot} from "react-dom/client";
import {createStructuralSharedProfileV2} from "@breditor/editor/collaboration";
import {BreditorSharedEditor} from "@breditor/editor/collaboration/react";
import {structuralSeed,range} from "./structural-seed.mjs";
const profile=await createStructuralSharedProfileV2(),documentJson=structuralSeed(JSON.parse(profile.descriptor_json()));profile.free();
const errors=[],closeErrors=[],ref=createRef();window.sharedV2React={ref,errors,closeErrors,range,ready:0};
const natural=new URLSearchParams(location.search).get("history")==="typing",history=natural?{history:"typing-v1"}:{};
function App(){const [count,setCount]=useState(0),[key,setKey]=useState(0);return createElement(StrictMode,null,
 createElement("button",{id:"rerender",onClick:()=>setCount(v=>v+1)},"Rerender"),createElement("button",{id:"reopen",onClick:()=>setKey(v=>v+1)},"Reopen writer"),createElement("output",{id:"count"},count),
 createElement(BreditorSharedEditor,{ref,sessionKey:String(key),initialOptions:{...history,richLanguage:2,database:`installed-shared-v2-react${natural?"-typing":""}`,room:"room",writer:"303",initial:{kind:"document",documentJson}},onReady:()=>{window.sharedV2React.ready++;document.querySelector("#ready").textContent="Ready";},onError:error=>errors.push(String(error)),onCloseError:error=>closeErrors.push(String(error))}));}
createRoot(document.querySelector("#app")).render(createElement(App));
