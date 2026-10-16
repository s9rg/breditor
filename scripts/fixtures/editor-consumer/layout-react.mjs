import {StrictMode,createElement,createRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {BreditorEditor} from "@breditor/editor/react";
import {BreditorSharedEditor} from "@breditor/editor/collaboration/react";
import {createLayoutLocalProfileV3} from "@breditor/editor";
import {coverageSeed,range,grid} from "./coverage-seed.mjs";
const shared=new URLSearchParams(location.search).get("mode")==="shared",key=`installed-layout-react-${shared}`,profile=await createLayoutLocalProfileV3(),documentJson=coverageSeed(profile.descriptor());profile.dispose();
const saved=sessionStorage.getItem(key),errors=[],closeErrors=[],ref=createRef();
window.layoutReact={ref,shared,errors,closeErrors,range,grid,ready:0,save:async()=>{const editor=ref.current.getEditor();if(shared)await editor.flush();else sessionStorage.setItem(key,editor.checkpointJson());return editor.checkpointJson();}};
function App(){const [count,setCount]=useState(0),[generation,setGeneration]=useState(0);return createElement(StrictMode,null,
 createElement("button",{id:"rerender",onClick:()=>setCount(value=>value+1)},"Rerender"),createElement("button",{id:"reopen",onClick:()=>setGeneration(value=>value+1)},"Reopen"),createElement("output",{id:"count"},count),
 createElement(shared?BreditorSharedEditor:BreditorEditor,{ref,sessionKey:String(generation),initialOptions:{richLanguage:3,...(shared?{database:key,room:"room",writer:"303"}:{}),initial:!shared&&saved?{kind:"checkpoint",checkpointJson:saved}:{kind:"document",documentJson}},onReady:()=>{window.layoutReact.ready++;document.querySelector("#ready").textContent="Ready";},onError:error=>errors.push(String(error)),...(shared?{onCloseError:error=>closeErrors.push(String(error))}:{})}));}
createRoot(document.querySelector("#app")).render(createElement(App));
