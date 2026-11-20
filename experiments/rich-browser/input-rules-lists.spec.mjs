import {test,expect} from "@playwright/test";
// markdown-v1 list continuation and code Enter over the actual Rust/Wasm owner, with real keys.
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");await page.evaluate(async()=>{
 const api=await import("/rich.js");
 const profile=api.compileStandardLayoutRichProfileV3(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/input-rules-lists",version:1},extensions:[]}));
 const binding=profile.descriptor(),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
 const el=(type,id,children=[],properties={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id,...properties},children});
 const p=(id,text="",type="paragraph")=>el(type,id,text?[{kind:"text",text,formats:[]}]:[]);
 const errors=[];let editor,core;const host=document.createElement("main");document.body.append(host);
 const caret=(block,offset)=>{const point={block,offset:String(offset),affinity:"after"};editor.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:{...point}}});};
 const mount=(children,options={inputRules:"markdown-v1"},readOnly=false)=>{editor?.dispose();host.replaceChildren();
  core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children}}));
  if(readOnly)core.setReadOnly(true);
  editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,onError:error=>errors.push(String(error)),...options});editor.focus?.();window.lr.editor=editor;window.lr.core=core;};
 // Compact outline: type(+checked)[children] with text runs joined; ids are omitted.
 const outline=node=>{if(node.kind==="text")return null;const name=node.type.replace("breditor/","")+(node.type==="breditor/task-item"?(node.properties["breditor/checked"]?"+":"-"):"");const text=node.children.filter(c=>c.kind==="text").map(c=>c.text).join(""),kids=node.children.map(outline).filter(Boolean);return kids.length?`${name}[${kids.join(",")}]`:`${name}'${text}'`;};
 const shape=()=>JSON.parse(core.documentJson()).root.children.map(outline).join(" ");
 const focus=()=>{const s=core.view().selection;return s?.kind==="text"?`${s.focus.block}@${s.focus.offset}`:null;};
 window.lr={el,p,mount,caret,shape,focus,errors};
});});
const undo=page=>page.keyboard.press("ControlOrMeta+z");
const redo=page=>page.keyboard.press("ControlOrMeta+Shift+z");
const shape=page=>page.evaluate(()=>window.lr.shape());

test("typing [x] on a bullet item converts only that item to a checked task; one Undo keeps the text",async({page})=>{
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;mount([el("bullet-list","l",[el("list-item","i1",[p("a","one")]),el("list-item","i2",[p("b","two")]),el("list-item","i3",[p("c","three")])])]);caret("b",0);});
 await page.keyboard.type("[x]");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one'],list-item[paragraph'[x]two'],list-item[paragraph'three']]");
 await page.keyboard.type(" ");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] task-list[task-item+[paragraph'two']] bullet-list[list-item[paragraph'three']]");
 expect(await page.evaluate(()=>window.lr.focus())).toBe("b@0");
 await expect(page.locator('[data-rich-text="b"]')).toHaveText("two");
 await undo(page);
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one'],list-item[paragraph'[x] two'],list-item[paragraph'three']]");
 await redo(page);
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] task-list[task-item+[paragraph'two']] bullet-list[list-item[paragraph'three']]");
 // Converting the next first item right after the task list joins it.
 await page.evaluate(()=>window.lr.caret("c",0));
 await page.keyboard.type("[ ] ");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] task-list[task-item+[paragraph'two'],task-item-[paragraph'three']]");
 expect(await page.evaluate(()=>window.lr.errors)).toEqual([]);
});

test("a list marker after a list of the same kind appends an item; other kinds stay separate",async({page})=>{
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;mount([el("bullet-list","l",[el("list-item","i",[p("a","one")])]),p("b")]);caret("b",0);});
 await page.keyboard.type("- ");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one'],list-item[paragraph'']]");
 // One Undo reverses only the join: the literal marker paragraph returns after the list.
 await undo(page);
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] paragraph'- '");
 await redo(page);
 await page.keyboard.type("two");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one'],list-item[paragraph'two']]");
 await expect(page.locator("ul > li")).toHaveCount(2);
 // Numbered: only the next ordinal joins.
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;const list=el("ordered-list","l",[el("list-item","i",[p("a","one")]),el("list-item","j",[p("c","two")])],{"breditor/start":1});mount([list,p("b")]);caret("b",0);});
 await page.keyboard.type("3. ");
 expect(await shape(page)).toBe("ordered-list[list-item[paragraph'one'],list-item[paragraph'two'],list-item[paragraph'']]");
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;const list=el("ordered-list","l",[el("list-item","i",[p("a","one")])],{"breditor/start":1});mount([list,p("b")]);caret("b",0);});
 await page.keyboard.type("5. ");
 expect(await shape(page)).toBe("ordered-list[list-item[paragraph'one']] ordered-list[list-item[paragraph'']]");
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;mount([el("bullet-list","l",[el("list-item","i",[p("a","one")])]),p("b")]);caret("b",0);});
 await page.keyboard.type("1. ");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] ordered-list[list-item[paragraph'']]");
 // A task marker after a task list joins it.
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;mount([el("task-list","t",[el("task-item","ti",[p("a","one")],{"breditor/checked":false})]),p("b")]);caret("b",0);});
 await page.keyboard.type("[x] ");
 expect(await shape(page)).toBe("task-list[task-item-[paragraph'one'],task-item+[paragraph'']]");
 expect(await page.evaluate(()=>window.lr.errors)).toEqual([]);
});

test("three Enters at the end of code leave it; one Undo restores every line",async({page})=>{
 await page.evaluate(()=>{const {p,mount,caret}=window.lr;mount([p("c","let x","code-block"),p("z","after")]);caret("c",5);});
 await page.keyboard.press("Enter");await page.keyboard.press("Enter");
 expect(await shape(page)).toBe("code-block'let x\n\n' paragraph'after'");
 await page.keyboard.press("Enter");
 expect(await shape(page)).toBe("code-block'let x' paragraph'' paragraph'after'");
 await page.keyboard.type("y");
 expect(await shape(page)).toBe("code-block'let x' paragraph'y' paragraph'after'");
 await undo(page);
 expect(await shape(page)).toBe("code-block'let x' paragraph'' paragraph'after'");
 await undo(page);
 expect(await shape(page)).toBe("code-block'let x\n\n\n' paragraph'after'");
 // Enter inside code (not at its end) stays a line feed.
 await page.evaluate(()=>{const {p,mount,caret}=window.lr;mount([p("c","a\n\nb","code-block")]);caret("c",3);});
 await page.keyboard.press("Enter");
 expect(await shape(page)).toBe("code-block'a\n\n\nb'");
 expect(await page.evaluate(()=>window.lr.errors)).toEqual([]);
});

test("omitted rules, paste and read-only keep list markers and code Enter literal",async({page})=>{
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;mount([el("bullet-list","l",[el("list-item","i",[p("a","one")])]),p("b")],{});caret("b",0);});
 await page.keyboard.type("- ");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] paragraph'- '");
 await page.evaluate(()=>{const {p,mount,caret}=window.lr;mount([p("c","x\n\n","code-block")],{});caret("c",3);});
 await page.keyboard.press("Enter");
 expect(await shape(page)).toBe("code-block'x\n\n\n'");
 // Paste is not typing.
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;mount([el("bullet-list","l",[el("list-item","i",[p("a","one")])]),p("b")]);caret("b",0);
  const data=new DataTransfer();data.setData("text/plain","- ");const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data});if(event.clipboardData!==data)event.clipboardData.setData("text/plain","- ");window.lr.editor.surface.dispatchEvent(event);});
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] paragraph'- '");
 // Read-only accepts no input at all.
 await page.evaluate(()=>{const {el,p,mount,caret}=window.lr;mount([el("bullet-list","l",[el("list-item","i",[p("a","one")])]),p("b","-")],{inputRules:"markdown-v1"},true);caret("b",1);});
 await page.keyboard.type(" ");
 expect(await shape(page)).toBe("bullet-list[list-item[paragraph'one']] paragraph'-'");
 expect(await page.evaluate(()=>window.lr.errors)).toEqual([]);
});
