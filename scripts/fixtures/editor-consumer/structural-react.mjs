import {StrictMode,createElement,createRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {BreditorEditor} from "@breditor/editor/react";
import {createStructuralLocalProfileV2} from "@breditor/editor";
import {structuralSeed,range} from "./structural-seed.mjs";
const profile=await createStructuralLocalProfileV2(),documentJson=structuralSeed(profile.descriptor());profile.dispose();const saved=sessionStorage.getItem("installed-sdk-v2-react"),errors=[],ref=createRef();
window.v2React={ref,errors,range,ready:0,save:()=>sessionStorage.setItem("installed-sdk-v2-react",ref.current.checkpointJson())};
function App(){const [count,setCount]=useState(0);return createElement(StrictMode,null,createElement("button",{id:"rerender",onClick:()=>setCount(v=>v+1)},"Rerender"),createElement("output",{id:"count"},count),createElement(BreditorEditor,{ref,sessionKey:"structural-v2",initialOptions:{richLanguage:2,initial:saved?{kind:"checkpoint",checkpointJson:saved}:{kind:"document",documentJson}},onReady:()=>{window.v2React.ready++;document.querySelector("#ready").textContent="Ready";},onError:error=>errors.push(String(error))}));}
createRoot(document.querySelector("#app")).render(createElement(App));
