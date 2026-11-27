import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {planRichToolbarLayout,type RichToolbarLayout} from "../../breditor-experimental-rich-content/src/toolbar_layout.js";
import type {ToolbarControl} from "../../breditor-experimental-rich-content/src/actions.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedToolbarControl} from "../../breditor-collaboration/src/actions.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";

const point=(block:string,offset:string)=>({block,offset,affinity:"after" as const});
const range:RichSelection={kind:"text",anchor:point("a","0"),focus:point("a","3")};
const element=(type:string,block:string,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
const documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/toolbar-layout",version:1},schemaFingerprint:"native fixture",root:element("document","root",[element("paragraph","a",[{kind:"text",text:"seed",formats:[]}])])});
type Spec={id:string;label:string;fields?:{id:string;label:string;type:"text"}[];enabled:(selection:RichSelection|null)=>boolean;pressed?:(state:{bold:boolean;italic:boolean|"mixed"})=>boolean|"mixed"};
const specs:Spec[]=[
 {id:"undo",label:"Undo",enabled:()=>false},
 {id:"redo",label:"Redo",enabled:()=>true},
 {id:"bold",label:"Bold",enabled:s=>s?.kind==="text",pressed:state=>state.bold},
 {id:"italic",label:"Italic",enabled:s=>s?.kind==="text",pressed:state=>state.italic},
 {id:"link",label:"Link",fields:[{id:"href",label:"Link URL",type:"text"}],enabled:s=>s?.kind==="text"},
 {id:"table",label:"Insert table",enabled:()=>true},
 {id:"bullet",label:"Bulleted list",enabled:()=>true},
];
const group={kind:"group" as const,id:"text",label:"Text style",items:["bold","italic","link"]};
function fixture(mode:"local"|"shared",toolbarLayout:RichToolbarLayout|undefined,host=document.createElement("div")){
 let revision=1,selection:RichSelection|null=range;const calls:string[]=[],errors:unknown[]=[],state={bold:false,italic:false as boolean|"mixed"};
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as unknown as RichView);
 const ran=(id:string)=>{calls.push(id);if(id==="bold")state.bold=!state.bold;revision++;};
 if(!host.isConnected)document.body.append(host);
 const shape=(spec:Spec)=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),read:()=>({kind:"unset" as const,...(spec.pressed?{pressed:spec.pressed(state)}:{})})});
 const layout=toolbarLayout?{toolbarLayout}:{};
 if(mode==="local"){
  const core={view,execute:vi.fn((command:RichCommand&{id?:string})=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}ran(command.id!);return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
  const toolbar=specs.map(spec=>({...shape(spec),enabled:c=>spec.enabled(c.model.view.selection),command:()=>({kind:"layoutTest",id:spec.id}) as unknown as RichCommand}) satisfies ToolbarControl);
  const dom=new RichDomEditor(host,{core,toolbar,...layout,onError:e=>errors.push(e)});focusable(dom.surface);
  return {dom,calls,errors,host,state,select:(next:RichSelection|null)=>{dom.execute({kind:"setSelection",selection:next} as RichCommand,false);},refresh:()=>dom.execute({kind:"setSelection",selection} as RichCommand,false)};
 }
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free:vi.fn(),
  read_only_version:()=>"1",set_read_only:()=>true,
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json);revision++;return true;},
  dispatch:(_o:unknown,json:string)=>{const batch=JSON.parse(json) as {commands:{data:{id:string}}[]};expect(batch.commands).toHaveLength(1);ran(batch.commands[0]!.data.id);return true;}};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 const toolbar=specs.map(spec=>({...shape(spec),enabled:c=>spec.enabled(c.model.view.selection),run:c=>{c.core.dispatch({commands:[{kind:"layout_test",data:{id:spec.id}} as never]},c.revision);}}) satisfies SharedToolbarControl);
 const dom=new SharedDomEditor(host,{core,toolbar,...layout,onError:e=>errors.push(e)});focusable(dom.surface);
 return {dom,calls,errors,host,state,select:(next:RichSelection|null)=>{core.select(next,core.view().revision);},refresh:()=>core.select(selection,core.view().revision)};
}
function focusable(surface:HTMLElement):void{const remove=surface.removeAttribute.bind(surface);surface.removeAttribute=(name:string)=>{if(name!=="tabindex")remove(name);};surface.tabIndex=0;}
const key=(target:Element,init:KeyboardEventInit)=>{const event=new KeyboardEvent("keydown",{bubbles:true,cancelable:true,...init});target.dispatchEvent(event);return event;};
const action=(root:Element,id:string)=>root.querySelector<HTMLButtonElement>(`[data-rich-action="${id}"],[data-shared-action="${id}"]`)!;
const groupButton=(root:Element,id:string)=>root.querySelector<HTMLButtonElement>(`[data-breditor-toolbar-group-button="${id}"]`)!;
const more=(root:Element)=>root.querySelector<HTMLButtonElement>("[data-breditor-toolbar-more]")!;
const tabStops=(toolbar:Element)=>[...toolbar.querySelectorAll<HTMLElement>("button,summary,input,select")].filter(node=>node.tabIndex===0&&!(node as HTMLButtonElement).disabled&&!node.closest("[hidden]"));
/** Lays every top-level row item out at 100px; a row is `width` wide. */
function stubGeometry(width:{value:number}):void{
 const rect=(left:number,right:number)=>({left,right,top:0,bottom:20,x:left,y:0,width:right-left,height:20,toJSON:()=>({})}) as DOMRect;
 vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
  if(this.classList.contains("breditor-toolbar-row"))return rect(0,width.value);
  const row=this.parentElement;if(!row?.classList.contains("breditor-toolbar-row"))return rect(0,0);
  const index=[...row.children].filter(child=>!(child as HTMLElement).hidden).indexOf(this);return rect(index*100,index*100+100);
 });
}
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});

describe("toolbar layout validation",()=>{
 const admitted=specs.map(spec=>spec.id);
 it("accepts shorthands and typed entries, and appends unlisted admitted controls",()=>{
  const plan=planRichToolbarLayout({items:["undo","redo","|",group,"-","table"]},admitted);
  expect(plan.groupWhenFull).toBe(false);
  expect(plan.rows.map(row=>row.map(item=>item.kind==="separator"?"|":item.id))).toEqual([["undo","redo","|","text"],["table","|","bullet"]]);
  const typed=planRichToolbarLayout({items:["undo",{kind:"separator"},"redo",{kind:"break"},"table","bullet","bold","italic","link"]},admitted);
  expect(typed.rows.map(row=>row.length)).toEqual([3,5]);
  expect(Object.isFrozen(typed)&&Object.isFrozen(typed.rows[0])&&Object.isFrozen(typed.rows[0]![0])).toBe(true);
 });
 it("rejects malformed layouts with typed errors",()=>{
  const plan=(layout:unknown)=>()=>planRichToolbarLayout(layout,admitted);
  expect(plan(null)).toThrow(TypeError);
  expect(plan({items:[]})).toThrow("Expected 1 to 128");
  expect(plan({items:["bold"],extra:true})).toThrow("Unknown toolbar layout field");
  expect(plan({items:["missing"]})).toThrow("not admitted");
  expect(plan({items:["bold","bold"]})).toThrow("more than once");
  expect(plan({items:["bold",{...group}]})).toThrow("more than once");
  expect(plan({items:[{...group,items:["missing"]}]})).toThrow("not admitted");
  expect(plan({items:[{...group,items:[]}]})).toThrow("Expected 1 to 32");
  expect(plan({items:[{...group,id:"Text"}]})).toThrow("lowercase toolbar group id");
  expect(plan({items:[{...group,id:"bold",items:["italic"]}]})).toThrow("not unique");
  expect(plan({items:[group,{...group,items:["table"]}]})).toThrow("not unique");
  expect(plan({items:[{...group,label:" "}]})).toThrow("group label");
  expect(plan({items:[{...group,colour:"red"}]})).toThrow("Unknown toolbar group field");
  expect(plan({items:["|","bold"]})).toThrow("must follow an item");
  expect(plan({items:["bold","|","|","italic"]})).toThrow("must follow an item");
  expect(plan({items:["bold","|"]})).toThrow("cannot end with a separator");
  expect(plan({items:["bold","|","-","italic"]})).toThrow("cannot end with a separator");
  expect(plan({items:["-","bold"]})).toThrow("must follow an item");
  expect(plan({items:["bold","-"]})).toThrow("cannot end with a row break");
  expect(plan({items:["bold","-","italic"],groupWhenFull:true})).toThrow("groupWhenFull cannot be combined");
  expect(plan({items:["bold"],groupWhenFull:"yes"})).toThrow("boolean groupWhenFull");
  expect(plan({items:[{kind:"menu"}]})).toThrow("entry kind");
  expect(plan({items:[{kind:"separator",size:2}]})).toThrow("Unknown toolbar separator field");
 });
 for(const mode of ["local","shared"] as const)it(`${mode}: an invalid layout rejects at mount before touching the host`,()=>{
  const host=document.createElement("div");host.textContent="Keep host";document.body.append(host);
  expect(()=>fixture(mode,{items:["bold","missing"]},host)).toThrow("not admitted");
  expect(host.textContent).toBe("Keep host");expect(host.dataset["breditorRich"]??host.dataset["breditorShared"]).toBeUndefined();
 });
});

describe("laid-out standard toolbar keeps the one control contract",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: rows, separators and a dropdown group with WAI-ARIA roles`,()=>{
   const f=fixture(mode,{items:["undo","redo","|",group,"-","table"]}),toolbar=f.dom.toolbar;
   expect(toolbar.getAttribute("role")).toBe("toolbar");expect(toolbar.dataset["breditorToolbarLayout"]).toBe("rows");
   const rows=[...toolbar.querySelectorAll(":scope>.breditor-toolbar-row")];expect(rows).toHaveLength(2);
   expect(rows.map(row=>[...row.children].map(child=>child.getAttribute("role")==="separator"?"|":(child as HTMLElement).dataset["breditorToolbarGroup"]??(child as HTMLElement).dataset[`${mode==="local"?"rich":"shared"}Control`]))).toEqual([["undo","redo","|","text"],["table","|","bullet"]]);
   const button=groupButton(toolbar,"text"),popup=document.getElementById(button.getAttribute("aria-controls")!)!;
   expect([button.textContent,button.getAttribute("aria-expanded"),popup.getAttribute("role"),popup.getAttribute("aria-labelledby"),popup.hidden]).toEqual(["Text style","false","group",button.id,true]);
   expect([...popup.children].map(child=>(child as HTMLElement).dataset[`${mode==="local"?"rich":"shared"}Control`])).toEqual(["bold","italic","link"]);
   expect([...toolbar.querySelectorAll("[role=separator]")].map(node=>node.getAttribute("aria-orientation"))).toEqual(["vertical","vertical"]);
   // One roving tab stop: disabled Undo is skipped, so Redo carries it.
   expect(tabStops(toolbar)).toEqual([action(toolbar,"redo")]);
   expect(f.dom.toolbarLayoutState()).toEqual({open:null,overflow:[],groups:{text:{enabled:true,activation:"inactive"}}});
   expect(f.errors).toEqual([]);
  });
  it(`${mode}: arrows rove the single tab stop, RTL mirrors them, Escape returns to the editor`,()=>{
   const f=fixture(mode,{items:["undo","redo","|",group,"-","table"]}),toolbar=f.dom.toolbar,redo=action(toolbar,"redo"),text=groupButton(toolbar,"text"),table=action(toolbar,"table"),bullet=action(toolbar,"bullet");
   redo.focus();expect(key(redo,{key:"ArrowRight"}).defaultPrevented).toBe(true);expect(document.activeElement).toBe(text);expect(tabStops(toolbar)).toEqual([text]);
   key(text,{key:"ArrowRight"});expect(document.activeElement).toBe(table);
   key(table,{key:"End"});expect(document.activeElement).toBe(bullet);key(bullet,{key:"ArrowRight"});expect(document.activeElement).toBe(redo);
   key(redo,{key:"ArrowLeft"});expect(document.activeElement).toBe(bullet);key(bullet,{key:"Home"});expect(document.activeElement).toBe(redo);
   toolbar.setAttribute("dir","rtl");key(redo,{key:"ArrowLeft"});expect(document.activeElement).toBe(text);toolbar.removeAttribute("dir");
   key(text,{key:"Escape"});expect(document.activeElement).toBe(f.dom.surface);
   table.focus();key(table,{key:"Escape"});expect(document.activeElement).toBe(f.dom.surface);
   expect(f.errors).toEqual([]);
  });
  it(`${mode}: a dropdown group opens from the keyboard, runs members through the same command path and aggregates state`,()=>{
   const f=fixture(mode,{items:["undo","redo","|",group,"table"]}),toolbar=f.dom.toolbar,text=groupButton(toolbar,"text");
   const popup=document.getElementById(text.getAttribute("aria-controls")!)!,bold=action(popup,"bold"),italic=action(popup,"italic"),summary=popup.querySelector("summary")!;
   text.focus();expect(key(text,{key:"ArrowDown"}).defaultPrevented).toBe(true);
   expect([popup.hidden,text.getAttribute("aria-expanded"),f.dom.toolbarLayoutState()!.open]).toEqual([false,"true","text"]);expect(document.activeElement).toBe(bold);
   key(bold,{key:"ArrowDown"});expect(document.activeElement).toBe(italic);key(italic,{key:"ArrowDown"});expect(document.activeElement).toBe(summary);
   key(summary,{key:"ArrowDown"});expect(document.activeElement).toBe(bold);key(bold,{key:"ArrowUp"});expect(document.activeElement).toBe(summary);key(summary,{key:"Home"});expect(document.activeElement).toBe(bold);
   // Escape on a member closes the group onto its button before the widget's own Escape; Escape again leaves.
   key(bold,{key:"Escape"});expect([popup.hidden,document.activeElement]).toEqual([true,text]);
   key(text,{key:"ArrowUp"});expect(document.activeElement).toBe(summary);key(summary,{key:"Escape"});expect(document.activeElement).toBe(text);
   // Keyboard activation (detail 0) opens onto the first member; the member runs once and focus returns to the editor.
   text.click();expect(document.activeElement).toBe(bold);
   bold.click();expect(f.calls).toEqual(["bold"]);expect(popup.hidden).toBe(true);expect(document.activeElement).toBe(f.dom.surface);
   expect(bold.getAttribute("aria-pressed")).toBe("true");expect(text.dataset["breditorGroupState"]).toBe("active");
   expect(f.dom.toolbarLayoutState()!.groups["text"]).toEqual({enabled:true,activation:"active"});
   bold.click();expect(f.calls).toEqual(["bold","bold"]);expect(text.dataset["breditorGroupState"]).toBe("inactive");
   f.state.italic="mixed";f.refresh();expect(text.dataset["breditorGroupState"]).toBe("mixed");
   // Every member disabled: the group is aria-disabled, skipped by roving and does not open.
   f.select(null);expect([text.getAttribute("aria-disabled"),bold.disabled]).toEqual(["true",true]);expect(tabStops(toolbar)).toEqual([action(toolbar,"redo")]);
   text.click();expect(popup.hidden).toBe(true);
   expect(f.errors).toEqual([]);
  });
  it(`${mode}: pointer opening keeps editor focus and a pointer-down outside closes the group`,()=>{
   const f=fixture(mode,{items:[group]}),toolbar=f.dom.toolbar,text=groupButton(toolbar,"text"),popup=document.getElementById(text.getAttribute("aria-controls")!)!;
   f.dom.focus();const down=new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0});text.dispatchEvent(down);expect(down.defaultPrevented).toBe(true);
   text.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,detail:1}));expect(popup.hidden).toBe(false);expect(document.activeElement).toBe(f.dom.surface);
   f.dom.surface.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0}));expect(popup.hidden).toBe(true);
   text.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,detail:1}));action(popup,"italic").click();expect(f.calls).toEqual(["italic"]);expect(popup.hidden).toBe(true);
   expect(f.errors).toEqual([]);
  });
  it(`${mode}: group-when-full moves trailing items into "Show more items" and back`,()=>{
   const width={value:1000};stubGeometry(width);
   const f=fixture(mode,{items:["undo","redo","|",group,"|","table","bullet"],groupWhenFull:true}),toolbar=f.dom.toolbar,button=more(toolbar);
   expect(toolbar.dataset["breditorToolbarLayout"]).toBe("group-when-full");
   expect([button.textContent,button.closest<HTMLElement>(".breditor-toolbar-overflow")!.hidden,f.dom.toolbarLayoutState()!.overflow]).toEqual(["Show more items",true,[]]);
   const bullet=action(toolbar,"bullet");bullet.focus();
   width.value=450;window.dispatchEvent(new Event("resize"));
   const popup=document.getElementById(button.getAttribute("aria-controls")!)!;
   expect(f.dom.toolbarLayoutState()!.overflow).toEqual(["text","table","bullet"]);expect(button.closest<HTMLElement>(".breditor-toolbar-overflow")!.hidden).toBe(false);
   expect(popup.contains(bullet)).toBe(true);expect(document.activeElement).toBe(button);expect(tabStops(toolbar)).toEqual([button]);
   // The trailing separator travelled too; inside the popup separators are horizontal.
   expect([...button.closest(".breditor-toolbar-row")!.children].filter(child=>!(child as HTMLElement).hidden).map(child=>child.getAttribute("role")==="separator"?"|":child.textContent)).toHaveLength(3);
   expect([...popup.querySelectorAll(":scope>[role=separator]")].map(node=>node.getAttribute("aria-orientation"))).toEqual(["horizontal","horizontal"]);
   // Keyboard: open onto the first enabled item, rove, open the nested group, run a nested member.
   key(button,{key:"ArrowLeft"});expect(document.activeElement).toBe(action(toolbar,"redo"));key(action(toolbar,"redo"),{key:"ArrowRight"});expect(document.activeElement).toBe(button);
   key(button,{key:"ArrowDown"});expect(f.dom.toolbarLayoutState()!.open).toBe("more");const text=groupButton(popup,"text");expect(document.activeElement).toBe(text);
   key(text,{key:"ArrowDown"});expect(document.activeElement).toBe(action(popup,"bold"));
   key(action(popup,"bold"),{key:"Escape"});expect(document.activeElement).toBe(text);expect(popup.hidden).toBe(false);
   key(text,{key:"End"});expect(document.activeElement).toBe(bullet);key(bullet,{key:"Escape"});expect([popup.hidden,document.activeElement]).toEqual([true,button]);
   key(button,{key:"ArrowUp"});expect(document.activeElement).toBe(bullet);bullet.click();
   expect(f.calls).toEqual(["bullet"]);expect(popup.hidden).toBe(true);expect(document.activeElement).toBe(f.dom.surface);
   // Widening restores the original order and hides the button.
   width.value=1000;window.dispatchEvent(new Event("resize"));
   expect(f.dom.toolbarLayoutState()!.overflow).toEqual([]);expect(button.closest<HTMLElement>(".breditor-toolbar-overflow")!.hidden).toBe(true);
   expect([...toolbar.querySelectorAll(":scope>.breditor-toolbar-row>*")].map(child=>child.getAttribute("role")==="separator"?"|":(child as HTMLElement).dataset["breditorToolbarGroup"]??(child as HTMLElement).dataset[`${mode==="local"?"rich":"shared"}Control`]??"more")).toEqual(["undo","redo","|","text","|","table","bullet","more"]);
   expect(f.errors).toEqual([]);
  });
  it(`${mode}: layout is presentation only: same commands, shortcuts and borrowed controls as the default toolbar`,()=>{
   const laid=fixture(mode,{items:[group,"table"]}),plain=fixture(mode,undefined);
   for(const f of [laid,plain]){action(f.dom.toolbar,"table").click();action(f.dom.toolbar,"bold").click();}
   expect(laid.calls).toEqual(plain.calls);expect(laid.calls).toEqual(["table","bold"]);
   expect(laid.dom.contextControlIds()).toEqual(plain.dom.contextControlIds());
   expect(plain.dom.toolbarLayoutState()).toBeNull();expect(plain.dom.toolbar.dataset["breditorToolbarLayout"]).toBeUndefined();
  });
 }
});
