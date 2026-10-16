import {test,expect} from "@playwright/test";

const modes=[
 {key:"local-v1",path:"/",name:"sdk",local:true,v2:false},
 {key:"local-v2",path:"/structural.html",name:"v2",local:true,v2:true},
 {key:"shared-v1",path:"/shared-session.html",name:"durableSdk",local:false,v2:false},
 {key:"shared-v2",path:"/shared-structural.html",name:"sharedV2",local:false,v2:true},
];
async function ready(page,path){await page.goto(path);await expect(page.locator("#ready")).toHaveText("Ready");}
for(const mode of modes){
 test(`installed ${mode.key} native read-only keeps copy selection history and exact durable recovery`,async({page})=>{
  await ready(page,mode.path);
  const initial=await page.evaluate(({name,local})=>{
   const t=window[name],e=local?t.editor:t.a,c=local?e:e.core;
   if(local){e.execute({kind:"setSelection",selection:t.range("p",1)});e.execute({kind:"insertPlainText",text:"Q"});e.execute({kind:"undo"});e.execute({kind:"setSelection",selection:t.range("p",0,1)});}
   else{e.select(t.range("p",1));c.type("Q");c.undo();e.select(t.range("p",0,1));}
   const v=e.view();window.readOnlyTest={before:v.documentJson,undo:v.undoDepth,redo:v.redoDepth,old:v.revision};
   const changed=e.setReadOnly(true),once=e.checkpointJson(),noop=!e.setReadOnly(true)&&once===e.checkpointJson();e.focus();
   return {changed,noop,locked:e.view().readOnly,policy:e.view().readOnlyRevision};
  },mode);
  expect(initial).toMatchObject({changed:true,noop:true,locked:true});expect(initial.policy).toMatch(/^\d+$/);
  const root=mode.local?"#editor":"#a",surface=page.locator(`${root} [role="textbox"]`);
  await expect(surface).toHaveAttribute("contenteditable","false");await expect(surface).toHaveAttribute("aria-readonly","true");await expect(surface).toHaveAttribute("tabindex","0");
  await expect(page.locator(`${root} figcaption`)).toHaveAttribute("contenteditable","false");
  await expect(page.locator(`${root} [data-${mode.local?"rich":"shared"}-action="bold"]`)).toBeDisabled();
  if(mode.v2)await expect(page.locator(`${root} [data-task-check="task-a"]`)).toBeDisabled();
  await page.keyboard.type("No");for(const key of ["Backspace","Delete","Enter","Control+b","Control+z","Meta+z"])await page.keyboard.press(key);
  const locked=await page.evaluate(async({name,local,v2})=>{
   const t=window[name],e=local?t.editor:t.a,c=local?e:e.core,s=e.surface,errors=[];
   const blocked=fn=>{try{fn();return false;}catch(error){errors.push(error.code??error.message);return true;}};
   const api=local?[blocked(()=>e.execute({kind:"insertPlainText",text:"API"})),blocked(()=>e.execute({kind:"undo"}))]:[blocked(()=>c.type("API")),blocked(()=>c.undo())];
   // These are event-path tests, not a claim of physical OS clipboard/IME testing.
   const input=new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertCompositionText",data:"No",isComposing:true});s.dispatchEvent(input);
   const clip=kind=>{const event=new ClipboardEvent(kind,{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});s.dispatchEvent(event);return {plain:event.clipboardData.getData("text/plain"),rich:event.clipboardData.getData("application/x-breditor-rich+json"),prevented:event.defaultPrevented};};
   const copy=clip("copy"),cut=clip("cut");const paste=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});paste.clipboardData.setData("text/plain","Paste");s.dispatchEvent(paste);
   const drop=new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()});drop.dataTransfer.items.add(new File(["bad"],"bad.png",{type:"image/png"}));s.dispatchEvent(drop);
   let ingests=0,fileRejected=true;
   if(local||v2){const ingest=t.assets.ingest;t.assets.ingest=async()=>{ingests++;throw Error("Must not store");};try{if(local)await e.insertImageFiles(t.assets,[new File(["bad"],"bad.png")],{parent:{kind:"document"},before:null});else await t.insertSharedImageFiles(c,t.assets,[new File(["bad"],"bad.png")],{parent:null,before:null});fileRejected=false;}catch{}finally{t.assets.ingest=ingest;}}
   // A late browser mutation is reconciled, never adopted as semantic content.
   s.querySelector('[data-rich-text="p"]').textContent="Unexpected DOM";s.dispatchEvent(new Event("input",{bubbles:true}));
   const unchanged=e.view().documentJson===window.readOnlyTest.before&&e.view().undoDepth===window.readOnlyTest.undo&&e.view().redoDepth===window.readOnlyTest.redo;
   const text=s.querySelector('[data-rich-text="p"]').textContent;
   const cell={table:"t",row:"r",column:"c"},grid={kind:"grid",anchor:cell,focus:cell};
   if(local){e.execute({kind:"setSelection",selection:grid});e.execute({kind:"navigateGrid",data:{movement:"right",extend:false}});}else{e.select(grid);c.navigate("right");}
   const navigated=e.view().selection.kind==="grid"&&e.view().readOnly===true;
   if(local)e.execute({kind:"setSelection",selection:t.range("caption",0)});else e.select(t.range("caption",0));
   const selection=e.view().selection.focus.block==="caption";
   return {api,errors,input:input.defaultPrevented,copy,cut,paste:paste.defaultPrevented,drop:drop.defaultPrevented,ingests,fileRejected,unchanged,text,navigated,selection,reported:t.errors};
  },mode);
  expect(locked).toMatchObject({api:[true,true],input:true,paste:true,drop:true,ingests:0,fileRejected:true,unchanged:true,text:"a🙂b",navigated:true,selection:true,reported:[]});
  expect(locked.errors.every(e=>String(e).includes("read_only"))).toBe(true);
  expect(locked.copy.plain).toBe("a");expect(locked.cut.plain).toBe("a");expect(locked.copy.rich.length).toBeGreaterThan(0);expect(locked.cut.prevented).toBe(true);
  const saved=await page.evaluate(async({name,local})=>{
   const t=window[name],e=local?t.editor:t.a,c=local?e:e.core;
   if(!local){t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Peer "}}]});await t.sync();if(e.view().readOnly!==true)throw Error("Remote unlocked owner");}
   const before=e.view().documentJson;e.setReadOnly(false);let stale=false;try{e.setReadOnly(true,window.readOnlyTest.old);}catch{stale=true;}
   if(local){e.execute({kind:"redo"});e.execute({kind:"undo"});}else{c.redo();c.undo();}
   const history=e.view().documentJson===before;
   // A saved publication does not save host permission. Restore starts editable.
   e.setReadOnly(true);
   if(local)t.save();else{await t.sync();await t.a.flush();await t.b.flush();}
   const value={document:e.view().documentJson,checkpoint:e.checkpointJson(),stale,history,errors:t.errors};if(!local){await t.a.close();await t.b.close();}return value;
  },mode);
  expect(saved).toMatchObject({stale:true,history:true,errors:[]});await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");
  expect(await page.evaluate(({name,local})=>{const t=window[name],e=local?t.editor:t.a;return {document:e.view().documentJson,checkpoint:e.checkpointJson(),editable:e.view().readOnly===undefined,guard:e.view().readOnlyRevision};},mode)).toEqual({document:saved.document,checkpoint:saved.checkpoint,editable:true,guard:undefined});
  await expect(page.locator(`${root} [role="textbox"]`)).toHaveAttribute("contenteditable","true");
  expect(await page.evaluate(({name,local})=>{const t=window[name],e=local?t.editor:t.a,c=local?e:e.core,before=e.view().documentJson;if(local){e.execute({kind:"redo"});e.execute({kind:"undo"});}else{c.redo();c.undo();}return e.view().documentJson===before;},mode)).toBe(true);
 });
}

for(const mode of modes.filter(m=>m.v2)){
 test(`installed ${mode.key} lock cancels provisional composition queued edits and remote holds`,async({page})=>{
  await ready(page,mode.path);
  const result=await page.evaluate(async({name,local})=>{
   const t=window[name],e=local?t.editor:t.a,c=local?e:e.core;
   if(local)e.execute({kind:"setSelection",selection:t.range("p",1)});else e.select(t.range("p",1));e.focus();
   const before=e.view().documentJson,depth=e.view().undoDepth;e.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));
   e.surface.querySelector('[data-rich-text="p"]').textContent="Provisional";
   if(local)e.execute({kind:"insertPlainText",text:"Queued"});else e.execute({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Queued"}}]});
   let held=0,received;if(!local){t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Peer "}}]});received=c.receiveFrame(t.b.core.updateFrame());held=c.pendingRemote().frames;}
   e.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}));e.setReadOnly(true);e.setReadOnly(false);
   await received;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const same=local?e.view().documentJson===before:e.surface.querySelector('[data-rich-text="caption"]').textContent==="Peer xy🙂";
   return {same,depth:e.view().undoDepth===depth,text:e.surface.querySelector('[data-rich-text="p"]').textContent,held,pending:local?0:c.pendingRemote().frames,errors:t.errors};
  },mode);
  expect(result).toEqual({same:true,depth:true,text:"a🙂b",held:mode.local?0:1,pending:0,errors:[]});
 });
}

for(const shared of [false,true]){
 test(`installed ${shared?"shared":"local"} React live read-only prop keeps one owner and history`,async({page})=>{
  await ready(page,shared?"/shared-react.html":"/react.html");
  await page.evaluate(shared=>{const t=shared?window.sharedReactSdk:window.reactSdk,e=t.ref.current.getEditor();t.original=e;t.before=e.view().documentJson;t.initialReady=t.ready;if(shared){e.core.type("Q");e.core.undo();}else{e.execute({kind:"setSelection",selection:t.range("p",1)});e.execute({kind:"insertPlainText",text:"Q"});e.execute({kind:"undo"});}t.history=[e.view().undoDepth,e.view().redoDepth];},shared);
  await page.locator("#read-only-toggle").click();await expect(page.locator('[role="textbox"]')).toHaveAttribute("aria-readonly","true");
  await page.evaluate(shared=>(shared?window.sharedReactSdk:window.reactSdk).ref.current.focus(),shared);await page.keyboard.type("No");
  await page.locator("#rerender").click();await expect(page.locator("#render-count")).toHaveText("1");
  expect(await page.evaluate(shared=>{const t=shared?window.sharedReactSdk:window.reactSdk,e=t.ref.current.getEditor();return {same:t.original===e,ready:t.ready===t.initialReady,document:e.view().documentJson===t.before,history:[e.view().undoDepth,e.view().redoDepth].join()===t.history.join(),locked:e.view().readOnly};},shared)).toEqual({same:true,ready:true,document:true,history:true,locked:true});
  await page.locator("#read-only-toggle").click();await expect(page.locator('[role="textbox"]')).toHaveAttribute("aria-readonly","false");
  expect(await page.evaluate(shared=>{const t=shared?window.sharedReactSdk:window.reactSdk,e=t.ref.current.getEditor();if(shared){e.core.redo();e.core.undo();}else{e.execute({kind:"redo"});e.execute({kind:"undo"});}const exact=e.view().documentJson===t.before;t.ref.current.setReadOnly(true);const locked=e.view().readOnly;t.ref.current.setReadOnly(false);return {exact,locked,errors:t.errors};},shared)).toEqual({exact:true,locked:true,errors:[]});
 });
}

for(const mode of modes.filter(m=>m.v2)){
 test(`installed ${mode.key} initial read-only is enforced before exposing the mounted owner`,async({page})=>{
  await ready(page,mode.path);
  expect(await page.evaluate(async({name,local})=>{
   const t=window[name],host=document.createElement("main");document.body.append(host);
   const e=local?await t.openLocalEditor({host,richLanguage:2,readOnly:true,initial:{kind:"document",documentJson:t.editor.view().documentJson}}):await t.openSharedEditor({...t.options,host,readOnly:true,database:"read-only-initial",writer:"505"});
   const before=e.checkpointJson();let blocked=false;try{if(local)e.execute({kind:"insertPlainText",text:"No"});else e.core.type("No");}catch{blocked=true;}
   const value={locked:e.view().readOnly,aria:e.surface.getAttribute("aria-readonly"),blocked,exact:before===e.checkpointJson()};if(local)e.dispose();else await e.close();host.remove();return value;
  },mode)).toEqual({locked:true,aria:"true",blocked:true,exact:true});
 });
}
