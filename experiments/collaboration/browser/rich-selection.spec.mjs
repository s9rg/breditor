import {test,expect} from "@playwright/test";

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json();
  window.sharedSelection={wasm};
  window.makeSelectionPeers=()=>{const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());return {a,b};};
  window.syncSelectionPeers=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("Shared documents differ");};
  window.caret=(block,offset,affinity="after")=>({kind:"text",anchor:{block,offset:String(offset),affinity},focus:{block,offset:String(offset),affinity}});
  window.select=(owner,selection)=>{const observation=owner.observe();try{return owner.set_selection(observation,JSON.stringify(selection));}finally{observation.free();}};
  window.pending=(owner,formats)=>{const observation=owner.observe();try{return owner.set_pending_formats(observation,JSON.stringify(formats));}finally{observation.free();}};
  window.dispatch=(owner,commands,selectionUpdate={kind:"map"},pendingFormatsUpdate={kind:"map"})=>{const observation=owner.observe();try{return owner.dispatch(observation,JSON.stringify({commands,selectionUpdate,pendingFormatsUpdate}));}finally{observation.free();}};
  window.typeShared=(owner,text)=>{const observation=owner.observe();try{return owner.insert_plain_text(observation,text);}finally{observation.free();}};
  window.historyShared=(owner,redo=false)=>{const observation=owner.observe();try{return redo?owner.redo_observed(observation):owner.undo_observed(observation);}finally{observation.free();}};
  window.sharedView=owner=>JSON.parse(owner.view_json());
  window.findShared=(node,block)=>node.properties?.["breditor/block-id"]===block?node:node.children?.map(node=>window.findShared(node,block)).find(Boolean);
 });
});

test("opaque observations include local selection and pending state and reject before malformed JSON",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();let old,foreign,current;
  try{
   old=a.observe();foreign=b.observe();const updates=Array.from(a.updates()),version=a.causal_version();window.select(a,window.caret("p",1));
   const before=a.checkpoint(),failures=[];for(const observation of [old,foreign])try{a.dispatch(observation,"not valid JSON");}catch(error){failures.push(String(error));}
   const unchanged=a.checkpoint()===before;window.pending(a,[]);current=a.observe();const noop=a.set_pending_formats(current,"[]");
   const same=a.causal_version()===version&&Array.from(a.updates()).join(",")===updates.join(",");
   const frozen=current.view_json();a.free();return {failures,unchanged,same,noop,frozen,stillFrozen:current.view_json()===frozen};
  }finally{old?.free();foreign?.free();current?.free();if(a.__wbg_ptr)a.free();b.free();}
 });
 expect(result.failures).toHaveLength(2);expect(result.failures.every(value=>value.includes("stale or foreign shared observation"))).toBe(true);
 expect(result.unchanged).toBe(true);expect(result.same).toBe(true);expect(result.noop).toBe(false);expect(result.stillFrozen).toBe(true);
 const view=JSON.parse(result.frozen);expect(view.selection.focus.offset).toBe("1");expect(view.pendingFormatsJson).toBe("[]");expect(view.undoDepth).toBe(0);
});

test("strict selection decimals and pending literal fields reject without changing a current guard",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();let observation;try{
   window.select(a,window.caret("p",1));observation=a.observe();const before=a.checkpoint(),failures=[];
   for(const selection of [window.caret("p","01"),{kind:"text",anchor:{block:"p",offset:1,affinity:"after"},focus:{block:"p",offset:"1",affinity:"after"}}])try{a.set_selection(observation,JSON.stringify(selection));}catch(error){failures.push(String(error));}
   try{a.set_pending_formats(observation,'[{"type":"breditor/strong","type":"breditor/strong","properties":{}}]');}catch(error){failures.push(String(error));}
   return {count:failures.length,unchanged:a.checkpoint()===before,noop:a.set_selection(observation,JSON.stringify(window.caret("p",1)))};
  }finally{observation?.free();a.free();b.free();}
 });
 expect(result).toEqual({count:3,unchanged:true,noop:false});
});

test("shared Wasm causal affinity preserves directional ranges and scalar boundaries",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();try{
   const point=(offset,affinity)=>({block:"p",offset:String(offset),affinity});
   window.select(a,{kind:"text",anchor:point(1,"before"),focus:point(1,"after")});window.pending(a,[{type:"breditor/strong",properties:{}}]);
   window.dispatch(b,[{kind:"insert_text",data:{block:"p",offset:1,text:"🙂"}}]);a.receive_frame(b.update_frame());
   const view=window.sharedView(a),before=a.checkpoint();let rejected=false;try{window.select(a,window.caret("p",2));}catch{rejected=a.checkpoint()===before;}
   return {view,rejected};
  }finally{a.free();b.free();}
 });
 expect(result.view.selection.anchor.offset).toBe("1");expect(result.view.selection.focus.offset).toBe("3");expect(result.view.pendingFormatsJson).toBeNull();expect(result.view.selectionOutcome.kind).toBe("relocated");expect(result.rejected).toBe(true);
});

test("grid endpoints follow original axes and deletion does not choose concurrently created rows",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();try{
   const grid={kind:"grid",anchor:{table:"t",row:"r",column:"c"},focus:{table:"t",row:"r",column:"c"}};window.select(a,grid);
   window.dispatch(b,[{kind:"insert_row",data:{block:"table-block",row_block:"new-row",row:"r-new",before:null}},{kind:"delete_block",data:{block:"row"}}]);a.receive_frame(b.update_frame());
   const view=window.sharedView(a);return {selection:view.selection,outcome:view.selectionOutcome,rows:view.tables[0].rows};
  }finally{a.free();b.free();}
 });
 expect(result.selection).toBeNull();expect(result.outcome).toEqual({kind:"cleared",reason:"target_deleted"});expect(result.rows).toEqual(["r-new"]);
});

test("shared node and caption selection follow structural moves and hidden tables clear explicitly",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();try{
   window.select(a,window.caret("caption",2));window.pending(a,[{type:"breditor/strong",properties:{}}]);
   window.dispatch(b,[{kind:"move_block",data:{block:"image-block",parent:null,before:"table-block"}}]);a.receive_frame(b.update_frame());const moved=window.sharedView(a);
   window.select(a,{kind:"node",block:"table-block"});window.dispatch(b,[{kind:"delete_column",data:{block:"table-block",column:"c"}}]);a.receive_frame(b.update_frame());const hidden=window.sharedView(a);
   return {moved,hidden};
  }finally{a.free();b.free();}
 });
 expect(result.moved.selection.focus).toMatchObject({block:"caption",offset:"2"});expect(JSON.parse(result.moved.pendingFormatsJson)).toEqual([{type:"breditor/strong",properties:{}}]);
 expect(result.hidden.selection).toBeNull();expect(result.hidden.selectionOutcome).toEqual({kind:"cleared",reason:"hidden_table"});
});

test("real shared plain typing respects pending plain formats and one advanced-caret history group",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();try{
   window.select(a,window.caret("p",1,"before"));window.pending(a,[]);window.typeShared(a,"Plain🙂");
   const typed=window.sharedView(a),doc=JSON.parse(typed.documentJson),p=window.findShared(doc.root,"p");window.historyShared(a);const undone=window.sharedView(a);window.historyShared(a,true);const redone=window.sharedView(a);
   return {typed,undone,redone,runs:p.children};
  }finally{a.free();b.free();}
 });
 expect(result.typed.undoDepth).toBe(1);expect(result.typed.selection.focus.offset).toBe("8");expect(result.runs[1]).toMatchObject({text:"Plain🙂",formats:[]});
 expect(result.undone.selection.focus.offset).toBe("1");expect(result.undone.pendingFormatsJson).toBe("[]");expect(result.redone.documentJson).toBe(result.typed.documentJson);expect(result.redone.selection).toEqual(result.typed.selection);
});

test("action Undo and Redo restore saved causal selections rather than the current mouse caret",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();try{
   window.select(a,window.caret("p",1,"before"));window.pending(a,[{type:"breditor/strong",properties:{}}]);
   window.dispatch(a,[{kind:"insert_text",data:{block:"p",offset:1,text:"local"}}],{kind:"set",value:window.caret("p",6)},{kind:"set",value:[]});
   window.dispatch(b,[{kind:"insert_text",data:{block:"p",offset:0,text:"R"}}]);a.receive_frame(b.update_frame());window.select(a,window.caret("caption",0));
   window.historyShared(a);const undo=window.sharedView(a);window.historyShared(a,true);return {undo,redo:window.sharedView(a)};
  }finally{a.free();b.free();}
 });
 expect(result.undo.selection.focus).toMatchObject({block:"p",offset:"2",affinity:"before"});expect(JSON.parse(result.undo.pendingFormatsJson)).toEqual([{type:"breditor/strong",properties:{}}]);
 expect(result.redo.selection.focus).toMatchObject({block:"p",offset:"7",affinity:"after"});expect(result.redo.pendingFormatsJson).toBe("[]");
});

test("recreated text carets keep exact offsets across offline edits repeated Redo and writer restart",async({page})=>{
 const result=await page.evaluate(()=>{
  const results=[];
  for(const affinity of ["before","after"]){const {a,b}=window.makeSelectionPeers();let restored;try{
   window.select(a,window.caret("p",1,"before"));const node={kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"created-text"},children:[{kind:"text",text:"New🙂",formats:[]}]};
   window.dispatch(a,[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[node]}}],{kind:"set",value:window.caret("created-text",1,affinity)});b.receive_frame(a.update_frame());window.historyShared(a);
   window.dispatch(b,[{kind:"insert_text",data:{block:"created-text",offset:0,text:"R🙂"}}]);a.receive_frame(b.update_frame());
   restored=window.sharedSelection.wasm.RichReplicaProbe.restore("room",a.checkpoint());
   for(let cycle=0;cycle<3;cycle++){
    window.historyShared(a,true);window.historyShared(restored,true);const view=window.sharedView(a),text=window.findShared(JSON.parse(view.documentJson).root,"created-text").children.map(run=>run.text).join("");
    const offset=text.indexOf("New🙂")+1; // JS string indices and Breditor positions are both UTF-16 here.
    results.push({offset:view.selection.focus.offset,expected:String(offset),same:a.view_json()===restored.view_json(),bytes:Array.from(a.updates()).join(",")===Array.from(restored.updates()).join(",")});
    window.historyShared(a);window.historyShared(restored);
   }
  }finally{a.free();b.free();restored?.free();}}
  return results;
 });
 expect(result).toHaveLength(6);for(const value of result){expect(value.offset).toBe(value.expected);expect(value.same).toBe(true);expect(value.bytes).toBe(true);}
});

test("failed post-selection publication is atomic and real page reload keeps current UI and future history",async({page})=>{
 const saved=await page.evaluate(()=>{
  const {a,b}=window.makeSelectionPeers();let observation;
  try{
   window.select(a,window.caret("p",1,"before"));window.pending(a,[]);observation=a.observe();const before=a.checkpoint();let rejected=false;
   try{a.dispatch(observation,JSON.stringify({commands:[{kind:"insert_text",data:{block:"p",offset:1,text:"partial"}}],selectionUpdate:{kind:"set",value:window.caret("missing",0)}}));}catch{rejected=a.checkpoint()===before&&a.view_json()===observation.view_json();}
   window.typeShared(a,"Typed🙂");window.dispatch(b,[{kind:"insert_text",data:{block:"p",offset:0,text:"R"}}]);a.receive_frame(b.update_frame());
   const checkpoint=a.checkpoint(),current=a.view_json();window.historyShared(a);const undo=a.view_json();window.historyShared(a,true);return {checkpoint,current,undo,redo:a.view_json(),rejected};
  }finally{observation?.free();a.free();b.free();}
 });
 expect(saved.rejected).toBe(true);await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const restored=await page.evaluate(async saved=>{const wasm=await import("/probe.js"),owner=wasm.RichReplicaProbe.restore("room",saved.checkpoint);try{const current=owner.view_json();let observation=owner.observe();try{owner.undo_observed(observation);}finally{observation.free();}const undo=owner.view_json();observation=owner.observe();try{owner.redo_observed(observation);}finally{observation.free();}return {current,undo,redo:owner.view_json()};}finally{owner.free();}},saved);
 expect(restored).toEqual({current:saved.current,undo:saved.undo,redo:saved.redo});
});
