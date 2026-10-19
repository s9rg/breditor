import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {createRichFullscreen} from "../packages/breditor-experimental-rich-content/dist/browser/fullscreen_controller.js";
import {mountRichFullscreenControls} from "../packages/breditor-experimental-rich-content/dist/browser/fullscreen_controls.js";

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();}
function world(){
 const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true}),w=dom.window,d=w.document,flags=new Set(),stack=[],trace=[],errors=[];let entering,exiting;
 const realMatches=w.Element.prototype.matches;w.Element.prototype.matches=function(selector){return selector===":fullscreen"?flags.has(this):realMatches.call(this,selector);};
 Object.defineProperty(d,"fullscreenEnabled",{value:true,configurable:true});Object.defineProperty(d,"fullscreenElement",{get:()=>stack.at(-1)??null,configurable:true});
 const change=()=>d.dispatchEvent(new w.Event("fullscreenchange")),push=target=>{flags.add(target);stack.push(target);change();},pop=()=>{flags.delete(stack.pop());change();};
 d.exitFullscreen=()=>{trace.push("exit");if(exiting)return exiting();pop();return Promise.resolve();};
 function host(){const root=d.createElement("main"),surface=d.createElement("div"),controls=d.createElement("div");surface.tabIndex=0;surface.innerHTML='<p data-rich-text="body">Accepted text</p>';root.append(surface,controls);d.body.append(root);const listeners=new Set(),focuses=[];let state={revision:"1",closed:false,busy:false,composing:false};
  root.requestFullscreen=options=>{trace.push(["enter",options]);if(entering)return entering(root);push(root);return Promise.resolve();};
  const port={surface,fullscreenRoot:root,fullscreenState:()=>Object.freeze({...state}),subscribeFullscreen:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},focusFullscreen:revision=>{assert.equal(revision,state.revision);assert.equal(state.closed||state.busy||state.composing,false);focuses.push(revision);surface.focus({preventScroll:true});}};
  return{root,surface,controls,port,listeners,focuses,set:patch=>{state={...state,...patch};for(const fn of [...listeners])fn();}};
 }
 return{dom,w,d,flags,trace,errors,host,push,pop,change,setEnter:fn=>{entering=fn;},setExit:fn=>{exiting=fn;},options:{onError:error=>errors.push(String(error))},close:()=>dom.window.close()};
}

test("fullscreen calls native entry synchronously, keeps DOM and restores only the exact current presentation",async()=>{
 const t=world(),h=t.host(),html=h.surface.innerHTML,controller=createRichFullscreen(h.port,t.options);h.surface.focus();let requestsAtNotification=0;controller.subscribe(()=>{requestsAtNotification=t.trace.filter(x=>Array.isArray(x)).length;});
 try{const pending=controller.enter("1");assert.equal(t.trace[0][0],"enter");assert.equal(requestsAtNotification,1);assert.deepEqual(t.trace[0][1],{navigationUI:"auto"});await pending;assert.equal(controller.state().active,true);assert.deepEqual(h.focuses,["1"]);assert.equal(h.surface.innerHTML,html);assert.equal(h.surface.parentElement,h.root);assert.equal(t.d.activeElement,h.surface);await controller.exit();assert.equal(controller.state().active,false);assert.deepEqual(h.focuses,["1","1"]);assert.equal(h.surface.innerHTML,html);assert.equal(h.port.fullscreenState().revision,"1");await controller.dispose();assert.equal(h.root.hasAttribute("data-breditor-fullscreen-target"),false);assert.equal(h.listeners.size,0);assert.deepEqual(t.errors,[]);}finally{await controller.dispose();t.close();}
});
test("stale, busy, composing and unsupported entry rejects before any native request",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port,t.options);
 try{await assert.rejects(controller.enter("2"),/exact idle/);h.set({busy:true});await assert.rejects(controller.enter(),/exact idle/);h.set({busy:false,composing:true});await assert.rejects(controller.enter(),/composition/);h.set({composing:false});Object.defineProperty(t.d,"fullscreenEnabled",{value:false,configurable:true});assert.equal(controller.state().supported,false);await assert.rejects(controller.enter(),/unavailable/);assert.deepEqual(t.trace,[]);}finally{await controller.dispose();t.close();}
});
test("one pending document lease excludes other targets without exiting foreign fullscreen",async()=>{
 const t=world(),a=t.host(),b=t.host(),one=createRichFullscreen(a.port),two=createRichFullscreen(b.port),gate=deferred();t.setEnter(root=>gate.promise.then(()=>t.push(root)));
 try{const pending=one.enter();await assert.rejects(two.enter(),/Another fullscreen/);assert.throws(()=>createRichFullscreen(a.port),/already owned/);gate.resolve();await pending;await assert.rejects(two.exit(),/another fullscreen/);assert.equal(t.trace.filter(x=>x==="exit").length,0);await one.exit();await two.enter();await two.exit();}finally{await one.dispose();await two.dispose();t.close();}
});
test("disposing a pending request waits for late entry, exits only its own target and permits clean replacement",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port),gate=deferred();t.setEnter(root=>gate.promise.then(()=>t.push(root)));
 try{const entering=controller.enter(),closing=controller.dispose();assert.equal(closing,controller.dispose());assert.equal(controller.state().retiring,true);assert.throws(()=>createRichFullscreen(h.port),/already owned/);await assert.rejects(controller.enter(),/retiring/);gate.resolve();await entering;await closing;assert.equal(controller.state().disposed,true);assert.equal(t.d.fullscreenElement,null);assert.equal(t.trace.filter(x=>x==="exit").length,1);const next=createRichFullscreen(h.port);await next.dispose();assert.equal(h.listeners.size,0);}finally{await controller.dispose();t.close();}
});
test("denied pending entry still retires without a hidden retry or unhandled owner",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port,t.options),gate=deferred();t.setEnter(()=>gate.promise);
 try{const entering=controller.enter(),rejected=assert.rejects(entering,/activation denied/),closing=controller.dispose();gate.reject(Error("activation denied"));await rejected;await closing;assert.equal(controller.state().disposed,true);assert.equal(t.trace.filter(x=>x==="exit").length,0);assert.equal(t.errors.length,1);}finally{await controller.dispose();t.close();}
});
test("failed owned exit retains its lease and retryable retirement instead of releasing another owner",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port,t.options);let refuse=true;t.setExit(()=>{if(refuse)return Promise.reject(Error("native exit denied"));t.pop();return Promise.resolve();});
 try{await controller.enter();await assert.rejects(controller.dispose(),/exit denied/);assert.equal(controller.state().retiring,true);assert.equal(controller.state().disposed,false);assert.equal(controller.state().active,true);assert.throws(()=>createRichFullscreen(h.port),/already owned/);refuse=false;await controller.dispose();assert.equal(controller.state().disposed,true);assert.equal(t.d.fullscreenElement,null);}finally{t.setExit(undefined);await controller.dispose();t.close();}
});
test("cleanup never exits a foreign nested session and resumes only when its own target returns to the top",async()=>{
 const t=world(),h=t.host(),other=t.host(),controller=createRichFullscreen(h.port,t.options);
 try{await controller.enter();t.push(other.root);await assert.rejects(controller.dispose(),/above this session/);assert.equal(t.trace.filter(x=>x==="exit").length,0);assert.equal(t.d.fullscreenElement,other.root);assert.equal(controller.state().disposed,false);t.pop();await settle();await controller.dispose();assert.equal(t.d.fullscreenElement,null);assert.equal(t.trace.filter(x=>x==="exit").length,1);}finally{while(t.d.fullscreenElement)t.pop();await controller.dispose();t.close();}
});
test("external fullscreen on the same element is not adopted or exited by this controller",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port);try{t.push(h.root);assert.equal(controller.state().active,false);assert.equal(controller.state().foreign,true);await assert.rejects(controller.exit(),/another fullscreen/);await controller.dispose();assert.equal(t.d.fullscreenElement,h.root);assert.equal(t.trace.filter(x=>x==="exit").length,0);}finally{t.pop();await controller.dispose();t.close();}
});
test("remote publication can proceed during entry and invalidates the old focus bookmark",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port),gate=deferred();t.setEnter(root=>gate.promise.then(()=>t.push(root)));h.surface.focus();
 try{const entering=controller.enter();h.set({revision:"2"});gate.resolve();await entering;assert.deepEqual(h.focuses,[]);assert.equal(controller.state().revision,"2");await controller.exit();assert.deepEqual(h.focuses,["2"]);}finally{await controller.dispose();t.close();}
});
test("interaction or focus moved while awaiting the browser is never undone",async()=>{
 for(const move of ["interaction","outside"]){const t=world(),h=t.host(),other=t.host(),controller=createRichFullscreen(h.port),gate=deferred();t.setEnter(root=>gate.promise.then(()=>t.push(root)));h.surface.focus();try{const entering=controller.enter();if(move==="interaction")h.surface.dispatchEvent(new t.w.KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}));else other.surface.focus();gate.resolve();await entering;assert.deepEqual(h.focuses,[]);if(move==="outside")assert.equal(t.d.activeElement,other.surface);}finally{await controller.dispose();t.close();}}
});
test("unchanged host input value/caret survives focus restoration without restoring an edited field",async()=>{
 for(const changed of [false,true]){const t=world(),h=t.host(),input=t.d.createElement("input"),controller=createRichFullscreen(h.port),gate=deferred();h.controls.append(input);input.value="Host search";input.focus();input.setSelectionRange(2,7,"backward");t.setEnter(root=>gate.promise.then(()=>t.push(root)));try{const entering=controller.enter();input.blur();if(changed)input.value="New host text";gate.resolve();await entering;assert.equal(input.value,changed?"New host text":"Host search");assert.equal(t.d.activeElement===input,!changed);if(!changed){assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,7);assert.equal(input.selectionDirection,"backward");}assert.deepEqual(h.focuses,[]);}finally{await controller.dispose();t.close();}}
});
test("closed borrowed editor triggers native retirement without disposing or reopening the editor",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port),gate=deferred();t.setEnter(root=>gate.promise.then(()=>t.push(root)));try{const entering=controller.enter();h.set({closed:true});gate.resolve();await entering;await settle();await controller.dispose();assert.equal(controller.state().disposed,true);assert.equal(t.d.fullscreenElement,null);assert.deepEqual(h.focuses,[]);assert.equal(h.listeners.size,0);}finally{await controller.dispose();t.close();}
});
test("borrowed controls may be replaced while fullscreen without exiting or transferring controller lifetime",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port),first=mountRichFullscreenControls(h.controls,controller);h.surface.focus();try{assert.throws(()=>mountRichFullscreenControls(h.controls,controller),/unused host/);assert.throws(()=>mountRichFullscreenControls(h.surface,controller),/outside editable/);const button=h.controls.querySelector("button"),pointer=new t.w.MouseEvent("pointerdown",{bubbles:true,cancelable:true});button.dispatchEvent(pointer);assert.equal(pointer.defaultPrevented,true);button.click();await settle();assert.equal(controller.state().active,true);assert.equal(button.getAttribute("aria-pressed"),"true");first.dispose();assert.equal(controller.state().active,true);const second=mountRichFullscreenControls(h.controls,controller,{exitLabel:"Leave focus mode"});assert.equal(h.controls.querySelector("button").textContent,"Leave focus mode");second.dispose();assert.equal(t.trace.filter(x=>x==="exit").length,0);assert.equal(h.surface.isConnected,true);}finally{first.dispose();await controller.dispose();t.close();}
});
test("target admission is atomic, preserves host markers and never silently wraps an editing surface",async()=>{
 const t=world(),h=t.host();try{assert.throws(()=>createRichFullscreen(h.port,{target:h.surface}),/outside editable/);assert.throws(()=>createRichFullscreen(h.port,{navigationUI:"invalid"}),/navigationUI/);assert.equal(h.root.hasAttribute("data-breditor-fullscreen-target"),false);h.root.setAttribute("data-breditor-fullscreen-target","host-value");const controller=createRichFullscreen(h.port);await controller.dispose();assert.equal(h.root.getAttribute("data-breditor-fullscreen-target"),"host-value");const next=createRichFullscreen(h.port);h.root.setAttribute("data-breditor-fullscreen-target","new-host-value");await next.dispose();assert.equal(h.root.getAttribute("data-breditor-fullscreen-target"),"new-host-value");assert.equal(t.d.querySelectorAll("style").length,0);}finally{t.close();}
});
test("retirement is idempotent even when a state subscriber requests retirement reentrantly",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port);let again;controller.subscribe(()=>{if(controller.state().retiring&&!controller.state().disposed)again=controller.dispose();});try{const closing=controller.dispose();assert.equal(again,closing);await closing;assert.equal(controller.state().disposed,true);assert.equal(h.listeners.size,0);}finally{await controller.dispose();t.close();}
});
test("owned exit remains available during composition without restoring stale focus or cancelling composition",async()=>{
 const t=world(),h=t.host(),controller=createRichFullscreen(h.port);h.surface.focus();try{await controller.enter();h.set({composing:true});await controller.exit();assert.equal(controller.state().composing,true);assert.equal(controller.state().active,false);assert.deepEqual(h.focuses,["1"]);}finally{await controller.dispose();t.close();}
});
test("missing native API reports unsupported rather than inventing a foreign fullscreen session",async()=>{
 const t=world(),h=t.host();delete t.d.fullscreenElement;Object.defineProperty(t.d,"fullscreenEnabled",{value:undefined});h.root.requestFullscreen=undefined;t.d.exitFullscreen=undefined;const controller=createRichFullscreen(h.port),controls=mountRichFullscreenControls(h.controls,controller);
 try{assert.equal(controller.state().supported,false);assert.equal(controller.state().foreign,false);assert.equal(h.controls.querySelector("button").disabled,true);assert.match(h.controls.textContent,/Native fullscreen unavailable/);await assert.rejects(controller.enter(),/unavailable/);assert.deepEqual(t.trace,[]);}finally{controls.dispose();await controller.dispose();t.close();}
});
test("adopting a target into another document cannot transfer the original document lease",async()=>{
 const t=world(),other=world(),h=t.host(),controller=createRichFullscreen(h.port);other.d.body.append(other.d.adoptNode(h.root));try{await assert.rejects(controller.enter(),/original document/);assert.deepEqual(t.trace,[]);assert.equal(other.d.fullscreenElement,null);}finally{await controller.dispose();t.close();other.close();}
});
test("native ownership follows closed-shadow retargeting without exiting a different topmost element",async()=>{
 const t=world(),h=t.host(),shadowHost=t.d.createElement("div");t.d.body.append(shadowHost);const shadow=shadowHost.attachShadow({mode:"closed"});shadow.append(h.root);Object.defineProperty(shadow,"fullscreenElement",{get:()=>t.flags.has(h.root)?h.root:null});Object.defineProperty(t.d,"fullscreenElement",{get:()=>shadow.fullscreenElement?shadowHost:null,configurable:true});const controller=createRichFullscreen(h.port);try{await controller.enter();assert.equal(controller.state().active,true);assert.equal(shadow.querySelectorAll("style").length,1);await controller.exit();assert.equal(controller.state().active,false);await controller.dispose();assert.equal(shadow.querySelectorAll("style").length,0);}finally{await controller.dispose();t.close();}
});
