import {StrictMode,createElement,useState,createRef} from "react";
import {createRoot} from "react-dom/client";
import {BreditorEditor} from "@breditor/editor/react";
import {createLocalProfile} from "@breditor/editor";
import {seed,range} from "./seed.mjs";
const profile=await createLocalProfile(),documentJson=seed(profile.descriptor());profile.dispose();const errors=[],ref=createRef();
window.reactSdk={ref,errors,range,ready:0,changes:0};
function App(){const [count,setCount]=useState(0),[session,setSession]=useState(0),[visible,setVisible]=useState(true);return createElement(StrictMode,null,
 createElement("button",{id:"rerender",onClick:()=>setCount(v=>v+1)},"Rerender"),createElement("button",{id:"switch",onClick:()=>setSession(v=>v+1)},"New session"),createElement("button",{id:"toggle",onClick:()=>setVisible(v=>!v)},"Toggle"),createElement("output",{id:"render-count"},count),
 visible?createElement(BreditorEditor,{ref,sessionKey:String(session),initialOptions:{initial:{kind:"document",documentJson},label:"Installed React editor"},onReady:()=>{window.reactSdk.ready++;document.querySelector("#ready").textContent="Ready";},onChange:()=>{window.reactSdk.changes++;window.reactSdk.lastCallback=count;},onError:error=>errors.push(String(error))}):null);
}
const root=createRoot(document.querySelector("#app"));root.render(createElement(App));window.reactSdk.unmount=()=>root.unmount();
