import {test,expect} from "@playwright/test";
async function ready(page,path="/"){await page.goto(path);await expect(page.locator("#ready")).toHaveText("Ready");}

test("local hard break honors a distinct browser replacement target rather than the visible caret",async({page})=>{
 await ready(page);const result=await page.evaluate(()=>{
  const t=window.sdk,editor=t.editor;editor.execute({kind:"setSelection",selection:t.range("p",0)});editor.focus();
  const before=editor.view().documentJson,depth=editor.view().undoDepth,element=editor.surface.querySelector('[data-rich-text="p"]'),walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),text=walker.nextNode(),target=document.createRange();target.setStart(text,1);target.setEnd(text,3);
  const event=new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertLineBreak"});Object.defineProperty(event,"getTargetRanges",{value:()=>[target]});editor.surface.dispatchEvent(event);
  const actual=element.isConnected?element.textContent:editor.surface.querySelector('[data-rich-text="p"]').textContent,after=editor.view().documentJson,delta=editor.view().undoDepth-depth,selection=editor.view().selection;editor.execute({kind:"undo"});const undo=editor.view().documentJson===before;editor.execute({kind:"redo"});return {actual,delta,selection,undo,redo:editor.view().documentJson===after,errors:t.errors};
 });expect(result).toEqual({actual:"a\nb",delta:1,selection:{kind:"text",anchor:{block:"p",offset:"2",affinity:"after"},focus:{block:"p",offset:"2",affinity:"after"}},undo:true,redo:true,errors:[]});
});

test("installed local Shift Enter is one styled LF without a block split and reloads exact future history",async({page})=>{
 await ready(page);const before=await page.evaluate(()=>{const t=window.sdk;t.editor.execute({kind:"setSelection",selection:t.range("p",1)});t.editor.focus();return {document:t.editor.view().documentJson,depth:t.editor.view().undoDepth,blocks:t.editor.surface.querySelectorAll("[data-rich-text]").length};});await page.keyboard.press("Shift+Enter");
 expect(await page.locator('[data-rich-text="p"]').textContent()).toBe("a\n🙂b");const saved=await page.evaluate(before=>{const t=window.sdk,after=t.editor.view().documentJson;if(t.editor.view().undoDepth-before.depth!==1)throw Error("Hard break was not one group");if(t.editor.surface.querySelectorAll("[data-rich-text]").length!==before.blocks)throw Error("Hard break split a block");t.editor.execute({kind:"undo"});if(t.editor.view().documentJson!==before.document)throw Error("Hard break Undo differs");t.editor.execute({kind:"redo"});t.save();return {checkpoint:t.editor.checkpointJson(),document:after};},before);
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>({checkpoint:window.sdk.editor.checkpointJson(),document:window.sdk.editor.view().documentJson}))).toEqual(saved);await expect(page.locator('[data-rich-text="p"] strong')).toHaveText("a\n🙂b");expect(await page.evaluate(()=>window.sdk.errors)).toEqual([]);
});

test("installed shared Shift Enter retains one LF through offline peer edits selective Undo and restart",async({page})=>{
 await ready(page,"/shared-session.html");await page.evaluate(()=>{const t=window.durableSdk;t.a.select(t.range("p",1));t.a.focus();t.before=t.a.view().undoDepth;});await page.keyboard.press("Shift+Enter");expect(await page.locator('#a [data-rich-text="p"]').textContent()).toBe("a\n🙂b");
 const saved=await page.evaluate(async()=>{const t=window.durableSdk;if(t.a.view().undoDepth-t.before!==1)throw Error("Shared break was not one group");t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Peer "}}]});await t.sync();const after=t.a.view().documentJson;t.a.core.undo();if(!t.a.view().documentJson.includes("Peer "))throw Error("Undo lost peer text");if(t.a.surface.querySelector('[data-rich-text="p"]').textContent!=="a🙂b")throw Error("Undo did not remove exactly the break");t.a.core.redo();await t.sync();if(t.a.view().documentJson!==after)throw Error("Shared break Redo differs");const result={document:after,checkpoint:t.a.checkpointJson()};await t.a.close();await t.b.close();return result;});
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>({document:window.durableSdk.a.view().documentJson,checkpoint:window.durableSdk.a.checkpointJson()}))).toEqual(saved);await expect(page.locator('#a [data-rich-text="p"] strong')).toHaveText("a\n🙂b");expect(await page.evaluate(()=>window.durableSdk.errors)).toEqual([]);
});

test("Shift Enter replaces reverse selections once and leaves composition keys untouched",async({page})=>{
 for(const path of ["/","/shared-session.html"]){
  await ready(page,path);const before=await page.evaluate(()=>{
   const t=window.sdk??window.durableSdk,e=t.editor??t.a,s=t.range("p",3,1);
   if(t.editor)e.execute({kind:"setSelection",selection:s});else e.select(s);e.focus();
   const doc=e.view().documentJson,depth=e.view().undoDepth;
   const composing=new KeyboardEvent("keydown",{key:"Enter",shiftKey:true,isComposing:true,bubbles:true,cancelable:true});e.surface.dispatchEvent(composing);
   if(composing.defaultPrevented||e.view().documentJson!==doc)throw Error("Composition key was consumed");
   return {doc,depth,selection:e.view().selection,blocks:e.surface.querySelectorAll("[data-rich-text]").length};
  });
  await page.keyboard.press("Shift+Enter");const result=await page.evaluate(before=>{
   const t=window.sdk??window.durableSdk,e=t.editor??t.a,view=e.view(),actual=e.surface.querySelector('[data-rich-text="p"]').textContent;
   const undo=()=>t.editor?e.execute({kind:"undo"}):e.core.undo(),redo=()=>t.editor?e.execute({kind:"redo"}):e.core.redo();
   const after=view.documentJson;undo();const restored=e.view();redo();
   return {actual,groups:view.undoDepth-before.depth,blocks:e.surface.querySelectorAll("[data-rich-text]").length,undo:restored.documentJson===before.doc&&JSON.stringify(restored.selection)===JSON.stringify(before.selection),redo:e.view().documentJson===after,errors:t.errors};
  },before);
  expect(result).toEqual({actual:"a\nb",groups:1,blocks:before.blocks,undo:true,redo:true,errors:[]});
 }
});

test("shared hard break honors an explicit beforeinput replacement target without moving the visible caret first",async({page})=>{
 await ready(page,"/shared-session.html");const result=await page.evaluate(()=>{
  const t=window.durableSdk,e=t.a;e.select(t.range("p",0));e.focus();const before=e.view(),node=e.surface.querySelector('[data-rich-text="p"] strong').firstChild,r=document.createRange();r.setStart(node,1);r.setEnd(node,3);
  const event=new InputEvent("beforeinput",{inputType:"insertLineBreak",bubbles:true,cancelable:true});Object.defineProperty(event,"getTargetRanges",{value:()=>[r]});e.surface.dispatchEvent(event);
  const after=e.view(),actual=e.surface.querySelector('[data-rich-text="p"]').textContent;e.core.undo();const undo=e.view().documentJson===before.documentJson;e.core.redo();
  return {actual,groups:after.undoDepth-before.undoDepth,offset:after.selection.focus.offset,undo,redo:e.view().documentJson===after.documentJson,errors:t.errors};
 });expect(result).toEqual({actual:"a\nb",groups:1,offset:"2",undo:true,redo:true,errors:[]});
});
