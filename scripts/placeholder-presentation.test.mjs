import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {validatePlaceholderOption,prepareRichPlaceholder,RichPlaceholderPresentation} from "../packages/breditor-experimental-rich-content/dist/browser/placeholder.js";

test("placeholder admission is explicit, bounded UTF8 and never reads an omitted option",()=>{
 for(const value of [undefined,"Start typing","日本語","🙂".repeat(256)])assert.doesNotThrow(()=>validatePlaceholderOption(value));
 for(const value of ["",null,false,4,{},"a".repeat(1025),"🙂".repeat(257),"\ud800","\udfff"])assert.throws(()=>validatePlaceholderOption(value),/placeholder/);
 const old={view(){throw Error("must not read");}};assert.equal(prepareRichPlaceholder(undefined,old),undefined);assert.throws(()=>prepareRichPlaceholder("Prompt",old),/matching native/);
});
test("placeholder preparation uses the exact native revision and refuses incomplete or invalid results",()=>{
 const revisions=[],revision="18446744073709551615",core={view:()=>({revision}),supportsPlaceholder:()=>true,placeholderEmpty:r=>{revisions.push(r);return true;}};
 assert.deepEqual(prepareRichPlaceholder("Literal",core),{label:"Literal",empty:true});assert.deepEqual(revisions,[revision]);
 assert.throws(()=>prepareRichPlaceholder("Literal",{...core,supportsPlaceholder:()=>false}),/matching native/);
 assert.throws(()=>prepareRichPlaceholder("Literal",{...core,placeholderEmpty:undefined}),/matching native/);
 assert.throws(()=>prepareRichPlaceholder("Literal",{...core,placeholderEmpty:()=>"true"}),/Invalid native/);
});
test("literal prompt remains outside editable DOM and disposal leaves that DOM and focus alone",()=>{
 const dom=new JSDOM('<body><div id="host"></div>',{pretendToBeVisual:true}),d=dom.window.document,surface=d.createElement("div");surface.contentEditable="true";surface.tabIndex=0;surface.innerHTML='<p data-rich-text="body"><br></p>';const html=surface.innerHTML,label='<img src=x onerror="bad()">日本';
 const p=new RichPlaceholderPresentation(surface,label);d.querySelector("#host").append(p.container);p.activate();surface.focus();p.update(true);
 const hint=d.querySelector("[data-breditor-placeholder]");assert.equal(hint.textContent,label);assert.equal(hint.hidden,false);assert.equal(hint.getAttribute("aria-hidden"),"true");assert.equal(surface.getAttribute("aria-placeholder"),label);assert.equal(surface.contains(hint),false);assert.equal(d.querySelector("img"),null);assert.equal(surface.innerHTML,html);assert.equal(d.activeElement,surface);
 p.setLabel("Live label");assert.equal(hint.textContent,"Live label");assert.equal(surface.getAttribute("aria-placeholder"),"Live label");p.setLabel(null);assert.equal(hint.hidden,true);assert.equal(surface.hasAttribute("aria-placeholder"),false);assert.throws(()=>p.setLabel("\ud800"),/placeholder/);assert.equal(hint.hidden,true);p.setLabel("Restored");assert.equal(hint.hidden,false);p.update(false);p.setLabel("Readonly/composing label");assert.equal(hint.hidden,true);assert.equal(surface.innerHTML,html);p.dispose();p.dispose();assert.throws(()=>p.setLabel("Late"),/disposed/);assert.equal(surface.innerHTML,html);assert.equal(surface.isConnected,true);assert.equal(surface.hasAttribute("aria-placeholder"),false);assert.equal(d.querySelector("[data-breditor-placeholder]"),null);assert.equal(d.activeElement,surface);dom.window.close();
});
test("prompt geometry follows its actual prose block, with deferred observer activation and exact cleanup",()=>{
 const dom=new JSDOM('<body></body>',{pretendToBeVisual:true}),d=dom.window.document,observers=[];
 dom.window.ResizeObserver=class {constructor(callback){this.callback=callback;this.seen=new Set();this.disconnected=false;observers.push(this);}observe(node){this.seen.add(node);}unobserve(node){this.seen.delete(node);}disconnect(){this.disconnected=true;this.seen.clear();}};
 const surface=d.createElement("div");surface.innerHTML='<h2 data-rich-text="body" style="font: bold 24px serif;direction:rtl;text-align:end"><br></h2>';
 const p=new RichPlaceholderPresentation(surface,"Prompt");d.body.append(p.container);const block=surface.firstElementChild;p.container.getBoundingClientRect=()=>({left:100,top:50,bottom:350});block.getBoundingClientRect=()=>({left:120,top:90,width:400});p.update(true);assert.equal(observers.length,0,"Failed owner construction cannot leak an observer");p.activate();p.activate();assert.equal(observers.length,1);
 const hint=d.querySelector("[data-breditor-placeholder]");assert.equal(hint.style.left,"20px");assert.equal(hint.style.top,"40px");assert.equal(hint.style.width,"400px");assert.equal(hint.style.direction,"rtl");assert.equal(hint.style.textAlign,"end");assert.ok(observers[0].seen.has(surface)&&observers[0].seen.has(block));
 p.update(false);assert.equal(observers[0].seen.has(block),false,"A hidden prompt must not retain an obsolete paragraph");surface.innerHTML='<p data-rich-text="next"><br></p>';const next=surface.firstElementChild;next.getBoundingClientRect=()=>({left:130,top:100,width:380});p.update(true);assert.equal(observers[0].seen.has(next),true);assert.equal(hint.style.top,"50px");p.dispose();assert.equal(observers[0].disconnected,true);observers[0].callback();dom.window.dispatchEvent(new dom.window.Event("resize"));assert.equal(hint.isConnected,false);dom.window.close();
});
