import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {mountRichExternalToolbar,checkRichToolbarContainer} from "../../breditor-experimental-rich-content/src/external_toolbar.js";
import {mountRichFloatingMenu,mountRichMenuBar} from "../../breditor-experimental-rich-content/src/editor_shell.js";
import {richActiveShortcuts} from "../../breditor-experimental-rich-content/src/shortcut_registry.js";
import type {ToolbarControl} from "../../breditor-experimental-rich-content/src/actions.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedToolbarControl} from "../../breditor-collaboration/src/actions.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
// Decoupled ("external") toolbar contract (docs/EDITOR_SHELL.md): the coordinator's own toolbar element moves into a
// validated host container with the same widgets, state, command path, Alt+F10 / Escape bridge and focus return.
const point=(block:string,offset:string)=>({block,offset,affinity:"after" as const});
const range:RichSelection={kind:"text",anchor:point("a","0"),focus:point("a","3")};
const empty:RichSelection={kind:"text",anchor:point("e","0"),focus:point("e","0")};
const element=(type:string,block:string,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
const documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/external-toolbar",version:1},schemaFingerprint:"native fixture",root:element("document","root",[element("paragraph","a",[{kind:"text",text:"seed",formats:[]}]),element("paragraph","e")])});
type Spec={id:string;label:string;fields?:{id:string;label:string;type:"text"}[];enabled:(selection:RichSelection|null)=>boolean;pressed?:()=>boolean};
function specs(state:{bold:boolean}):Spec[]{return [
 {id:"undo",label:"Undo",enabled:()=>false},
 {id:"bold",label:"Bold",enabled:s=>s?.kind==="text",pressed:()=>state.bold},
 {id:"link",label:"Link",fields:[{id:"href",label:"Link URL",type:"text"}],enabled:s=>s?.kind==="text"},
 {id:"bullet",label:"Bulleted list",enabled:()=>true},
];}
type Mode="local"|"shared";
function fixture(mode:Mode,toolbarContainer?:unknown){
 let revision=1,selection:RichSelection|null=range;const calls:{id:string;fields:Record<string,string>}[]=[],errors:unknown[]=[],state={bold:false};
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as RichView);
 const ran=(id:string,fields:Record<string,string>={})=>{calls.push({id,fields});if(id==="bold")state.bold=!state.bold;revision++;};
 const host=document.createElement("div");document.body.append(host);
 const reading=(spec:Spec)=>()=>({kind:"unset" as const,...(spec.pressed?{pressed:spec.pressed()}:{})});
 const shape=(spec:Spec)=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),read:reading(spec)});
 const extra=toolbarContainer===undefined?{}:{toolbarContainer:toolbarContainer as HTMLElement};
 if(mode==="local"){
  const dispose=vi.fn();
  const core={view,execute:vi.fn((command:RichCommand&{id?:string;fields?:Record<string,string>})=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}ran(command.id!,command.fields);return "content";}),dispose} as unknown as RichCoreEditor;
  const toolbar=specs(state).map(spec=>({...shape(spec),enabled:c=>spec.enabled(c.model.view.selection),command:(_c,_v,fields)=>({kind:"externalTest",id:spec.id,fields:{...fields}}) as unknown as RichCommand}) satisfies ToolbarControl);
  const dom=new RichDomEditor(host,{core,toolbar,...extra,onError:e=>errors.push(e)});focusable(dom.surface);
  return {dom,calls,errors,host,state,coreDisposed:()=>dispose.mock.calls.length>0,select:(next:RichSelection|null)=>{dom.execute({kind:"setSelection",selection:next} as RichCommand,false);}};
 }
 const free=vi.fn();
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free,
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json);revision++;return true;},
  dispatch:(_o:unknown,json:string)=>{const batch=JSON.parse(json) as {commands:{data:{id:string;fields:Record<string,string>}}[]};expect(batch.commands).toHaveLength(1);const command=batch.commands[0]!;ran(command.data.id,command.data.fields);return true;}};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 const toolbar=specs(state).map(spec=>({...shape(spec),enabled:c=>spec.enabled(c.model.view.selection),run:(c,_v,fields)=>{c.core.dispatch({commands:[{kind:"external_test",data:{id:spec.id,fields:{...fields}}} as never]},c.revision);}}) satisfies SharedToolbarControl);
 const dom=new SharedDomEditor(host,{core,toolbar,...extra,onError:e=>errors.push(e)});focusable(dom.surface);
 return {dom,calls,errors,host,state,coreDisposed:()=>free.mock.calls.length>0,select:(next:RichSelection|null)=>{core.select(next,core.view().revision);}};
}
function focusable(surface:HTMLElement):void{const remove=surface.removeAttribute.bind(surface);surface.removeAttribute=(name:string)=>{if(name!=="tabindex")remove(name);};surface.tabIndex=0;}
const key=(target:Element,init:KeyboardEventInit)=>{const event=new KeyboardEvent("keydown",{bubbles:true,cancelable:true,...init});target.dispatchEvent(event);return event;};
const action=(root:Element,id:string)=>root.querySelector<HTMLButtonElement>(`[data-rich-action="${id}"],[data-shared-action="${id}"]`)!;
const slot=()=>{const container=document.createElement("header");document.body.prepend(container);return container;};
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});

describe("external toolbar container",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: moves the editor's own toolbar with the same widgets, state and command path`,()=>{
   const f=fixture(mode),container=slot(),toolbar=f.dom.toolbar,bold=action(toolbar,"bold");
   const external=f.dom.mountToolbar(container);
   expect(external.container).toBe(container);expect(external.state()).toEqual({mounted:true});
   expect(external.element.parentElement).toBe(container);expect(toolbar.parentElement).toBe(external.element);
   expect(external.element.hasAttribute("data-breditor-external-toolbar")).toBe(true);
   expect(external.element.hasAttribute(mode==="local"?"data-breditor-rich":"data-breditor-shared")).toBe(true);
   expect(f.host.contains(toolbar)).toBe(false);expect(action(container,"bold")).toBe(bold);
   expect(toolbar.getAttribute("role")).toBe("toolbar");
   // Same command path: one command per activation, Rust-derived pressed state refreshed, focus back to the text.
   expect(bold.getAttribute("aria-pressed")).toBe("false");
   bold.focus();bold.click();
   expect(f.calls.map(c=>c.id)).toEqual(["bold"]);expect(bold.getAttribute("aria-pressed")).toBe("true");expect(document.activeElement).toBe(f.dom.surface);
   // Field controls keep their form: Enter applies once with the draft, Escape in a form cancels and returns.
   const panel=container.querySelector<HTMLDetailsElement>(`[data-${mode==="local"?"rich":"shared"}-control="link"]`)!,input=panel.querySelector("input")!;
   panel.open=true;input.value="https://example.test";input.dispatchEvent(new Event("input",{bubbles:true}));key(input,{key:"Enter"});
   expect(f.calls.at(-1)).toEqual({id:"link",fields:{href:"https://example.test"}});expect(f.calls).toHaveLength(2);expect(document.activeElement).toBe(f.dom.surface);
   panel.open=true;input.focus();key(input,{key:"Escape"});expect(panel.open).toBe(false);expect(document.activeElement).toBe(f.dom.surface);expect(f.calls).toHaveLength(2);
   // Disabled state follows the same Rust-derived gate.
   f.select(null);expect(bold.disabled).toBe(true);expect(action(container,"undo").disabled).toBe(true);
   expect(f.errors).toEqual([]);
  });
  it(`${mode}: Alt+F10 reaches the external toolbar from the editor, Escape returns to the text`,()=>{
   const f=fixture(mode),container=slot(),external=f.dom.mountToolbar(container),surface=f.dom.surface;
   f.dom.focus();
   const event=key(surface,{key:"F10",altKey:true});
   // Undo is disabled, so the first enabled control is Bold.
   expect(event.defaultPrevented).toBe(true);expect(document.activeElement).toBe(action(container,"bold"));
   key(document.activeElement!,{key:"Escape"});expect(document.activeElement).toBe(surface);
   // Other chords and modified Alt+F10 are left alone.
   expect(key(surface,{key:"F10",altKey:true,shiftKey:true}).defaultPrevented).toBe(false);expect(key(surface,{key:"F9",altKey:true}).defaultPrevented).toBe(false);
   expect(document.activeElement).toBe(surface);
   expect(external.focus()).toBe(true);expect(document.activeElement).toBe(action(container,"bold"));
   // Disabled controls (and a disabled field summary) are skipped.
   f.select(null);f.dom.focus();key(surface,{key:"F10",altKey:true});expect(document.activeElement).toBe(action(container,"bullet"));
   external.dispose();
   f.dom.focus();expect(key(surface,{key:"F10",altKey:true}).defaultPrevented).toBe(false);expect(document.activeElement).toBe(surface);
  });
  it(`${mode}: the empty-line block menu keeps Alt+F10 while it is visible`,()=>{
   const f=fixture(mode),container=slot();f.dom.mountToolbar(container);const floating=mountRichFloatingMenu(f.dom),surface=f.dom.surface;
   f.select(empty);f.dom.focus();floating.refresh();expect(floating.state().visible).toBe(true);
   key(surface,{key:"F10",altKey:true});expect(floating.element.contains(document.activeElement)).toBe(true);
   key(document.activeElement!,{key:"Escape"});expect(floating.state().visible).toBe(false);expect(document.activeElement).toBe(surface);
   key(surface,{key:"F10",altKey:true});expect(container.contains(document.activeElement)).toBe(true);
   floating.dispose();
  });
  it(`${mode}: dispose, re-mount elsewhere and editor disposal`,()=>{
   const f=fixture(mode),first=slot(),second=slot(),toolbar=f.dom.toolbar;
   const external=f.dom.mountToolbar(first);
   expect(f.dom.externalToolbar()).toBe(external);expect(()=>f.dom.mountToolbar(second)).toThrow("already mounted in an external container");
   action(first,"bold").focus();
   external.dispose();external.dispose();
   expect(external.state()).toEqual({mounted:false});expect(first.childElementCount).toBe(0);expect(f.dom.externalToolbar()).toBeNull();
   // Back in the editor root in its original place, and focus returned to the text.
   expect(toolbar.parentElement).toBe(f.host);expect(toolbar.nextElementSibling).toBe(f.dom.surface);expect(document.activeElement).toBe(f.dom.surface);
   expect(external.focus()).toBe(false);
   const moved=f.dom.mountToolbar(second);expect(toolbar.parentElement).toBe(moved.element);expect(second.contains(toolbar)).toBe(true);
   action(second,"bold").click();expect(f.calls.map(c=>c.id)).toEqual(["bold"]);
   // The first container is free again (for this or another editor).
   expect(()=>checkRichToolbarContainer(first,f.host)).not.toThrow();
   f.dom.dispose();
   expect(moved.state()).toEqual({mounted:false});expect(second.childElementCount).toBe(0);expect(f.host.childElementCount).toBe(0);expect(f.coreDisposed()).toBe(true);
   expect(()=>f.dom.mountToolbar(first)).toThrow("disposed");
  });
  it(`${mode}: the constructor option mounts at startup and is validated before the root changes`,()=>{
   const container=slot(),f=fixture(mode,container);
   expect(container.querySelector("[data-breditor-external-toolbar]>[role=toolbar]")).toBe(f.dom.toolbar);
   expect(f.host.querySelector("[role=toolbar]")).toBeNull();expect(f.dom.externalToolbar()?.container).toBe(container);
   expect(()=>f.dom.mountToolbar(slot())).toThrow("already mounted");
   const before=document.createElement("p");before.textContent="host content";
   const detached=document.createElement("div");
   // A rejected container leaves the host untouched.
   const host=document.createElement("div");host.append(before);document.body.append(host);
   expect(()=>mode==="local"?new RichDomEditor(host,{core:{view:()=>{throw Error("not reached");}} as never,toolbarContainer:detached}):new SharedDomEditor(host,{core:{selectionPolicy:()=>"original",view:()=>{throw Error("not reached");}} as never,toolbarContainer:detached})).toThrow();
   expect(host.firstChild).toBe(before);
   expect(()=>fixture(mode,detached)).toThrow("must be connected");
   f.dom.dispose();expect(container.childElementCount).toBe(0);
  });
  it(`${mode}: rejects invalid, editable, nested and foreign containers`,()=>{
   const f=fixture(mode),mount=(container:unknown)=>()=>f.dom.mountToolbar(container as HTMLElement);
   expect(mount(null)).toThrow(TypeError);expect(mount({nodeType:1})).toThrow(TypeError);expect(mount(document.createTextNode("x"))).toThrow(TypeError);
   expect(mount(document.createElement("div"))).toThrow("must be connected");
   const other=document.implementation.createHTMLDocument("other"),foreign=other.createElement("div");other.body.append(foreign);
   expect(mount(foreign)).toThrow("editor's document");
   expect(mount(f.host)).toThrow("outside the editor root");
   const inRoot=document.createElement("div");f.host.append(inRoot);expect(mount(inRoot)).toThrow("outside the editor root");inRoot.remove();
   expect(mount(f.dom.surface)).toThrow("outside the editor root");
   const editable=document.createElement("div");editable.setAttribute("contenteditable","true");const inner=document.createElement("span");editable.append(inner);document.body.append(editable);
   expect(mount(editable)).toThrow("editable content");expect(mount(inner)).toThrow("editable content");
   const inert=document.createElement("div");inert.setAttribute("contenteditable","false");document.body.append(inert);expect(()=>mount(inert)().dispose()).not.toThrow();
   expect(f.errors).toEqual([]);
  });
 }
 it("two editors on one page each own their external toolbar; cross-editor use rejects",()=>{
  const a=fixture("local"),b=fixture("shared"),slotA=slot(),slotB=slot();
  const ta=a.dom.mountToolbar(slotA),tb=b.dom.mountToolbar(slotB);
  // A container that already holds one editor's toolbar, or sits inside another editor or its toolbar, is refused.
  expect(()=>a.dom.mountToolbar(slotB)).toThrow();ta.dispose();
  expect(()=>a.dom.mountToolbar(slotB)).toThrow("already holds another editor's toolbar");
  expect(()=>a.dom.mountToolbar(tb.element)).toThrow("inside another editor");
  expect(()=>a.dom.mountToolbar(b.host)).toThrow("inside another editor");
  const inB=document.createElement("div");b.host.append(inB);expect(()=>a.dom.mountToolbar(inB)).toThrow("inside another editor");
  const again=a.dom.mountToolbar(slotA);
  // Each toolbar runs its own editor's command path and focus return.
  action(slotA,"bold").click();expect(a.calls.map(c=>c.id)).toEqual(["bold"]);expect(b.calls).toEqual([]);expect(document.activeElement).toBe(a.dom.surface);
  action(slotB,"bullet").click();expect(b.calls.map(c=>c.id)).toEqual(["bullet"]);expect(a.calls).toHaveLength(1);expect(document.activeElement).toBe(b.dom.surface);
  // Alt+F10 in each editor reaches only its own toolbar.
  a.dom.focus();key(a.dom.surface,{key:"F10",altKey:true});expect(slotA.contains(document.activeElement)).toBe(true);
  b.dom.focus();key(b.dom.surface,{key:"F10",altKey:true});expect(slotB.contains(document.activeElement)).toBe(true);
  // Disposing one editor leaves the other's toolbar in place.
  a.dom.dispose();expect(again.state().mounted).toBe(false);expect(slotA.childElementCount).toBe(0);expect(tb.state().mounted).toBe(true);expect(slotB.contains(b.dom.toolbar)).toBe(true);
  tb.dispose();expect(b.host.contains(b.dom.toolbar)).toBe(true);
 });
 it("context UI port: mountRichExternalToolbar and the shortcut registry",()=>{
  const f=fixture("local"),container=slot();
  expect(()=>mountRichExternalToolbar({surface:f.dom.surface} as never,container)).toThrow(TypeError);
  const external=mountRichExternalToolbar(f.dom,container);
  expect(richActiveShortcuts(f.dom).find(entry=>entry.id==="ui:editor-toolbar")).toEqual({id:"ui:editor-toolbar",group:"interface",label:"Move focus to the editor toolbar",keys:[{key:"F10",alt:true}]});
  // The menu bar, mounted later, still goes into the editor root, not the external container.
  const bar=mountRichMenuBar(f.dom);expect(f.host.contains(bar.element)).toBe(true);expect(container.contains(bar.element)).toBe(false);
  bar.dispose();external.dispose();
  expect(richActiveShortcuts(f.dom).some(entry=>entry.id==="ui:editor-toolbar")).toBe(false);
 });
});
