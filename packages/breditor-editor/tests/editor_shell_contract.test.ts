import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {mountRichMenuBar,mountRichShortcutHelp,mountRichFloatingMenu,mountRichBalloonBlockLayout} from "../../breditor-experimental-rich-content/src/editor_shell.js";
import {mountRichSelectionToolbar,mountRichContextMenu} from "../../breditor-experimental-rich-content/src/context_ui.js";
import {richActiveShortcuts,richCoordinatorShortcuts,parseRichShellShortcut,formatRichShortcut} from "../../breditor-experimental-rich-content/src/shortcut_registry.js";
import {defaultRichUi} from "../../breditor-experimental-rich-content/src/ui_locale.js";
import type {ToolbarControl} from "../../breditor-experimental-rich-content/src/actions.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedToolbarControl} from "../../breditor-collaboration/src/actions.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import type {RichUiOptions} from "../../breditor-experimental-rich-content/src/ui_locale.js";
const point=(block:string,offset:string)=>({block,offset,affinity:"after" as const});
const range:RichSelection={kind:"text",anchor:point("a","0"),focus:point("a","3")};
const caret:RichSelection={kind:"text",anchor:point("a","1"),focus:point("a","1")};
const empty:RichSelection={kind:"text",anchor:point("e","0"),focus:point("e","0")};
const element=(type:string,block:string,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
const documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/editor-shell",version:1},schemaFingerprint:"native fixture",root:element("document","root",[element("paragraph","a",[{kind:"text",text:"seed",formats:[]}]),element("paragraph","e")])});
type Spec={id:string;label:string;shortcut?:string;fields?:{id:string;label:string;type:"text"}[];enabled:(selection:RichSelection|null)=>boolean;pressed?:()=>boolean};
function specs(state:{bold:boolean}):Spec[]{return [
 {id:"undo",label:"Undo",enabled:()=>false},
 {id:"redo",label:"Redo",enabled:()=>true},
 {id:"bold",label:"Bold",shortcut:"b",enabled:s=>s?.kind==="text",pressed:()=>state.bold},
 {id:"italic",label:"Italic",shortcut:"i",enabled:s=>s?.kind==="text",pressed:()=>false},
 {id:"link",label:"Link",shortcut:"k",fields:[{id:"href",label:"Link URL",type:"text"}],enabled:s=>s?.kind==="text"},
 {id:"table",label:"Insert table",enabled:()=>true},
 {id:"bullet",label:"Bulleted list",enabled:()=>true},
];}
function fixture(mode:"local"|"shared",ui?:RichUiOptions){
 let revision=1,selection:RichSelection|null=range,readOnly=false;const calls:{id:string;fields:Record<string,string>}[]=[],errors:unknown[]=[],state={bold:false};
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(readOnly?{readOnly:true,readOnlyRevision:String(revision)}:{})} as RichView);
 const ran=(id:string,fields:Record<string,string>={})=>{calls.push({id,fields});if(id==="bold")state.bold=!state.bold;revision++;};
 const host=document.createElement("div");document.body.append(host);
 const reading=(spec:Spec)=>()=>({kind:"unset" as const,...(spec.pressed?{pressed:spec.pressed()}:{})});
 const shape=(spec:Spec)=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),...(spec.shortcut?{shortcut:spec.shortcut}:{}),read:reading(spec)});
 if(mode==="local"){
  const core={view,supportsReadOnly:()=>true,setReadOnly:(value:boolean)=>{readOnly=value;revision++;return true;},execute:vi.fn((command:RichCommand&{id?:string;fields?:Record<string,string>})=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}ran(command.id!,command.fields);return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
  const toolbar=specs(state).map(spec=>({...shape(spec),enabled:c=>spec.enabled(c.model.view.selection),command:(_c,_v,fields)=>({kind:"shellTest",id:spec.id,fields:{...fields}}) as unknown as RichCommand}) satisfies ToolbarControl);
  const dom=new RichDomEditor(host,{core,toolbar,...(ui?{ui}:{}),onError:e=>errors.push(e)});focusable(dom.surface);
  return {dom,calls,errors,host,state,select:(next:RichSelection|null)=>{dom.execute({kind:"setSelection",selection:next} as RichCommand,false);},setReadOnly:(value:boolean)=>dom.setReadOnly(value),dispatches:()=>calls.length};
 }
 let dispatches=0;
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free:vi.fn(),
  read_only_version:()=>"1",set_read_only:(_o:unknown,value:boolean)=>{readOnly=value;revision++;return true;},
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json);revision++;return true;},
  dispatch:(_o:unknown,json:string)=>{dispatches++;const batch=JSON.parse(json) as {commands:{data:{id:string;fields:Record<string,string>}}[]};expect(batch.commands).toHaveLength(1);const command=batch.commands[0]!;ran(command.data.id,command.data.fields);return true;}};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 const toolbar=specs(state).map(spec=>({...shape(spec),enabled:c=>spec.enabled(c.model.view.selection),run:(c,_v,fields)=>{c.core.dispatch({commands:[{kind:"shell_test",data:{id:spec.id,fields:{...fields}}} as never]},c.revision);}}) satisfies SharedToolbarControl);
 const dom=new SharedDomEditor(host,{core,toolbar,...(ui?{ui}:{}),onError:e=>errors.push(e)});focusable(dom.surface);
 return {dom,calls,errors,host,state,select:(next:RichSelection|null)=>{core.select(next,core.view().revision);},setReadOnly:(value:boolean)=>{core.setReadOnly(value,core.view().revision);},dispatches:()=>dispatches};
}
function focusable(surface:HTMLElement):void{const remove=surface.removeAttribute.bind(surface);surface.removeAttribute=(name:string)=>{if(name!=="tabindex")remove(name);};surface.tabIndex=0;}
const key=(target:Element,init:KeyboardEventInit)=>{const event=new KeyboardEvent("keydown",{bubbles:true,cancelable:true,...init});target.dispatchEvent(event);return event;};
const action=(root:Element,id:string)=>root.querySelector<HTMLButtonElement>(`[data-rich-action="${id}"],[data-shared-action="${id}"]`)!;
const top=(bar:HTMLElement,id:string)=>bar.querySelector<HTMLButtonElement>(`[data-menu="${id}"]>[aria-haspopup]`)!;
const popup=(bar:HTMLElement,id:string)=>bar.querySelector<HTMLElement>(`[data-menu="${id}"]>[role=menu]`)!;
const menus=[{id:"edit",controls:["undo","redo"]},{id:"format",controls:["bold","italic","link"]},{id:"insert",controls:["table","bullet"]}];
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});

describe("editor shell borrows the admitted toolbar contract",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: menu bar ARIA roles and states come from the shared widgets`,()=>{
   const f=fixture(mode),bar=mountRichMenuBar(f.dom,{menus}),el=bar.element;
   expect(el.getAttribute("role")).toBe("menubar");expect(el.getAttribute("aria-label")).toBe("Editor menu");expect(el.nextElementSibling).toBe(f.dom.toolbar);
   expect([...el.querySelectorAll("[aria-haspopup=menu]")].map(n=>[n.textContent,n.getAttribute("role"),n.getAttribute("aria-expanded"),(n as HTMLElement).tabIndex])).toEqual([["Edit","menuitem","false",0],["Format","menuitem","false",-1],["Insert","menuitem","false",-1]]);
   for(const id of ["edit","format","insert"]){const p=popup(el,id);expect(p.getAttribute("role")).toBe("menu");expect(p.getAttribute("aria-labelledby")).toBe(top(el,id).id);expect(p.hidden).toBe(true);}
   const undo=action(popup(el,"edit"),"undo"),bold=action(popup(el,"format"),"bold");
   expect([undo.getAttribute("role"),undo.getAttribute("aria-disabled"),undo.disabled]).toEqual(["menuitem","true",true]);
   expect([bold.getAttribute("role"),bold.getAttribute("aria-checked")]).toEqual(["menuitemcheckbox","false"]);
   expect(popup(el,"format").querySelector("summary")!.getAttribute("role")).toBe("menuitem");
   expect(bar.state().menus.map(m=>m.id)).toEqual(["edit","format","insert"]);
   // Defaults filter to the admitted controls and drop empty menus.
   bar.dispose();const defaults=mountRichMenuBar(f.dom);expect(defaults.state().menus.map(m=>[m.id,m.controls])).toEqual([["edit",["undo","redo"]],["insert",["link","table"]],["format",["bold","italic","bullet"]]]);defaults.dispose();
   expect(f.errors).toEqual([]);
  });
  it(`${mode}: menu bar validates its configuration and leases one per editor`,()=>{
   const f=fixture(mode);
   expect(()=>mountRichMenuBar(f.dom,{menus:[{id:"edit",controls:["missing"]}]})).toThrow("not admitted");
   expect(()=>mountRichMenuBar(f.dom,{menus:[{id:"edit",controls:["bold"]},{id:"format",controls:["bold"]}]})).toThrow("more than one menu");
   expect(()=>mountRichMenuBar(f.dom,{menus:[{id:"custom",controls:["bold"]}]})).toThrow("needs a label");
   expect(()=>mountRichMenuBar(f.dom,{menus:[{id:"Edit",controls:["bold"]}]})).toThrow("menu ids");
   expect(()=>mountRichMenuBar(f.dom,{menus:[{id:"edit",controls:[]}]})).toThrow("no controls");
   expect(()=>mountRichMenuBar(f.dom,{focusShortcut:"Ctrl+M"})).toThrow("Alt+");
   expect(()=>mountRichMenuBar(f.dom,{focusShortcut:"Alt+F10"})).toThrow("Alt+F10");
   expect(()=>mountRichMenuBar(f.dom,{container:f.dom.surface})).toThrow("outside editable content");
   expect(()=>mountRichMenuBar(f.dom,{colour:"red"} as never)).toThrow("Unknown menu bar option");
   const bar=mountRichMenuBar(f.dom,{menus:[{id:"tools",label:"Tools for text",controls:["bold"]}]});expect(top(bar.element,"tools").textContent).toBe("Tools for text");
   expect(()=>mountRichMenuBar(f.dom,{menus})).toThrow("already has a menu bar");bar.dispose();mountRichMenuBar(f.dom,{menus}).dispose();
  });
  it(`${mode}: keyboard model: Alt+F9, arrows, typeahead, Escape back to the editor`,()=>{
   const f=fixture(mode),bar=mountRichMenuBar(f.dom,{menus}),el=bar.element,surface=f.dom.surface;
   f.dom.focus();expect(key(surface,{key:"F9",altKey:true}).defaultPrevented).toBe(true);expect(document.activeElement).toBe(top(el,"edit"));
   key(top(el,"edit"),{key:"ArrowRight"});expect(document.activeElement).toBe(top(el,"format"));expect(top(el,"format").tabIndex).toBe(0);expect(top(el,"edit").tabIndex).toBe(-1);
   key(top(el,"format"),{key:"End"});expect(document.activeElement).toBe(top(el,"insert"));key(top(el,"insert"),{key:"ArrowRight"});expect(document.activeElement).toBe(top(el,"edit"));
   // Typeahead on the bar, then ArrowDown opens and focuses the first enabled item (disabled Undo is skipped).
   key(top(el,"edit"),{key:"f"});expect(document.activeElement).toBe(top(el,"format"));
   key(top(el,"format"),{key:"o"});expect(document.activeElement).toBe(top(el,"format"));
   key(top(el,"format"),{key:"Home"});expect(document.activeElement).toBe(top(el,"edit"));
   key(top(el,"edit"),{key:"ArrowDown"});expect(bar.state().open).toBe("edit");expect(top(el,"edit").getAttribute("aria-expanded")).toBe("true");expect(document.activeElement).toBe(action(el,"redo"));
   key(action(el,"redo"),{key:"ArrowDown"});expect(document.activeElement).toBe(action(el,"redo"));
   // Right moves to the next menu and opens it; typeahead finds Italic; Up wraps.
   key(action(el,"redo"),{key:"ArrowRight"});expect(bar.state().open).toBe("format");expect(popup(el,"edit").hidden).toBe(true);expect(document.activeElement).toBe(action(popup(el,"format"),"bold"));
   key(document.activeElement!,{key:"i"});expect(document.activeElement).toBe(action(popup(el,"format"),"italic"));
   key(document.activeElement!,{key:"ArrowDown"});expect(document.activeElement).toBe(popup(el,"format").querySelector("summary"));
   key(document.activeElement!,{key:"ArrowDown"});expect(document.activeElement).toBe(action(popup(el,"format"),"bold"));
   key(document.activeElement!,{key:"ArrowUp"});expect(document.activeElement).toBe(popup(el,"format").querySelector("summary"));
   key(document.activeElement!,{key:"Home"});expect(document.activeElement).toBe(action(popup(el,"format"),"bold"));
   // Escape closes the menu onto its bar item, Escape again returns to the editor.
   key(document.activeElement!,{key:"Escape"});expect(bar.state().open).toBeNull();expect(document.activeElement).toBe(top(el,"format"));
   key(top(el,"format"),{key:"Escape"});expect(document.activeElement).toBe(surface);
   key(surface,{key:"F9",altKey:true});expect(document.activeElement).toBe(top(el,"format"));
   key(top(el,"format"),{key:"ArrowUp"});expect(document.activeElement).toBe(popup(el,"format").querySelector("summary"));
   bar.close(true);expect(document.activeElement).toBe(surface);
   expect(f.errors).toEqual([]);bar.dispose();
   const custom=mountRichMenuBar(f.dom,{menus,focusShortcut:"Alt+Shift+M".replace("M","9")});f.dom.focus();
   key(surface,{key:"F9",altKey:true});expect(document.activeElement).toBe(surface);key(surface,{key:"(",code:"Digit9",altKey:true,shiftKey:true});expect(document.activeElement).toBe(top(custom.element,"edit"));custom.dispose();
  });
  it(`${mode}: running a menu item publishes once through the control path and syncs every presentation`,()=>{
   const f=fixture(mode),bar=mountRichMenuBar(f.dom,{menus}),el=bar.element;
   f.dom.focus();bar.open("format");const bold=action(popup(el,"format"),"bold");expect(document.activeElement).toBe(bold);
   const before=f.dispatches();bold.click();
   expect(f.calls.map(c=>c.id)).toEqual(["bold"]);expect(f.dispatches()-before).toBe(1);
   expect(document.activeElement).toBe(f.dom.surface);expect(bar.state().open).toBeNull();
   expect(action(el,"bold").getAttribute("aria-checked")).toBe("true");expect(action(f.dom.toolbar,"bold").getAttribute("aria-pressed")).toBe("true");
   // Rust-derived enabled state follows selection: a caret disables Bold in the menu and the toolbar alike.
   f.select(null);expect(action(el,"bold").disabled).toBe(true);expect(action(el,"bold").getAttribute("aria-disabled")).toBe("true");expect(action(f.dom.toolbar,"bold").disabled).toBe(true);
   bar.open("format");expect(document.activeElement).toBe(bar.element.querySelector(`[data-menu="format"]>[aria-haspopup]`));
   bar.close();f.setReadOnly(true);bar.open("insert");expect(action(el,"table").disabled).toBe(true);
   expect(f.errors).toEqual([]);bar.dispose();
  });
  it(`${mode}: Alt+0 opens a modal help dialog listing the active registry, platform-aware and localized`,()=>{
   const f=fixture(mode),help=mountRichShortcutHelp(f.dom,{platform:"other"}),bar=mountRichMenuBar(f.dom,{menus:[...menus,{id:"help",controls:[]}],help}),menu=mountRichContextMenu(f.dom),surface=f.dom.surface;
   f.dom.focus();expect(key(surface,{key:"º",code:"Digit0",altKey:true}).defaultPrevented).toBe(true);
   const dialog=help.element.querySelector<HTMLElement>("[role=dialog]")!;
   expect(help.state().open).toBe(true);expect(dialog.getAttribute("aria-modal")).toBe("true");expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Keyboard shortcuts");expect(document.activeElement).toBe(dialog);
   const rows=Object.fromEntries([...dialog.querySelectorAll("tr")].map(row=>[row.dataset["shortcut"],[row.querySelector("th")!.textContent,[...row.querySelectorAll("kbd")].map(k=>k.textContent)]]));
   expect(rows["control:bold"]).toEqual(["Bold",["Ctrl+B"]]);expect(rows["control:link"]).toEqual(["Link",["Ctrl+K"]]);
   expect(rows["undo"]).toEqual(["Undo",["Ctrl+Z"]]);expect(rows["redo"]).toEqual(["Redo",["Ctrl+Y","Ctrl+Shift+Z"]]);expect(rows["bold"]).toBeUndefined();
   expect(rows["ui:menubar"]).toEqual(["Move focus to the menu bar",["Alt+F9"]]);expect(rows["ui:help"]).toEqual(["Show keyboard shortcuts",["Alt+0"]]);expect(rows["ui:context-menu"]).toEqual(["Open the context menu",["Shift+F10","Menu"]]);
   expect([...dialog.querySelectorAll("section")].map(s=>s.dataset["group"])).toEqual(["history","formatting","blocks","navigation","interface"]);
   expect([...dialog.querySelectorAll("tr")].map(row=>row.dataset["shortcut"]).sort()).toEqual(help.entries().map(entry=>entry.id).sort());
   expect(help.entries()).toEqual(richActiveShortcuts(f.dom));
   // Focus trap: Tab cycles body → Close → body; Escape returns to the editor.
   key(dialog,{key:"Tab"});expect(document.activeElement).toBe(dialog.querySelector(".breditor-shortcut-help-body"));
   key(document.activeElement!,{key:"Tab"});expect(document.activeElement).toBe(dialog.querySelector("[data-close]"));
   key(document.activeElement!,{key:"Tab"});expect(document.activeElement).toBe(dialog.querySelector(".breditor-shortcut-help-body"));
   key(document.activeElement!,{key:"Tab",shiftKey:true});expect(document.activeElement).toBe(dialog.querySelector("[data-close]"));
   const outside=document.createElement("input");document.body.append(outside);outside.focus();expect(document.activeElement).toBe(dialog);
   key(dialog,{key:"Escape"});expect(help.state().open).toBe(false);expect(help.element.hidden).toBe(true);expect(document.activeElement).toBe(surface);
   // The menu bar's Help item opens the same dialog and Escape returns to the menu bar.
   bar.open("help");const item=bar.element.querySelector<HTMLButtonElement>("[data-menu-action=keyboard-shortcuts]")!;expect(item.getAttribute("role")).toBe("menuitem");expect(document.activeElement).toBe(item);
   item.click();expect(help.state().open).toBe(true);key(dialog,{key:"Escape"});expect(document.activeElement).toBe(top(bar.element,"help"));
   menu.dispose();bar.dispose();expect(help.entries().map(e=>e.id)).not.toContain("ui:menubar");expect(help.entries().map(e=>e.id)).not.toContain("ui:context-menu");
   expect(f.errors).toEqual([]);help.dispose();
  });
  it(`${mode}: help uses Apple symbols and the chrome catalog`,()=>{
   const f=fixture(mode,{lang:"fr",strings:{shortcutHelpTitle:"Raccourcis clavier",shortcutUndo:"Annuler",shortcutGroupHistory:"Historique",keyCommand:"Commande",keyShift:"Maj"},controls:{bold:{label:"Gras"}}}),help=mountRichShortcutHelp(f.dom,{platform:"apple",shortcut:"Alt+F1"});
   expect(()=>mountRichShortcutHelp(f.dom)).toThrow("already has a shortcut help dialog");
   help.open();const dialog=help.element.querySelector("[role=dialog]")!;expect(help.element.lang).toBe("fr");
   expect(dialog.querySelector("h2")!.textContent).toBe("Raccourcis clavier");expect(dialog.querySelector("section[data-group=history] h3")!.textContent).toBe("Historique");
   const redo=dialog.querySelector('tr[data-shortcut="redo"]')!,kbds=[...redo.querySelectorAll("kbd")];
   expect(kbds.map(k=>k.textContent)).toEqual(["⌘Y","⇧⌘Z"]);expect(kbds.map(k=>k.getAttribute("aria-label"))).toEqual(["Commande+Y","Maj+Commande+Z"]);expect(redo.querySelector("span")!.textContent).toBe(" or ");
   expect(dialog.querySelector('tr[data-shortcut="undo"] th')!.textContent).toBe("Annuler");expect(dialog.querySelector('tr[data-shortcut="control:bold"] th')!.textContent).toBe("Gras");
   expect(dialog.querySelector('tr[data-shortcut="ui:help"] kbd')!.textContent).toBe("⌥F1");
   help.close();f.dom.focus();key(f.dom.surface,{key:"º",code:"Digit0",altKey:true});expect(help.state().open).toBe(false);key(f.dom.surface,{key:"F1",altKey:true});expect(help.state().open).toBe(true);
   help.dispose();expect(help.element.isConnected).toBe(false);
  });
  it(`${mode}: empty-line block menu appears at an empty paragraph caret and never steals typing`,()=>{
   const f=fixture(mode),floating=mountRichFloatingMenu(f.dom),surface=f.dom.surface,el=floating.element;
   expect(floating.state().controls).toEqual(["bullet","table"]);expect(el.getAttribute("role")).toBe("toolbar");expect(el.getAttribute("aria-label")).toBe("Insert block");
   f.dom.focus();expect(floating.state().visible).toBe(false);
   f.select(caret);expect(f.dom.contextUiState().emptyParagraph).toBe(false);expect(floating.state().visible).toBe(false);
   f.select(empty);expect(f.dom.contextUiState()).toMatchObject({selection:"caret",emptyParagraph:true});f.dom.focus();floating.refresh();
   expect(floating.state().visible).toBe(true);expect(document.activeElement).toBe(surface);
   // Alt+F10 reaches it from the keyboard; arrows rove; Escape dismisses and returns to the text.
   key(surface,{key:"F10",altKey:true});expect(document.activeElement).toBe(action(el,"bullet"));
   key(document.activeElement!,{key:"ArrowRight"});expect(document.activeElement).toBe(action(el,"table"));
   key(document.activeElement!,{key:"Escape"});expect(floating.state().visible).toBe(false);expect(document.activeElement).toBe(surface);
   f.select(range);f.select(empty);f.dom.focus();floating.refresh();expect(floating.state().visible).toBe(true);
   action(el,"bullet").click();expect(f.calls.map(c=>c.id)).toEqual(["bullet"]);expect(document.activeElement).toBe(surface);
   // Composition and read-only hide it; it never shows while another element holds focus.
   f.setReadOnly(true);floating.refresh();expect(floating.state().visible).toBe(false);f.setReadOnly(false);f.dom.focus();floating.refresh();expect(floating.state().visible).toBe(true);
   surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));expect(floating.state().visible).toBe(false);
   const outside=document.createElement("input");document.body.append(outside);outside.focus();floating.refresh();expect(floating.state().visible).toBe(false);
   expect(()=>mountRichFloatingMenu(f.dom)).toThrow("already has a block menu");
   expect(richActiveShortcuts(f.dom).find(entry=>entry.id==="ui:floating-menu")?.keys).toEqual([{key:"F10",alt:true}]);
   expect(f.errors).toEqual([]);floating.dispose();expect(el.isConnected).toBe(false);
  });
  it(`${mode}: balloon-block preset composes the floating presentations and restores the toolbar`,()=>{
   const f=fixture(mode),layout=mountRichBalloonBlockLayout(f.dom);
   expect(f.dom.toolbar.hidden).toBe(true);expect(layout.selectionToolbar?.state().controls).toEqual(["bold","italic","link"]);expect(layout.floatingMenu?.state().controls).toEqual(["bullet","table"]);expect(layout.help?.state().shortcut).toBe("Alt+0");
   f.dom.focus();expect(layout.selectionToolbar?.state().visible).toBe(true);action(layout.selectionToolbar!.element,"bold").click();expect(f.calls.map(c=>c.id)).toEqual(["bold"]);
   expect(()=>mountRichSelectionToolbar(f.dom)).toThrow("already has a selection toolbar");
   layout.dispose();expect(f.dom.toolbar.hidden).toBe(false);mountRichSelectionToolbar(f.dom).dispose();
   const partial=mountRichBalloonBlockLayout(f.dom,{help:false,hideToolbar:false});expect(partial.help).toBeNull();expect(f.dom.toolbar.hidden).toBe(false);partial.dispose();
  });
 }
});
describe("shortcut registry",()=>{
 it("lists the coordinator's own chords in its precedence order",()=>{
  const entries=richCoordinatorShortcuts({ui:defaultRichUi,controls:[{id:"bold",label:"Bold",shortcut:"b"},{id:"strike",label:"Strike",shortcut:"shift+x"},{id:"exit-code",label:"Exit code",shortcut:"enter"},{id:"custom",label:"Odd",shortcut:"alt+q"}],structural:true,selectionFormatting:true,flowNavigation:true,blockLayout:true});
  expect(entries.map(e=>[e.id,e.group,e.keys.map(k=>formatRichShortcut(k,"other",defaultRichUi).text).join(" ")])).toEqual([
   ["control:bold","formatting","Ctrl+B"],["control:strike","formatting","Ctrl+Shift+X"],["control:exit-code","commands","Ctrl+Enter"],
   ["undo","history","Ctrl+Z"],["redo","history","Ctrl+Y Ctrl+Shift+Z"],["italic","formatting","Ctrl+I"],["underline","formatting","Ctrl+U"],["select-all","navigation","Ctrl+A"],["hard-break","blocks","Shift+Enter"],
   ["align-left","blocks","Ctrl+Shift+L"],["align-center","blocks","Ctrl+Shift+E"],["align-right","blocks","Ctrl+Shift+R"],["align-justify","blocks","Ctrl+Shift+J"],["flow-before","navigation","Alt+Page Up"],["flow-after","navigation","Alt+Page Down"]]);
  expect(Object.isFrozen(entries)&&Object.isFrozen(entries[0])&&Object.isFrozen(entries[0]!.keys)).toBe(true);
  const plain=richCoordinatorShortcuts({ui:defaultRichUi,controls:[],structural:false,selectionFormatting:false,flowNavigation:false,blockLayout:false});
  expect(plain.map(e=>e.id)).toEqual(["undo","redo","bold","select-all","hard-break"]);
 });
 it("parses only the closed shell chord grammar",()=>{
  expect(parseRichShellShortcut("Alt+0","x")).toEqual({key:"0",alt:true});expect(parseRichShellShortcut("Alt+Shift+F12","x")).toEqual({key:"F12",alt:true,shift:true});
  for(const bad of ["Alt+F10","Ctrl+0","Alt+A","alt+0","Alt+F13","",null,7])expect(()=>parseRichShellShortcut(bad,"x")).toThrow();
 });
});
