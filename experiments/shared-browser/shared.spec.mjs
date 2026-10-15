import {test,expect} from "@playwright/test";
import {compareEngineExports} from "../collaboration/browser/compare-exports.mjs";
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(()=>{const t=window.sharedTools;
  t.errors=[];t.node=(core,id)=>{const find=n=>n.properties?.["breditor/block-id"]===id?n:n.children?.map(find).find(Boolean);return find(JSON.parse(core.documentJson()).root);};t.text=n=>n?.text??(n?.children??[]).map(t.text).join("");
  t.caret=(block,offset=0)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
  t.insert=(block,offset,text)=>({kind:"insert_text",data:{block,offset,text}});
  t.peers=()=>{const rawA=new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101"),rawB=t.wasm.RichReplicaProbe.join_frame("room","202",rawA.update_frame()),a=new t.SharedRichEditor(rawA),b=new t.SharedRichEditor(rawB);return{a,b};};
  t.mount=(core,name)=>t.mountSharedEditor(document.querySelector(`#${name}`),{core,label:`Writer ${name}`,image:{asset:"asset",alt:"New image"},onError:error=>t.errors.push(String(error)),resolveAsset:()=>"data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>')});
  t.sync=async(a,b)=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("Replicas differ");};
  // Synthetic event-path evidence only: Firefox gives the event its own data store.
  t.clipboard=(surface,kind,source=new DataTransfer())=>{const event=new ClipboardEvent(kind,{bubbles:true,cancelable:true,clipboardData:source});if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));surface.dispatchEvent(event);return event.clipboardData;};
 });
});

test("two mounted editors type offline then converge with writer-local undo and real DOM input",async({page})=>{
 await page.evaluate(()=>{const t=window.sharedTools,{a,b}=t.peers();t.a=a;t.b=b;t.da=t.mount(a,"a");t.db=t.mount(b,"b");t.da.select(t.caret("p",4));});
 await page.keyboard.type(" Alice");
 await page.evaluate(()=>{const t=window.sharedTools;t.db.select(t.caret("caption",0));});await page.keyboard.type("Bob ");
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools;await t.sync(t.a,t.b);const merged=t.text(t.node(t.a,"p")),caption=t.text(t.node(t.a,"caption"));t.a.undo();await t.sync(t.a,t.b);const undone={p:t.text(t.node(t.a,"p")),caption:t.text(t.node(t.a,"caption"))};return JSON.stringify({merged,caption,undone,errors:t.errors});}));
 expect(r).toEqual({merged:"a🙂b Alice",caption:"Bob xy🙂",undone:{p:"a🙂b Alic",caption:"Bob xy🙂"},errors:[]});
});

test("remote publication waits for holds and never steals the other editor's native selection",async({page})=>{
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,{a,b}=t.peers(),da=t.mount(a,"a"),db=t.mount(b,"b");db.select(t.caret("caption",1));
  const release=a.holdRemotes(),before=a.documentJson();b.dispatch({commands:[t.insert("p",0,"R")]});const focus=document.activeElement,selection=document.getSelection().anchorNode,ownFocus=focus===db.surface||db.surface.contains(focus),ownSelection=db.surface.contains(selection);let settled=false;const pending=a.receiveFrame(b.updateFrame()).then(()=>settled=true);await Promise.resolve();const queued=a.pendingRemote(),held=a.documentJson()===before&&!settled;release();await pending;const result={held,queued,settled,text:t.text(t.node(a,"p")),ownFocus,ownSelection,focus:focus===document.activeElement,selection:selection===document.getSelection().anchorNode};da.dispose();db.dispose();return JSON.stringify(result);}));
 expect(r.held).toBe(true);expect(r.queued.frames).toBe(1);expect(r).toMatchObject({settled:true,text:"Ra🙂b",ownFocus:true,ownSelection:true,focus:true,selection:true});
});

test("toolbar creates and reorders stable table axes then merges splits headers and clears one rich grid",async({page})=>{
 await page.evaluate(()=>{const t=window.sharedTools,{a,b}=t.peers();b.dispose();t.a=a;t.da=t.mount(a,"a");t.da.select({kind:"node",block:"table-block"});});
 await page.locator('#a [data-shared-action="table"]').click();
 await page.evaluate(()=>{const t=window.sharedTools,table=JSON.parse(t.a.documentJson()).root.children[1];t.table=table.properties["breditor/table-id"];t.tableBlock=table.properties["breditor/block-id"];const view=t.a.view().tables.find(v=>v.id===t.table),cell={table:t.table,row:view.rows[0],column:view.columns[0].id};t.da.select({kind:"grid",anchor:cell,focus:cell});});
 await page.locator('#a [data-shared-action="add-row"]').click();await page.locator('#a [data-shared-action="add-column"]').click();
 await page.locator('#a [data-shared-action="column-previous"]').click();await page.locator('#a [data-shared-action="row-previous"]').click();
 await page.evaluate(()=>{const t=window.sharedTools,v=t.a.view().tables.find(v=>v.id===t.table);t.da.select({kind:"grid",anchor:{table:t.table,row:v.rows[0],column:v.columns[0].id},focus:{table:t.table,row:v.rows[1],column:v.columns[1].id}});});
 await page.locator('#a [data-shared-action="merge"]').click();await page.locator('#a [data-shared-action="header"]').click();await page.locator('#a [data-shared-action="clear"]').click();await page.locator('#a [data-shared-action="split"]').click();
 const r=JSON.parse(await page.evaluate(()=>{const t=window.sharedTools,v=t.a.view().tables.find(v=>v.id===t.table);return JSON.stringify({rows:v.rows.length,columns:v.columns.length,sources:v.cells.filter(c=>c.rowSpan>1||c.columnSpan>1).length,headers:document.querySelectorAll('#a th').length,errors:t.errors});}));expect(r).toMatchObject({rows:3,columns:3,sources:0,headers:4,errors:[]});
});

test("list toolbar and native Enter preserve rich tails while indent outdent and heading history remain usable",async({page})=>{
 await page.evaluate(()=>{const t=window.sharedTools,{a,b}=t.peers();b.dispose();t.a=a;t.da=t.mount(a,"a");t.da.select(t.caret("p",4));});await page.keyboard.press("Enter");await page.keyboard.type("Second");
 await page.evaluate(()=>{const t=window.sharedTools,second=t.a.view().selection.focus.block;t.second=second;t.da.select({kind:"text",anchor:t.caret("p",0).anchor,focus:t.caret(second,6).focus});});
 await page.locator('#a [data-shared-action="numbered"]').click();await page.evaluate(()=>{const t=window.sharedTools;t.da.select(t.caret(t.second,2));});await page.locator('#a [data-shared-action="indent"]').click();await page.locator('#a [data-shared-action="outdent"]').click();await page.locator('#a [data-shared-action="h2"]').click();await page.locator('#a [data-shared-action="undo"]').click();await page.locator('#a [data-shared-action="redo"]').click();
 const r=JSON.parse(await page.evaluate(()=>{const t=window.sharedTools;return JSON.stringify({kind:t.node(t.a,t.second).type,text:t.text(t.node(t.a,t.second)),lists:document.querySelectorAll('#a ol').length,caption:t.text(t.node(t.a,"caption")),errors:t.errors});}));expect(r).toEqual({kind:"breditor/heading",text:"Second",lists:1,caption:"xy🙂",errors:[]});
});

test("DOM rich clipboard paste at a text selection is one undo group and keeps the remote original suffix",async({page})=>{
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,{a,b}=t.peers(),da=t.mount(a,"a");t.mount(b,"b");da.select({kind:"node",block:"image-block"});const copy=t.clipboard(da.surface,"copy");if(!copy.getData("application/x-breditor-rich+json"))throw Error("Copy did not retain its semantic payload");da.select({kind:"text",anchor:t.caret("p",3).anchor,focus:t.caret("p",1).focus});const depth=a.view().undoDepth;t.clipboard(da.surface,"paste",copy);b.dispatch({commands:[t.insert("p",4,"!")]});await t.sync(a,b);const suffix=a.view().selection.focus.block,after={prefix:t.text(t.node(a,"p")),suffix:t.text(t.node(a,suffix)),depth:a.view().undoDepth-depth};a.undo();await t.sync(a,b);return JSON.stringify({after,original:t.text(t.node(a,"p")),errors:t.errors});}));expect(r).toEqual({after:{prefix:"a",suffix:"b!",depth:1},original:"a🙂b!",errors:[]});
});

test("composition holds remote updates until its single Rust commit and maps the caret afterward",async({page})=>{
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,{a,b}=t.peers(),da=t.mount(a,"a");t.mount(b,"b");da.select(t.caret("p",4));const depth=a.view().undoDepth;da.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));const block=da.surface.querySelector('[data-rich-text="p"]');block.textContent="a🙂bIME";b.dispatch({commands:[t.insert("caption",0,"R")]});const pending=a.receiveFrame(b.updateFrame()),queued=a.pendingRemote().frames;da.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);await pending;return JSON.stringify({queued,p:t.text(t.node(a,"p")),caption:t.text(t.node(a,"caption")),depth:a.view().undoDepth-depth,errors:t.errors});}));expect(r).toEqual({queued:1,p:"a🙂bIME",caption:"Rxy🙂",depth:1,errors:[]});
});

test("bounded remote queues reject overflow and disposal cancels every pending receipt",async({page})=>{
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,raw=new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101"),a=new t.SharedRichEditor(raw,{maxPendingFrames:1}),b=new t.SharedRichEditor(t.wasm.RichReplicaProbe.join_frame("room","202",a.updateFrame()));const release=a.holdRemotes();b.dispatch({commands:[t.insert("p",0,"R")]});const pending=a.receiveFrame(b.updateFrame()).then(()=>"applied",e=>e.code);let overflow;try{await a.receiveFrame(b.updateFrame());}catch(e){overflow=e.code;}a.dispose();release();const disposed=await pending;b.dispose();return JSON.stringify({overflow,disposed});}));expect(r).toEqual({overflow:"remote_queue_full",disposed:"disposed"});
});

test("native selected-flow journal reloads with exact future operations through the real shared wrapper",async({page})=>{
 const checkpoint=await page.evaluate(()=>window.sharedTools.vector.shared_paste_at_text.checkpoint);await page.reload();await expect(page.locator("#status")).toHaveText("Ready");
 const r=JSON.parse(await page.evaluate(checkpoint=>{const t=window.sharedTools,v=t.vector.shared_paste_at_text,a=new t.SharedRichEditor(t.wasm.RichReplicaProbe.restore("room",checkpoint));try{const cases=[],actual={},expected={},capture=name=>{actual[name]={view:JSON.stringify(a.view()),checkpoint:a.checkpointJson()};expected[name]={view:JSON.stringify(JSON.parse(v[name].view)),checkpoint:v[name].checkpoint};cases.push({name,native:v[name].bytes,wasm:JSON.parse(a.updateFrame()).bytes});};capture("current");a.redo();capture("redo");const point={block:"native-flow-suffix",offset:"2",affinity:"after"};a.select({kind:"text",anchor:point,focus:point});a.type(" typed");capture("typed");a.undo();capture("undo");a.redo();capture("repeated");return JSON.stringify({cases,actual,expected});}finally{a.dispose();}},checkpoint));for(const value of await compareEngineExports(r.cases))expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});expect(r.actual).toEqual(r.expected);
});

test("empty and unsupported clipboard transfers cannot delete a selected range",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.sharedTools,{a,b}=t.peers();b.dispose();const da=t.mount(a,"a");da.select({kind:"text",anchor:t.caret("p",3).anchor,focus:t.caret("p",1).focus});const before=a.checkpointJson();t.clipboard(da.surface,"paste");const html=new DataTransfer();html.setData("text/html","<b>ignored</b>");t.clipboard(da.surface,"paste",html);const empty=new DataTransfer();empty.setData("text/plain","");t.clipboard(da.surface,"paste",empty);return JSON.stringify({exact:a.checkpointJson()===before,errors:t.errors});}));expect(r).toEqual({exact:true,errors:[]});
});

test("invalid queued frames reject independently and valid successors still admit",async({page})=>{
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,{a,b}=t.peers(),release=a.holdRemotes();b.dispatch({commands:[t.insert("p",0,"R")]});const wrong=JSON.parse(b.updateFrame());wrong.modelVersion=999;wrong.bytes=[255];const rejected=a.receiveFrame(JSON.stringify(wrong)).then(()=>false,()=>true),accepted=a.receiveFrame(b.updateFrame());release();const result={rejected:await rejected,accepted:await accepted,text:t.text(t.node(a,"p")),pending:a.pendingRemote().frames};a.dispose();b.dispose();return JSON.stringify(result);}));expect(r).toEqual({rejected:true,accepted:true,text:"Ra🙂b",pending:0});
});

test("image toolbar edits paired metadata and preserves another writer's caption through Undo",async({page})=>{
 await page.evaluate(()=>{const t=window.sharedTools,{a,b}=t.peers();t.a=a;t.b=b;t.da=t.mount(a,"a");t.da.select({kind:"node",block:"image-block"});});
 await page.locator('#a [data-shared-action="decorative"]').click();await page.locator('#a [data-shared-field="alt"]').fill("Updated description");await page.locator('#a [data-shared-action="alt"]').click();await page.locator('#a [data-shared-field="image-width"]').fill("240");await page.locator('#a [data-shared-action="image-width"]').click();await page.locator('#a [data-shared-field="asset"]').fill("alternate-asset");await page.locator('#a [data-shared-action="asset"]').click();
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools;t.b.dispatch({commands:[t.insert("caption",0,"Remote ")]});await t.sync(t.a,t.b);const after=t.node(t.a,"image-block").properties;t.a.undo();await t.sync(t.a,t.b);const undo=t.node(t.a,"image-block").properties;t.a.redo();await t.sync(t.a,t.b);return JSON.stringify({after,undo,caption:t.text(t.node(t.a,"caption")),redo:t.node(t.a,"image-block").properties,errors:t.errors});}));expect(r.after).toMatchObject({"breditor/alt-text":"Updated description","breditor/decorative":false,"breditor/width":240,"breditor/height":240,"breditor/asset-id":"alternate-asset"});expect(r.undo["breditor/asset-id"]).toBe("asset");expect(r.redo).toEqual(r.after);expect(r).toMatchObject({caption:"Remote xy🙂",errors:[]});
});

test("file paste and drop persist bytes before shared insertion and restore exact media history",async({page})=>{
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,{a,b}=t.peers(),name=`shared-assets-${crypto.randomUUID()}`,store=await t.RichAssetStore.open(name);let pending=Promise.resolve();
  const da=t.mountSharedEditor(document.querySelector("#a"),{core:a,onFiles:(files,position,revision)=>(pending=t.insertSharedImageFiles(a,store,files,position,revision)),onError:e=>t.errors.push(String(e))});da.select({kind:"node",block:"table-block"});
  const canvas=document.createElement("canvas");canvas.width=canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png")),file=new File([blob],"pixel.png",{type:"image/png"});
  const paste=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:new DataTransfer()});paste.clipboardData.items.add(file);da.surface.dispatchEvent(paste);await pending;
  const data=new DataTransfer();data.items.add(file);const drop=new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data});if(drop.dataTransfer.files.length===0)drop.dataTransfer.items.add(file);da.surface.dispatchEvent(drop);await pending;await t.sync(a,b);
  const checkpoint=a.checkpointJson(),documentJson=a.documentJson(),assets=await store.list(),asset=assets[0].asset;da.dispose();store.close();const reopened=await t.RichAssetStore.open(name),restored=new t.SharedRichEditor(t.wasm.RichReplicaProbe.restore("room",checkpoint));
  const before=restored.documentJson()===documentJson;restored.undo();const undone=JSON.parse(restored.documentJson()).root.children.length;restored.redo();const exact=restored.documentJson()===documentJson,bytes=(await reopened.blob(asset)).size;await t.sync(restored,b);restored.dispose();b.dispose();reopened.close();return JSON.stringify({before,undone,exact,assets:assets.length,status:assets[0].status,bytes,errors:t.errors});}));expect(r).toMatchObject({before:true,undone:2,exact:true,assets:1,status:"pending",errors:[]});expect(r.bytes).toBeGreaterThan(0);
});
