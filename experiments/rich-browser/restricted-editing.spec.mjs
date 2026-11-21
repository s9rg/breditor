import {test,expect} from "@playwright/test";
// Restricted editing over the actual Rust/Wasm V4 owner: a live host policy names editable block
// subtrees; every keyboard, paste, toolbar and Undo path is admitted natively by its effect.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/restricted",version:4},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const cell={kind:"element",type:"breditor/table-cell",entityId:null,properties:{"breditor/block-id":"cell","breditor/column-id":"c","breditor/header":false},children:[paragraph("cellp","Cell")]};
  const table={kind:"element",type:"breditor/table",entityId:null,properties:{"breditor/block-id":"tbl","breditor/columns":[{id:"c",width:200}],"breditor/merges":[],"breditor/retracted-merges":[],"breditor/table-id":"t"},children:[{kind:"element",type:"breditor/table-row",entityId:null,properties:{"breditor/block-id":"row","breditor/row-id":"r"},children:[cell]}]};
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("intro","Intro"),paragraph("field","Name"),paragraph("middle","Mid"),table,paragraph("tail","Tail")]};
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const binding=profile.descriptor(),core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root}));
  const style=document.createElement("style");style.textContent=api.richRestrictedEditingStyles;document.head.append(style);
  const host=document.createElement("main"),errors=[];document.body.append(host);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(`${error?.code??""} ${error}`)});
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const texts=()=>Object.fromEntries(Object.entries({intro:0,field:1,middle:2,tail:4}).map(([id,index])=>[id,JSON.parse(core.documentJson()).root.children[index].children.map(n=>n.text).join("")]));
  const at=()=>{const s=core.view().selection;return s?.kind==="text"?`${s.anchor.block}:${s.anchor.offset}-${s.focus.block}:${s.focus.offset}`:String(s?.kind);};
  const clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   editor.surface.dispatchEvent(event);return event;
  };
  window.dt={api,core,editor,errors,select,texts,at,clipboardEvent};
  editor.setRestrictedEditing({editable:["field","cell","tail"]});
 });
});
const bold=page=>page.getByRole("button",{name:"Bold",exact:true});

test("typing is admitted inside editable regions and refused natively outside",async({page})=>{
 await expect(page.locator("[data-rich-editable-region]")).toHaveCount(3);
 await expect(page.locator("main [data-rich-restricted]")).toHaveCount(1);
 await page.locator('[data-rich-text="field"]').click();
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("field",4)));
 await expect(bold(page)).toBeEnabled();
 await page.keyboard.type("!");
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("intro",5)));
 await expect(bold(page)).toBeDisabled();
 await page.keyboard.type("X");await page.keyboard.press("Enter");await page.keyboard.press("Backspace");
 const result=await page.evaluate(()=>({texts:window.dt.texts(),restricted:window.dt.core.view().restricted,undo:window.dt.core.view().undoDepth}));
 expect(result).toEqual({texts:{intro:"Intro",field:"Name!",middle:"Mid",tail:"Tail"},restricted:{editable:["field","cell","tail"],selectionEditable:false},undo:1});
 // Backspace at the start of a leaf field would merge into protected text: refused whole.
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("field",0)));
 await page.keyboard.press("Backspace");
 expect(await page.evaluate(()=>window.dt.texts())).toEqual({intro:"Intro",field:"Name!",middle:"Mid",tail:"Tail"});
 await expect(page.locator('[data-rich-text="intro"]')).toHaveText("Intro");
});

test("Tab and Shift+Tab move between editable regions in document order",async({page})=>{
 await page.locator('[data-rich-text="intro"]').click();
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("intro",1)));
 const seen=[];
 for(let step=0;step<3;step++){await page.keyboard.press("Tab");seen.push(await page.evaluate(()=>window.dt.at()));}
 expect(seen).toEqual(["field:0-field:4","cellp:0-cellp:0","tail:0-tail:4"]);
 await page.keyboard.press("Shift+Tab");
 expect(await page.evaluate(()=>window.dt.at())).toBe("cellp:0-cellp:0");
 // Typing after Tab replaces the selected field text in one native step.
 await page.keyboard.press("Shift+Tab");await page.keyboard.type("Ada");
 expect(await page.evaluate(()=>window.dt.texts().field)).toBe("Ada");
 // At the last region Tab is not consumed, so focus can leave the editor.
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("tail",2)));
 const consumed=await page.evaluate(()=>{const event=new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true});window.dt.editor.surface.dispatchEvent(event);return event.defaultPrevented;});
 expect(consumed).toBe(false);
});

test("paste into a field is admitted while a paste spanning protected text is refused whole",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.dt,transfer=new DataTransfer();transfer.setData("text/plain","Grace");
  t.editor.execute(t.select("field",0,4));t.clipboardEvent("paste",transfer);const inside=t.texts().field,depth=t.core.view().undoDepth;
  t.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"field",offset:"1",affinity:"after"},focus:{block:"tail",offset:"2",affinity:"after"}}});
  const editable=t.core.view().restricted.selectionEditable;t.clipboardEvent("paste",transfer);
  return {inside,editable,after:t.texts(),delta:t.core.view().undoDepth-depth,refused:t.errors.some(e=>e.startsWith("breditor_rich.restricted"))||t.errors};});
 expect(result).toEqual({inside:"Grace",editable:false,after:{intro:"Intro",field:"Grace",middle:"Mid",tail:"Tail"},delta:0,refused:true});
});

test("Undo is authorized by its effect: own field edits undo, protected history is refused",async({page})=>{
 // Lift the policy, change protected text, then restrict again.
 await page.evaluate(()=>{const t=window.dt;t.editor.setRestrictedEditing(null);t.editor.execute(t.select("intro",5));t.editor.execute({kind:"insertPlainText",text:"?"});t.editor.setRestrictedEditing({editable:["field","cell","tail"]});});
 await page.locator('[data-rich-text="tail"]').click();
 await page.evaluate(()=>window.dt.editor.execute(window.dt.select("tail",4)));
 await page.keyboard.type("s");
 await page.keyboard.press("ControlOrMeta+z");
 expect(await page.evaluate(()=>window.dt.texts().tail)).toBe("Tail");
 await page.keyboard.press("ControlOrMeta+z");
 const result=await page.evaluate(()=>({texts:window.dt.texts(),undo:window.dt.core.view().undoDepth,redo:window.dt.core.view().redoDepth}));
 expect(result).toEqual({texts:{intro:"Intro?",field:"Name",middle:"Mid",tail:"Tail"},undo:1,redo:1});
 await page.keyboard.press("ControlOrMeta+y");
 expect(await page.evaluate(()=>window.dt.texts().tail)).toBe("Tails");
});
