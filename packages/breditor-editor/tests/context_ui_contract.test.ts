import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {mountRichSelectionToolbar,mountRichContextMenu} from "../../breditor-experimental-rich-content/src/context_ui.js";
import type {ToolbarControl} from "../../breditor-experimental-rich-content/src/actions.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedToolbarControl} from "../../breditor-collaboration/src/actions.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
const point=(block:string,offset:string)=>({block,offset,affinity:"after" as const});
const range:RichSelection={kind:"text",anchor:point("a","0"),focus:point("a","3")};
const caret:RichSelection={kind:"text",anchor:point("a","1"),focus:point("a","1")};
const element=(type:string,block:string,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
const documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/context-ui",version:1},schemaFingerprint:"native fixture",root:element("document","root",[element("paragraph","a",[{kind:"text",text:"seed",formats:[]}]),element("paragraph","b",[{kind:"text",text:"more",formats:[]}])])});
type Spec={id:string;label:string;fields?:{id:string;label:string;type:"text"}[];enabled:(selection:RichSelection|null)=>boolean;pressed?:()=>boolean};
/** One control/state contract per id; local and shared lower it through their own existing command paths. */
function specs(state:{bold:boolean}):Spec[]{return [
 {id:"undo",label:"Undo",enabled:()=>false},
 {id:"bold",label:"Bold",enabled:s=>s?.kind==="text",pressed:()=>state.bold},
 {id:"italic",label:"Italic",enabled:s=>s?.kind==="text",pressed:()=>false},
 {id:"link",label:"Link",fields:[{id:"href",label:"Link URL",type:"text"}],enabled:s=>s?.kind==="text"},
 {id:"table",label:"Insert table",enabled:()=>true},
];}
function fixture(mode:"local"|"shared"){
 let revision=1,selection:RichSelection|null=range,readOnly=false;const calls:{id:string;fields:Record<string,string>}[]=[],errors:unknown[]=[],state={bold:false};
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(readOnly?{readOnly:true,readOnlyRevision:String(revision)}:{})} as RichView);
 const ran=(id:string,fields:Record<string,string>={})=>{calls.push({id,fields});if(id==="bold")state.bold=!state.bold;revision++;};
 const host=document.createElement("div");document.body.append(host);
 const reading=(spec:Spec)=>()=>({kind:"unset" as const,...(spec.pressed?{pressed:spec.pressed()}:{})});
 if(mode==="local"){
  const core={view,supportsReadOnly:()=>true,setReadOnly:(value:boolean)=>{readOnly=value;revision++;return true;},execute:vi.fn((command:RichCommand&{id?:string;fields?:Record<string,string>})=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}ran(command.id!,command.fields);return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
  const toolbar=specs(state).map(spec=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),read:reading(spec),enabled:c=>spec.enabled(c.model.view.selection),command:(_c,_v,fields)=>({kind:"contextTest",id:spec.id,fields:{...fields}}) as unknown as RichCommand}) satisfies ToolbarControl);
  const dom=new RichDomEditor(host,{core,toolbar,onError:e=>errors.push(e)});focusable(dom.surface);
  return {dom,calls,errors,host,state,select:(next:RichSelection|null)=>{dom.execute({kind:"setSelection",selection:next} as RichCommand,false);},setReadOnly:(value:boolean)=>dom.setReadOnly(value)};
 }
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free:vi.fn(),
  read_only_version:()=>"1",set_read_only:(_o:unknown,value:boolean)=>{readOnly=value;revision++;return true;},
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json);revision++;return true;},
  dispatch:(_o:unknown,json:string)=>{const command=(JSON.parse(json) as {commands:{data:{id:string;fields:Record<string,string>}}[]}).commands[0]!;ran(command.data.id,command.data.fields);return true;}};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 const toolbar=specs(state).map(spec=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),read:reading(spec),enabled:c=>spec.enabled(c.model.view.selection),run:(c,_v,fields)=>{c.core.dispatch({commands:[{kind:"context_test",data:{id:spec.id,fields:{...fields}}} as never]},c.revision);}}) satisfies SharedToolbarControl);
 const dom=new SharedDomEditor(host,{core,toolbar,onError:e=>errors.push(e)});focusable(dom.surface);
 return {dom,calls,errors,host,state,select:(next:RichSelection|null)=>{core.select(next,core.view().revision);},setReadOnly:(value:boolean)=>{core.setReadOnly(value,core.view().revision);}};
}
/** jsdom lacks contenteditable focus; keep the test surface focusable across renders. */
function focusable(surface:HTMLElement):void{const remove=surface.removeAttribute.bind(surface);surface.removeAttribute=(name:string)=>{if(name!=="tabindex")remove(name);};surface.tabIndex=0;}
const key=(target:HTMLElement,init:KeyboardEventInit)=>{const event=new KeyboardEvent("keydown",{bubbles:true,cancelable:true,...init});target.dispatchEvent(event);return event;};
const action=(root:HTMLElement,id:string)=>root.querySelector<HTMLButtonElement>(`[data-rich-action="${id}"],[data-shared-action="${id}"]`)!;
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});
describe("contextual UI borrows the standard toolbar contract",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: exposes only admitted controls and keeps leases outside editable content`,()=>{
   const f=fixture(mode);expect(f.dom.contextControlIds()).toEqual(["undo","bold","italic","link","table"]);
   const outside=document.createElement("div");document.body.append(outside);const abort=new AbortController();
   expect(()=>f.dom.mountContextControl(outside,"missing",abort.signal)).toThrow("not admitted");
   expect(()=>f.dom.mountContextControl(f.dom.surface,"bold",abort.signal)).toThrow("outside editable content");
   const view=f.dom.mountContextControl(outside,"bold",abort.signal);expect(view.button.getAttribute("aria-pressed")).toBe("false");
   abort.abort();expect(outside.childElementCount).toBe(0);
   expect(()=>mountRichSelectionToolbar(f.dom,{controls:["missing"]})).toThrow("not admitted");
   const toolbar=mountRichSelectionToolbar(f.dom);expect(toolbar.state().controls).toEqual(["bold","italic","link"]);
   expect(()=>mountRichSelectionToolbar(f.dom)).toThrow("already has a selection toolbar");toolbar.dispose();mountRichSelectionToolbar(f.dom).dispose();
  });
  it(`${mode}: floating toolbar follows Rust selection, state, focus, composition and read-only policy`,()=>{
   const f=fixture(mode),toolbar=mountRichSelectionToolbar(f.dom),surface=f.dom.surface;
   expect(toolbar.element.hidden).toBe(true);
   f.dom.focus();expect(toolbar.state().visible).toBe(true);expect(toolbar.element.getAttribute("role")).toBe("toolbar");
   const bold=action(toolbar.element,"bold");expect(bold.getAttribute("aria-pressed")).toBe("false");expect(bold.disabled).toBe(false);
   // The same button state is shared with the standard toolbar after a publication.
   bold.click();expect(f.calls.map(c=>c.id)).toEqual(["bold"]);expect(document.activeElement).toBe(surface);
   expect(action(toolbar.element,"bold").getAttribute("aria-pressed")).toBe("true");expect(action(f.dom.toolbar,"bold").getAttribute("aria-pressed")).toBe("true");
   f.select(caret);expect(toolbar.state().visible).toBe(false);
   f.select(range);expect(toolbar.state().visible).toBe(true);
   surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));expect(toolbar.state().visible).toBe(false);
   surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:""}));
   f.setReadOnly(true);toolbar.refresh();expect(toolbar.state().visible).toBe(false);
   f.setReadOnly(false);f.dom.focus();toolbar.refresh();expect(toolbar.state().visible).toBe(true);
   const outside=document.createElement("input");document.body.append(outside);outside.focus();toolbar.refresh();expect(toolbar.state().visible).toBe(false);
   expect(f.errors).toEqual([]);toolbar.dispose();
  });
  it(`${mode}: keyboard reachability, roving, Escape dismissal and focus return`,()=>{
   const f=fixture(mode),toolbar=mountRichSelectionToolbar(f.dom),surface=f.dom.surface;f.dom.focus();
   const enter=key(surface,{key:"F10",altKey:true});expect(enter.defaultPrevented).toBe(true);expect(document.activeElement).toBe(action(toolbar.element,"bold"));
   key(document.activeElement as HTMLElement,{key:"ArrowRight"});expect(document.activeElement).toBe(action(toolbar.element,"italic"));
   key(document.activeElement as HTMLElement,{key:"ArrowRight"});expect((document.activeElement as HTMLElement).tagName).toBe("SUMMARY");
   key(document.activeElement as HTMLElement,{key:"ArrowRight"});expect(document.activeElement).toBe(action(toolbar.element,"bold"));
   key(document.activeElement as HTMLElement,{key:"End"});expect((document.activeElement as HTMLElement).tagName).toBe("SUMMARY");
   key(document.activeElement as HTMLElement,{key:"Escape"});expect(document.activeElement).toBe(surface);expect(toolbar.state().visible).toBe(false);
   // Dismissal lasts until the next publication.
   f.select(range.kind==="text"?{...range,focus:point("a","4")}:range);toolbar.refresh();expect(toolbar.state().visible).toBe(true);
   expect(toolbar.focus()).toBe(true);expect(document.activeElement).toBe(action(toolbar.element,"bold"));
   key(surface,{key:"Escape"});expect(toolbar.state().visible).toBe(false);toolbar.dispose();
  });
  it(`${mode}: field controls reuse stale-draft rejection and repositioning follows scroll/resize`,()=>{
   const f=fixture(mode),toolbar=mountRichSelectionToolbar(f.dom),surface=f.dom.surface;
   let top=200;vi.spyOn(surface,"getBoundingClientRect").mockImplementation(()=>({top,left:100,right:500,bottom:top+300,width:400,height:300,x:100,y:top,toJSON:()=>({})}) as DOMRect);
   f.dom.focus();toolbar.refresh();expect(toolbar.element.style.top).toBe("192px");
   top=320;window.dispatchEvent(new Event("scroll"));expect(toolbar.element.style.top).toBe("312px");
   top=4;window.dispatchEvent(new Event("resize"));expect(toolbar.element.style.top).toBe("312px");
   const panel=toolbar.element.querySelector<HTMLDetailsElement>("details")!,input=panel.querySelector("input")!;
   panel.open=true;input.focus();expect(toolbar.state().visible).toBe(true);
   input.value="https://example.com/";input.dispatchEvent(new Event("input",{bubbles:true}));
   f.select({kind:"text",anchor:point("a","0"),focus:point("a","2")});
   action(toolbar.element,"link").click();expect(f.calls).toEqual([]);expect(f.errors.map(e=>(e as Error).message)).toEqual(["Formatting form is stale. Press Escape and reopen it."]);
   key(input,{key:"Escape"});expect(document.activeElement).toBe(surface);
   panel.open=true;input.value="https://example.com/";input.dispatchEvent(new Event("input",{bubbles:true}));action(toolbar.element,"link").click();
   expect(f.calls).toEqual([{id:"link",fields:{href:"https://example.com/"}}]);expect(document.activeElement).toBe(surface);toolbar.dispose();
  });
  it(`${mode}: context menu opens from pointer and keyboard, hides disabled items and returns focus`,()=>{
   const f=fixture(mode),menu=mountRichContextMenu(f.dom,{controls:["undo","bold","italic","table"]}),surface=f.dom.surface;f.dom.focus();
   const right=new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:40,clientY:50});surface.dispatchEvent(right);
   expect(right.defaultPrevented).toBe(true);expect(menu.state().open).toBe(true);expect(menu.element.getAttribute("role")).toBe("menu");
   expect(action(menu.element,"undo").parentElement!.hidden).toBe(true);
   const bold=action(menu.element,"bold");expect(document.activeElement).toBe(bold);expect(bold.getAttribute("role")).toBe("menuitemcheckbox");expect(bold.getAttribute("aria-checked")).toBe("false");
   expect(action(menu.element,"table").getAttribute("role")).toBe("menuitem");
   key(bold,{key:"ArrowDown"});expect(document.activeElement).toBe(action(menu.element,"italic"));
   key(document.activeElement as HTMLElement,{key:"ArrowUp"});key(document.activeElement as HTMLElement,{key:"ArrowUp"});expect(document.activeElement).toBe(action(menu.element,"table"));
   key(document.activeElement as HTMLElement,{key:"Escape"});expect(menu.state().open).toBe(false);expect(document.activeElement).toBe(surface);
   const shortcut=key(surface,{key:"F10",shiftKey:true});expect(shortcut.defaultPrevented).toBe(true);expect(menu.state().open).toBe(true);expect(document.activeElement!.getAttribute("role")).toBe("menuitemcheckbox");
   (document.activeElement as HTMLButtonElement).click();expect(f.calls.map(c=>c.id)).toEqual(["bold"]);expect(menu.state().open).toBe(false);expect(document.activeElement).toBe(surface);
   expect(key(surface,{key:"ContextMenu"}).defaultPrevented).toBe(true);expect(action(menu.element,"bold").getAttribute("aria-checked")).toBe("true");
   f.setReadOnly(true);expect(menu.state().open).toBe(false);
   const blocked=new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:40,clientY:50});surface.dispatchEvent(blocked);expect(blocked.defaultPrevented).toBe(false);
   f.setReadOnly(false);expect(menu.open({x:5,y:5})).toBe(true);document.body.dispatchEvent(new MouseEvent("pointerdown",{bubbles:true}));expect(menu.state().open).toBe(false);
   expect(f.errors).toEqual([]);menu.dispose();expect(menu.element.isConnected).toBe(false);
  });
  it(`${mode}: editor disposal tears down contextual UI and leases`,()=>{
   const f=fixture(mode),toolbar=mountRichSelectionToolbar(f.dom),menu=mountRichContextMenu(f.dom);
   const borrowed=toolbar.element.querySelectorAll("button").length;expect(borrowed).toBe(3);
   f.dom.dispose();expect(toolbar.state().disposed).toBe(true);expect(menu.state().disposed).toBe(true);expect(toolbar.element.isConnected).toBe(false);expect(menu.open()).toBe(false);
   expect(()=>f.dom.mountContextControl(document.body,"bold",new AbortController().signal)).toThrow();
  });
 }
});
