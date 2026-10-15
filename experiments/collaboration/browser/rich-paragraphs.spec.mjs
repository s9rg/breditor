import {test,expect} from "@playwright/test";
import {compareEngineExports} from "./compare-exports.mjs";

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json();
  window.paragraphWasm=wasm;window.paragraphVector=vector;
  window.peers=()=>{const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());return {a,b};};
  window.point=(block,offset,affinity="after")=>({block,offset:String(offset),affinity});
  window.caret=(block,offset,affinity="after")=>({kind:"text",anchor:window.point(block,offset,affinity),focus:window.point(block,offset,affinity)});
  window.select=(owner,value)=>{const observed=owner.observe();try{return owner.set_selection(observed,JSON.stringify(value));}finally{observed.free();}};
  window.dispatch=(owner,commands,selectionUpdate={kind:"map"},pendingFormatsUpdate={kind:"map"})=>{const observed=owner.observe();try{return owner.dispatch(observed,JSON.stringify({commands,selectionUpdate,pendingFormatsUpdate}));}finally{observed.free();}};
  window.paragraphHistory=(owner,redo=false)=>{const observed=owner.observe();try{return redo?owner.redo_observed(observed):owner.undo_observed(observed);}finally{observed.free();}};
  window.type=(owner,text)=>{const observed=owner.observe();try{return owner.insert_plain_text(observed,text);}finally{observed.free();}};
  window.split=(block,offset,right,right_heading=null)=>({kind:"split_text_block",data:{block,offset,right,right_heading}});
  window.join=(left,right)=>({kind:"join_text_blocks",data:{left,right}});
  window.insert=(block,offset,text)=>({kind:"insert_text",data:{block,offset,text}});
  window.paragraphFind=(node,block)=>node.properties?.["breditor/block-id"]===block?node:node.children?.map(node=>window.paragraphFind(node,block)).find(Boolean);
  window.node=(owner,block)=>window.paragraphFind(JSON.parse(owner.document_json()).root,block);
  window.text=(owner,block)=>window.node(owner,block)?.children.map(run=>run.text??"").join("")??null;
  window.children=(owner,block)=>window.node(owner,block).children.map(node=>node.properties["breditor/block-id"]);
  window.sync=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("Paragraph documents did not converge");};
 });
});

test("real shared paragraph split maps causal boundary affinities and preserves typed heading formats",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const {a,b}=window.peers();try{
   window.select(a,{kind:"text",anchor:window.point("p",1,"before"),focus:window.point("p",1)});
   window.dispatch(a,[window.split("p",1,"right",2)]);
   const after=JSON.parse(a.view_json()),right=window.node(a,"right"),order=window.children(a,"cell");window.paragraphHistory(a);const undo=JSON.parse(a.view_json());window.paragraphHistory(a,true);
   return JSON.stringify({after,right,order,undo,redo:JSON.parse(a.view_json()),model:JSON.parse(a.update_frame()).modelVersion,journal:JSON.parse(a.checkpoint()).version});
  }finally{a.free();b.free();}
 }));
 expect(result.order).toEqual(["p","right","image-block"]);expect(result.right.type).toBe("breditor/heading");expect(result.right.properties["breditor/level"]).toBe(2);
 expect(result.right.children).toEqual([{kind:"text",text:"🙂b",formats:[{type:"breditor/strong",properties:{}}]}]);
 expect(result.after.selection.anchor).toMatchObject({block:"p",offset:"1"});expect(result.after.selection.focus).toMatchObject({block:"right",offset:"0"});
 expect(result.undo.selection.focus).toMatchObject({block:"p",offset:"1"});expect(result.redo.selection).toEqual(result.after.selection);expect(result.model).toBe(10);expect(result.journal).toBe(11);
});

test("offline text and inherited format annotations survive selective split and format Undo",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const pair=window.peers(),other=window.peers();try{
   const {a,b}=pair;window.dispatch(a,[window.split("p",1,"right")]);window.dispatch(b,[window.insert("p",3,"X")]);window.sync(a,b);
   const split=window.text(a,"right");window.paragraphHistory(a);const undone={p:window.text(a,"p"),right:window.text(a,"right")};window.paragraphHistory(a,true);
   const x=other.a,y=other.b;window.dispatch(x,[{kind:"set_format",data:{block:"p",offset:0,length:4,format:{type:"breditor/strong",properties:{}},enabled:false}}]);window.dispatch(y,[window.insert("p",1,"X")]);window.sync(x,y);
   window.paragraphHistory(x);const restored=window.node(x,"p").children;window.paragraphHistory(x,true);
   return JSON.stringify({split,undone,redone:window.text(a,"right"),restored,unformatted:window.node(x,"p").children});
  }finally{pair.a.free();pair.b.free();other.a.free();other.b.free();}
 }));
 expect(result).toMatchObject({split:"🙂Xb",undone:{p:"a🙂Xb",right:null},redone:"🙂Xb"});
 expect(result.restored).toEqual([{kind:"text",text:"aX🙂b",formats:[{type:"breditor/strong",properties:{}}]}]);expect(result.unformatted).toEqual([{kind:"text",text:"aX🙂b",formats:[]}]);
});

test("one shared group can type split address the new paragraph and join with exact caret history",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const {a,b}=window.peers();try{
   const initial=a.document_json();window.select(a,window.caret("p",1,"before"));window.dispatch(a,[window.insert("p",0,"Q"),window.split("p",2,"right"),window.insert("right",0,"R"),window.join("p","right")],{kind:"set",value:window.caret("p",6)});
   const after=JSON.parse(a.view_json()),steps=[];for(let i=0;i<3;i++){window.paragraphHistory(a);steps.push({restored:a.document_json()===initial,selection:JSON.parse(a.view_json()).selection});window.paragraphHistory(a,true);steps.push({text:window.text(a,"p"),selection:JSON.parse(a.view_json()).selection});}
   return JSON.stringify({after,steps,order:window.children(a,"cell")});
  }finally{a.free();b.free();}
 }));
 expect(result.after.undoDepth).toBe(1);expect(result.order).toEqual(["p","image-block"]);
 for(let i=0;i<6;i++)if(i%2){expect(result.steps[i].text).toBe("QaR🙂b");expect(result.steps[i].selection.focus.offset).toBe("6");}else{expect(result.steps[i].restored).toBe(true);expect(result.steps[i].selection.focus).toMatchObject({block:"p",offset:"1"});}
});

test("normalized cells retain both empty split paragraphs and reject bad boundaries without publication",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const {a,b}=window.peers();let observed;try{
   observed=a.observe();const initial=a.checkpoint();let rejected=0;
   for(const command of [window.split("p",2,"half-emoji"),window.split("caption",1,"caption-right"),window.join("p","caption")])try{a.dispatch(observed,JSON.stringify({commands:[command]}));}catch{if(a.checkpoint()!==initial)throw Error("Partial invalid split");rejected++;}
   window.dispatch(a,[{kind:"delete_block",data:{block:"p"}},{kind:"delete_block",data:{block:"image-block"}}]);const fallback=window.children(a,"cell")[0],before=a.document_json();window.select(a,window.caret(fallback,0));window.dispatch(a,[window.split(fallback,0,"right")]);const order=window.children(a,"cell"),selection=JSON.parse(a.view_json()).selection;window.paragraphHistory(a);
   return JSON.stringify({rejected,fallback,order,selection,restored:a.document_json()===before});
  }finally{observed?.free();a.free();b.free();}
 }));
 expect(result.rejected).toBe(3);expect(result.order).toEqual([result.fallback,"right"]);expect(result.selection.focus).toMatchObject({block:"right",offset:"0"});expect(result.restored).toBe(true);
});

test("atomic groups map pending formats and original grid fallback only at their final boundary",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const {a,b}=window.peers();try{
   window.select(a,window.caret("p",1));let observed=a.observe();try{a.set_pending_formats(observed,"[]");}finally{observed.free();}
   window.dispatch(a,[window.split("p",1,"right"),window.join("p","right")]);const pending=JSON.parse(a.view_json()).pendingFormatsJson;
   const cell={table:"t",row:"r",column:"c"};window.select(b,{kind:"grid",anchor:cell,focus:cell});
   window.dispatch(b,[{kind:"insert_row",data:{block:"table-block",row_block:"new-row",row:"new-r",before:null}},{kind:"delete_block",data:{block:"row"}}]);
   const grid=JSON.parse(b.view_json());window.paragraphHistory(b);const restored=JSON.parse(b.view_json()).selection;window.paragraphHistory(b,true);
   return JSON.stringify({pending,grid,restored,redone:JSON.parse(b.view_json()).selection});
  }finally{a.free();b.free();}
 }));
 expect(result.pending).toBe("[]");expect(result.grid.selection).toBeNull();expect(result.grid.selectionOutcome).toEqual({kind:"cleared",reason:"target_deleted"});
 expect(result.restored.anchor).toEqual({table:"t",row:"r",column:"c"});expect(result.redone).toBeNull();
});

test("independent empty-right sources and paired end bindings survive real page reload and history",async({page})=>{
 const saved=await page.evaluate(()=>{
  const {a,b}=window.peers();try{window.select(a,window.caret("p",4));window.dispatch(a,[window.split("p",4,"right")]);window.type(a,"New🙂");return {checkpoint:a.checkpoint(),current:a.view_json()};}finally{a.free();b.free();}
 });
 await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const result=JSON.parse(await page.evaluate(async saved=>{
  const wasm=await import("/probe.js"),a=wasm.RichReplicaProbe.restore("room",saved.checkpoint);try{
   const current=a.view_json(),steps=[];for(let i=0;i<3;i++){let observed=a.observe();try{a.undo_observed(observed);}finally{observed.free();}steps.push(JSON.parse(a.view_json()));observed=a.observe();try{a.redo_observed(observed);}finally{observed.free();}steps.push(JSON.parse(a.view_json()));}
   return JSON.stringify({current,steps});
  }finally{a.free();}
 },saved));
 expect(result.current).toBe(saved.current);for(let i=0;i<6;i++)expect(result.steps[i].selection.focus).toMatchObject({block:"right",offset:i%2?"5":"0"});
});

test("concurrent cuts converge in either delivery order without reordering original characters",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const cases=[];for(const [x,y] of [[1,3],[3,1]])for(const reverse of [false,true]){const {a,b}=window.peers();try{window.dispatch(a,[window.split("p",x,"right-a")]);window.dispatch(b,[window.split("p",y,"right-b")]);if(reverse)window.sync(b,a);else window.sync(a,b);cases.push(window.children(a,"cell").filter(block=>block!=="image-block").map(block=>window.text(a,block)).join(""));}finally{a.free();b.free();}}
  return JSON.stringify(cases);
 }));
 expect(result).toEqual(["a🙂b","a🙂b","a🙂b","a🙂b"]);
});

test("native shared paragraph journal restores in Wasm with exact future source-aware operations",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const vector=window.paragraphVector.shared_paragraph,a=window.paragraphWasm.RichReplicaProbe.restore("room",vector.checkpoint);try{
   const cases=[],capture=name=>{cases.push({name,native:name==="current"?vector.bytes:vector[name].bytes,wasm:Array.from(a.updates())});return {view:a.view_json(),checkpoint:a.checkpoint()};};
   const current=capture("current");window.paragraphHistory(a,true);const redo=capture("redo");window.select(a,window.caret("p",12));window.type(a,"!");const typed=capture("typed");window.paragraphHistory(a);const undo=capture("undo");window.paragraphHistory(a,true);const retyped=capture("retyped");
   const expected={current:{view:vector.current,checkpoint:vector.checkpoint}};for(const key of ["redo","typed","undo","retyped"])expected[key]={view:vector[key].view,checkpoint:vector[key].checkpoint};
   const native=window.paragraphWasm.RichReplicaProbe.join_frame("room","9007199254740997",vector.frame),roundtrip=window.paragraphWasm.RichReplicaProbe.join_frame("room","9007199254740999",a.update_frame());
   try{return JSON.stringify({actual:{current,redo,typed,undo,retyped},expected,cases,transport:{native:native.document_json()===JSON.parse(vector.current).documentJson&&native.causal_version()===JSON.parse(vector.current).causalVersion,roundtrip:roundtrip.document_json()===a.document_json()&&roundtrip.causal_version()===a.causal_version()}});}finally{native.free();roundtrip.free();}
  }finally{a.free();}
 }));
 const decoded=await compareEngineExports(result.cases);
 for(const value of decoded)expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});
 expect(result.actual).toEqual(result.expected);
 expect(result.transport).toEqual({native:true,roundtrip:true});
});
