// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {createStandardRichInlinePresentationV1,standardInlineKindsV1 as k} from "../src/standard_inline_v1.js";
import {createFormattingProductivityToolbar,encodeCaseChangeIntent,formattingProductivityControls,type RichProductivityReader} from "../src/formatting_productivity.js";
import {createSpecialCharacterCatalog,filterSpecialCharacters,richSpecialCharacterCategories,specialCharacterCode} from "../src/special_characters.js";
import {mountToolbarControl} from "../src/toolbar_control_view.js";
import {createNamedFormatPresetRegistry,namedFormatPresetState,richDefaultHighlightPresets} from "../src/named_format_presets.js";
import {resolveRichUi} from "../src/ui_locale.js";
import type {RichInlineFormatState,RichSelection} from "../src/core.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"cd".repeat(32)}`;
const presentation=createStandardRichInlinePresentationV1(JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)}));
const strong={type:k.strong,properties:{}},italic={type:k.italic,properties:{}};
const caret:RichSelection={kind:"text",anchor:{block:"p",offset:"2",affinity:"after"},focus:{block:"p",offset:"2",affinity:"after"}};
const range:RichSelection={kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"4",affinity:"after"}};
function reader(states:Record<string,RichInlineFormatState>,caseChange=true):RichProductivityReader&{states:Record<string,RichInlineFormatState>}{
 const owner={states,supportsCaseChange:()=>caseChange,supportsSelectionFormatting:()=>true,
  selectionFormatState:(kind:string)=>({format:"breditor/rich-selection-format-state" as const,formatVersion:1 as const,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:owner.states[kind]??{kind:"unset" as const}})};
 return owner;
}
const spec=(owner:RichProductivityReader,id:string)=>formattingProductivityControls(owner,presentation).find(s=>s.id===id)!;
function mount(control:Parameters<typeof mountToolbarControl>[1],run=vi.fn()){
 const toolbar=document.createElement("div"),surface=document.createElement("div");document.body.append(toolbar,surface);
 const abort=new AbortController();
 const view=mountToolbarControl(toolbar,control,{prefix:"rich",signal:abort.signal,surface,sync:()=>{},stamp:()=>"1",attempt:work=>work(),focus:()=>{},run});
 view.refresh({} as never,true,"1");
 return {toolbar,surface,view,run,abort};
}

describe("special-character catalog",()=>{
 it("ships five built-in categories and validates host extensions, order and bounds",()=>{
  expect(richSpecialCharacterCategories.map(c=>c.id)).toEqual(["currency","mathematical","arrows","latin","text"]);
  const catalog=createSpecialCharacterCatalog({categories:[{id:"currency",label:"Currency",characters:[{character:"₳",name:"Austral sign"}]},{id:"emoji",label:"Emoji",characters:[{character:"👍🏽",name:"Thumbs up: medium skin tone"}]}],order:["emoji","text"]});
  expect(catalog.categories.map(c=>c.id)).toEqual(["emoji","text","currency","mathematical","arrows","latin"]);
  expect(catalog.categories.find(c=>c.id==="currency")!.characters.at(-1)).toEqual({character:"₳",name:"Austral sign"});
  expect(Object.isFrozen(catalog.categories[0]!.characters[0])).toBe(true);
  for(const bad of [{categories:[{id:"Bad",label:"x",characters:[{character:"a",name:"a"}]}]},{categories:[{id:"x",label:"x",characters:[]}]},
   {categories:[{id:"x",label:"x",characters:[{character:"\u0007",name:"bell"}]}]},{categories:[{id:"x",label:"x",characters:[{character:"a",name:"a"},{character:"a",name:"again"}]}]},
   {categories:[{id:"x",label:"x",characters:[{character:"\uD800",name:"lone surrogate"}]}]},{order:["nope"]},{builtIn:false},{extra:true}])
   expect(()=>createSpecialCharacterCatalog(bad as never)).toThrow();
  expect(createSpecialCharacterCatalog({builtIn:false,categories:[{id:"x",label:"X",characters:[{character:"a",name:"A"}]}]}).categories).toHaveLength(1);
 });
 it("searches localized and English names, code points and characters across categories",()=>{
  const catalog=createSpecialCharacterCatalog();
  expect(filterSpecialCharacters(catalog,"euro").map(m=>m.character)).toEqual(["€"]);
  expect(filterSpecialCharacters(catalog,"u+2192").map(m=>m.character)).toEqual(["→"]);
  expect(filterSpecialCharacters(catalog,"rightwards double").map(m=>m.character)).toEqual(["⇒"]);
  expect(filterSpecialCharacters(catalog,"",`arrows`)).toHaveLength(20);
  const ui=resolveRichUi({specialCharacters:{characters:{"€":"Eurozeichen"},categories:{currency:"Währung"}}});
  expect(filterSpecialCharacters(catalog,"eurozeichen",null,ui)).toEqual([{category:"currency",character:"€",name:"Eurozeichen"}]);
  expect(specialCharacterCode("👍🏽")).toBe("U+1F44D U+1F3FD");
  expect(()=>resolveRichUi({specialCharacters:{categories:{"Bad id":"x"}}})).toThrow();
  expect(()=>resolveRichUi({specialCharacters:{names:{}}} as never)).toThrow();
 });
});

describe("special-character picker",()=>{
 it("renders an accessible grid with a roving tab stop and inserts through the control command",()=>{
  const owner=reader({}),picker=spec(owner,"special-characters"),run=vi.fn();
  const {toolbar}=mount(picker,run);
  const details=toolbar.querySelector("details")!;details.open=true;
  const search=toolbar.querySelector<HTMLInputElement>("[data-special-character-search]")!,grid=toolbar.querySelector("[role=grid]")!;
  expect(search.getAttribute("aria-controls")).toBe(grid.id);
  expect(toolbar.querySelector("[role=status]")!.textContent).toMatch(/^\d+ characters$/);
  search.value="arrow";search.dispatchEvent(new Event("input"));
  const cells=[...grid.querySelectorAll<HTMLButtonElement>("[role=gridcell]")];
  expect(cells.length).toBeGreaterThan(8);expect(cells.filter(c=>c.tabIndex===0)).toHaveLength(1);
  expect(cells[0]!.getAttribute("aria-label")).toBe("Leftwards arrow (U+2190)");
  search.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
  expect(document.activeElement).toBe(cells[0]);
  cells[0]!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
  expect(document.activeElement).toBe(cells[1]);expect(cells[1]!.tabIndex).toBe(0);expect(cells[0]!.tabIndex).toBe(-1);
  cells[1]!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
  expect(document.activeElement).toBe(cells[9]);
  cells[9]!.dispatchEvent(new KeyboardEvent("keydown",{key:"End",ctrlKey:true,bubbles:true}));
  expect(document.activeElement).toBe(cells.at(-1));
  (document.activeElement as HTMLButtonElement).click();
  expect(run).toHaveBeenCalledWith(undefined,{value:cells.at(-1)!.dataset["specialCharacter"]});
  expect(details.open).toBe(false);
  search.value="zzzz-nothing";search.dispatchEvent(new Event("input"));
  expect(toolbar.querySelector("[role=status]")!.textContent).toBe("No matching characters");
  // Intents only insert catalog characters into a writable text selection.
  expect(picker.intent({value:"€"},caret,false)).toEqual({kind:"insertText",text:"€"});
  expect(picker.intent({value:"€"},caret,true)).toBeNull();
  expect(()=>picker.intent({value:"<b>"},caret,false)).toThrow("catalog");
 });
 it("uses the chrome catalog for picker strings and category names",()=>{
  const ui=resolveRichUi({strings:{specialCharactersSearch:"Zeichen suchen",specialCharactersCount:"{count} Zeichen"},specialCharacters:{categories:{arrows:"Pfeile"}}});
  const toolbar=document.createElement("div"),abort=new AbortController();
  mountToolbarControl(toolbar,spec(reader({}),"special-characters"),{prefix:"rich",ui,signal:abort.signal,sync:()=>{},stamp:()=>"1",attempt:w=>w(),focus:()=>{},run:()=>{}});
  expect(toolbar.querySelector("[data-special-character-search]")!.getAttribute("aria-label")).toBe("Zeichen suchen");
  expect([...toolbar.querySelectorAll("option")].map(o=>o.textContent)).toContain("Pfeile");
  expect(toolbar.querySelector("[role=status]")!.textContent).toMatch(/^\d+ Zeichen$/);
 });
});

describe("case change",()=>{
 it("validates intents and maps buttons and Shift+F3 to the native command",()=>{
  expect(encodeCaseChangeIntent({change:"title",locale:"tr",titleMinorWords:["of"]})).toEqual({change:"title",locale:"tr",titleMinorWords:["of"]});
  for(const bad of [{change:"loud"},{change:"upper",extra:1},{change:"upper",locale:"t_r"},{change:"title",titleMinorWords:[""]}])expect(()=>encodeCaseChangeIntent(bad)).toThrow();
  const owner=reader({}),controls=formattingProductivityControls(owner,presentation,{caseChange:{locale:"tr"}});
  expect(controls.map(c=>c.id)).toEqual(["special-characters","case-upper","case-lower","case-title","format-painter"]);
  expect(controls[2]!.intent({},range,false)).toEqual({kind:"changeCase",data:{change:"lower",locale:"tr"}});
  expect(controls[1]!.enabled(null,false)).toBe(false);expect(controls[1]!.enabled(range,true)).toBe(false);
  const run=vi.fn(),{surface}=mount(controls[1]!,run);
  // Attaching the other case buttons to the same surface does not add a second listener.
  mount(controls[2]!,run);
  surface.dispatchEvent(new KeyboardEvent("keydown",{key:"F3",shiftKey:true,bubbles:true,cancelable:true}));
  expect(run).toHaveBeenCalledTimes(1);expect(run).toHaveBeenCalledWith(undefined,{change:"cycle"});
  expect(controls[1]!.intent({change:"cycle"},range,false)).toEqual({kind:"changeCase",data:{change:"cycle",locale:"tr"}});
  expect(formattingProductivityControls(reader({},false),presentation).map(c=>c.id)).not.toContain("case-upper");
 });
 it("local toolbar adapters produce exactly the native commands",()=>{
  const owner=reader({}),controls=createFormattingProductivityToolbar(owner,presentation);
  const context=(selection:RichSelection)=>({core:owner,model:{view:{selection,readOnly:false}},allocate:()=>"x"}) as never;
  expect(controls.find(c=>c.id==="case-title")!.command(context(range))).toEqual({kind:"changeSelectionCase",data:{change:"title"}});
  expect(controls.find(c=>c.id==="special-characters")!.command(context(caret),undefined,{value:"€"})).toEqual({kind:"insertPlainText",text:"€"});
  expect(controls.find(c=>c.id==="special-characters")!.command(context(range),undefined,{value:"€"})).toEqual({kind:"replaceTextRange",data:{selection:range,text:"€"}});
  expect(()=>controls[0]!.command({...context(caret),core:{}} as never)).toThrow("different Rust owner");
 });
});

describe("format painter",()=>{
 it("copies uniform formats, applies them once as one change and cancels with Escape",()=>{
  const owner=reader({[k.strong]:{kind:"uniform",format:strong},[k.italic]:{kind:"unset"}}),painter=spec(owner,"format-painter"),run=vi.fn();
  const {view,surface}=mount(painter,run);
  expect(view.button.getAttribute("aria-pressed")).toBe("false");
  expect(painter.intent({},caret,false)).toBeNull();
  expect(view.button.getAttribute("aria-pressed")).toBe("true");
  expect(view.button.parentElement!.querySelector("[role=status]")!.textContent).toMatch(/Formatting copied/);
  // The target: italic but not bold.
  owner.states={[k.strong]:{kind:"unset"},[k.italic]:{kind:"uniform",format:italic}};
  // A collapsed pointer click keeps the painter armed.
  expect(painter.intent({painter:"pointer"},caret,false)).toBeNull();
  expect(painter.read().pressed).toBe(true);
  const applied=painter.intent({painter:"pointer"},range,false);
  expect(applied).toEqual({kind:"changeFormats",changes:[{kind:"remove",formatsJson:JSON.stringify([{type:k.italic,properties:{}}])},{kind:"set",formatsJson:JSON.stringify([strong])}]});
  expect(painter.read().pressed).toBe(false);
  // Escape on the surface cancels an armed painter through the control command path.
  owner.states={[k.strong]:{kind:"uniform",format:strong}};
  painter.intent({},caret,false);
  surface.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
  expect(run).toHaveBeenLastCalledWith(undefined,{painter:"cancel"});
  painter.intent({painter:"cancel"},caret,false);
  expect(painter.read().pressed).toBe(false);expect(view.button.getAttribute("aria-pressed")).toBe("false");
 });
 it("enters sticky mode on a double activation and keeps painting until toggled off",()=>{
  const owner=reader({[k.strong]:{kind:"uniform",format:strong}}),painter=spec(owner,"format-painter");
  painter.intent({},caret,false);painter.intent({},caret,false);
  owner.states={};
  expect(painter.intent({painter:"apply"},range,false)).not.toBeNull();
  expect(painter.read().pressed).toBe(true);
  owner.states={[k.strong]:{kind:"uniform",format:strong}};
  // Already painted: nothing to publish, still sticky.
  expect(painter.intent({painter:"apply"},range,false)).toBeNull();
  expect(painter.read().pressed).toBe(true);
  painter.intent({},range,false);
  expect(painter.read().pressed).toBe(false);
 });
 it("binds Mod+Alt+C/V by physical key and ignores AltGraph text input",()=>{
  const owner=reader({[k.strong]:{kind:"uniform",format:strong}}),painter=spec(owner,"format-painter"),run=vi.fn(),{surface}=mount(painter,run);
  surface.dispatchEvent(new KeyboardEvent("keydown",{key:"ç",code:"KeyC",ctrlKey:true,altKey:true,bubbles:true,cancelable:true}));
  expect(run).toHaveBeenCalledWith(undefined,{painter:"copy"});
 });
});

describe("named formatting presets",()=>{
 const rgb="breditor-inline/rgb24";
 const yellow={type:k.backgroundColor,properties:{[rgb]:0xFDFD77}};
 const red={type:k.textColor,properties:{[rgb]:0xFF0000}},big={type:k.textSize,properties:{"breditor-inline/pixels":24}};
 const mono={type:k.fontFamily,properties:{"breditor-inline/family":4}},code={type:k.code,properties:{}};
 const namedPresets={styles:[{id:"big-red",label:"Big red",marks:["bold"] as const,textColor:"#ff0000",textSize:24},{id:"code-ish",label:"Code-ish",marks:["code"] as const,fontFamily:"mono" as const}],highlights:richDefaultHighlightPresets};
 const controls=(owner:RichProductivityReader)=>formattingProductivityControls(owner,presentation,{namedPresets});
 const byId=(owner:RichProductivityReader,id:string)=>controls(owner).find(c=>c.id===id)!;
 it("validates and freezes a host registry of typed standard formats",()=>{
  const registry=createNamedFormatPresetRegistry(namedPresets);
  expect(registry.styles[0]).toEqual({id:"big-red",label:"Big red",group:"style",formats:[strong,red,big].sort((a,b)=>a.type<b.type?-1:1)});
  expect(registry.highlights.map(p=>p.id)).toEqual(["marker-yellow","marker-green","marker-pink","marker-blue","pen-red","pen-green"]);
  expect(Object.isFrozen(registry.styles[0]!.formats[0]!.properties)).toBe(true);
  const bad=[{id:"x",label:"X"},{id:"remove",label:"R",marks:["bold"]},{id:"Bad",label:"B",marks:["bold"]},{id:"x",label:"",marks:["bold"]},{id:"x",label:"a\nb",marks:["bold"]},
   {id:"x",label:"X",marks:["blink"]},{id:"x",label:"X",marks:["bold","bold"]},{id:"x",label:"X",marks:["subscript","superscript"]},{id:"x",label:"X",textColor:"red"},
   {id:"x",label:"X",textSize:7},{id:"x",label:"X",textSize:97},{id:"x",label:"X",textSize:12.5},{id:"x",label:"X",fontFamily:"comic"},{id:"x",label:"X",marks:["bold"],href:"https://x"}];
  for(const preset of bad)expect(()=>createNamedFormatPresetRegistry({styles:[preset as never]})).toThrow(TypeError);
  expect(()=>createNamedFormatPresetRegistry({styles:[{id:"x",label:"X",marks:["bold"]},{id:"x",label:"Y",marks:["italic"]}]})).toThrow("Duplicate");
  expect(()=>createNamedFormatPresetRegistry({styles:Array.from({length:33},(_,i)=>({id:`s${i}`,label:"S",marks:["bold"]}))} as never)).toThrow("At most 32");
  expect(()=>createNamedFormatPresetRegistry({colors:[]} as never)).toThrow("Unknown");
  // The registry is validated even when the owner cannot read selection formats.
  expect(()=>formattingProductivityControls({},presentation,{namedPresets:{styles:[{id:"x",label:"X"}]}})).toThrow(TypeError);
  expect(formattingProductivityControls({},presentation,{namedPresets}).map(c=>c.id)).toEqual(["special-characters"]);
 });
 it("is opt-in and adds one borrowed dropdown per nonempty group",()=>{
  expect(formattingProductivityControls(reader({}),presentation).map(c=>c.id)).not.toContain("named-styles");
  expect(controls(reader({})).map(c=>c.id).slice(-2)).toEqual(["named-styles","highlight-presets"]);
  expect(formattingProductivityControls(reader({}),presentation,{namedPresets:{highlights:richDefaultHighlightPresets}}).map(c=>c.id).at(-1)).toBe("highlight-presets");
  const styles=byId(reader({}),"named-styles");
  expect(styles.fields).toEqual([{id:"preset",label:"Named styles",type:"select",options:[{value:"big-red",label:"Big red"},{value:"code-ish",label:"Code-ish"},{value:"remove",label:"Remove named style"}]}]);
  const {toolbar,view}=mount(styles);
  expect(view.button.textContent).toBe("Apply Named styles");
  expect([...toolbar.querySelectorAll("option")].map(o=>o.value)).toEqual(["","big-red","code-ish","remove"]);
  // Localized through the ordinary controls catalog, including the remove choice.
  const ui=resolveRichUi({controls:{"named-styles":{label:"Formatvorlagen",fields:{preset:{options:{remove:"Formatvorlage entfernen"}}}}}});
  expect(ui.control(styles).fields![0]!.options!.at(-1)!.label).toBe("Formatvorlage entfernen");
 });
 it("derives active and mixed state from the native per-kind reads",()=>{
  const owner=reader({[k.strong]:{kind:"uniform",format:strong},[k.textColor]:{kind:"uniform",format:red},[k.textSize]:{kind:"uniform",format:big}});
  const registry=createNamedFormatPresetRegistry(namedPresets),read=(kind:string)=>owner.selectionFormatState!(kind).state;
  expect(namedFormatPresetState(read,registry.styles[0]!)).toBe("active");
  expect(byId(owner,"named-styles").read()).toEqual({kind:"uniform",values:{preset:"big-red"}});
  expect(byId(owner,"highlight-presets").read()).toEqual({kind:"unset",values:{}});
  owner.states={[k.strong]:{kind:"mixed",presentEverywhere:false}};
  expect(namedFormatPresetState(read,registry.styles[0]!)).toBe("mixed");
  expect(byId(owner,"named-styles").read().kind).toBe("mixed");
  // A different uniform value is not this preset.
  owner.states={[k.textColor]:{kind:"uniform",format:{type:k.textColor,properties:{[rgb]:1}}}};
  expect(namedFormatPresetState(read,registry.styles[0]!)).toBe("inactive");
  owner.states={[k.backgroundColor]:{kind:"mixed",presentEverywhere:true}};
  expect(byId(owner,"highlight-presets").read().kind).toBe("mixed");
  const unavailable=reader(Object.fromEntries(Object.values(k).map(kind=>[kind,{kind:"unavailable"}])));
  expect(byId(unavailable,"named-styles").read().kind).toBe("unavailable");
  expect(byId(unavailable,"named-styles").enabled(range,false)).toBe(false);
  expect(byId(owner,"named-styles").enabled(range,true)).toBe(false);
  expect(byId(owner,"named-styles").enabled({kind:"document"},false)).toBe(false);
 });
 it("applies a preset as one selection-format change and removes only matching kinds",()=>{
  const owner=reader({[k.superscript]:{kind:"uniform",format:{type:k.superscript,properties:{}}},[k.textColor]:{kind:"uniform",format:red}});
  const withSub=formattingProductivityControls(owner,presentation,{namedPresets:{styles:[{id:"low",label:"Low red",marks:["subscript"],textColor:"#FF0000"}]}}).find(c=>c.id==="named-styles")!;
  // Red is already there; the opposite script is removed before subscript is set.
  expect(withSub.intent({preset:"low"},range,false)).toEqual({kind:"changeFormats",changes:[{kind:"remove",formatsJson:JSON.stringify([{type:k.superscript,properties:{}}])},{kind:"set",formatsJson:JSON.stringify([{type:k.subscript,properties:{}}])}]});
  owner.states={[k.code]:{kind:"uniform",format:code},[k.fontFamily]:{kind:"uniform",format:mono}};
  expect(byId(owner,"named-styles").intent({preset:"code-ish"},range,false)).toBeNull();
  // Remove: code-ish is active; a foreign uniform text color is kept.
  owner.states={[k.code]:{kind:"uniform",format:code},[k.fontFamily]:{kind:"uniform",format:mono},[k.textColor]:{kind:"uniform",format:{type:k.textColor,properties:{[rgb]:1}}}};
  expect(byId(owner,"named-styles").intent({preset:"remove"},range,false)).toEqual({kind:"changeFormats",changes:[{kind:"remove",formatsJson:JSON.stringify([{type:k.code,properties:{}}])},{kind:"remove",formatsJson:JSON.stringify([{type:k.fontFamily,properties:{"breditor-inline/family":1}}])}]});
  owner.states={[k.backgroundColor]:{kind:"mixed",presentEverywhere:false}};
  expect(byId(owner,"highlight-presets").intent({preset:"remove"},caret,false)).toEqual({kind:"changeFormats",changes:[{kind:"remove",formatsJson:JSON.stringify([{type:k.backgroundColor,properties:{[rgb]:0}}])}]});
  owner.states={};
  expect(byId(owner,"highlight-presets").intent({preset:"remove"},range,false)).toBeNull();
  expect(byId(owner,"highlight-presets").intent({preset:"marker-yellow"},caret,false)).toEqual({kind:"changeFormats",changes:[{kind:"set",formatsJson:JSON.stringify([yellow])}]});
  expect(()=>byId(owner,"highlight-presets").intent({preset:""},range,false)).toThrow("Choose");
  expect(()=>byId(owner,"highlight-presets").intent({preset:"nope"},range,false)).toThrow("Unknown");
  expect(byId(owner,"highlight-presets").intent({preset:"marker-yellow"},range,true)).toBeNull();
  // The local adapter lowers to exactly one native changeSelectionFormats command.
  const local=createFormattingProductivityToolbar(owner,presentation,{namedPresets}).find(c=>c.id==="highlight-presets")!;
  expect(local.fields?.[0]?.id).toBe("preset");
  expect(local.command({core:owner,model:{view:{selection:range,readOnly:false}},allocate:()=>"x"} as never,undefined,{preset:"marker-yellow"})).toEqual({kind:"changeSelectionFormats",data:{changes:[{kind:"set",formatsJson:JSON.stringify([yellow])}]}});
 });
});
