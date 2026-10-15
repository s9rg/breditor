import {test,expect} from "@playwright/test";
import {compareEngineExports} from "./compare-exports.mjs";

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json();
  const t={wasm,vector};window.rangeTools=t;
  t.peers=()=>{const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());return {a,b};};
  t.point=(block,offset)=>({block,offset:String(offset),affinity:"after"});
  t.range=(ab,ao,fb,fo)=>({kind:"text",anchor:t.point(ab,ao),focus:t.point(fb,fo)});
  t.replace=(ab,ao,fb,fo,runs)=>({kind:"replace_text_range",data:{anchor:t.point(ab,ao),focus:t.point(fb,fo),runs}});
  t.plain=text=>[{text,formats:[]}];t.strong={type:"breditor/strong",properties:{}};
  t.dispatch=(a,commands)=>{const observed=a.observe();try{return a.dispatch(observed,JSON.stringify({commands}));}finally{observed.free();}};
  t.history=(a,redo=false)=>{const observed=a.observe();try{return redo?a.redo_observed(observed):a.undo_observed(observed);}finally{observed.free();}};
  t.select=(a,value)=>{const observed=a.observe();try{return a.set_selection(observed,JSON.stringify(value));}finally{observed.free();}};
  t.type=(a,text)=>{const observed=a.observe();try{return a.insert_plain_text(observed,text);}finally{observed.free();}};
  t.find=(node,id)=>node.properties?.["breditor/block-id"]===id?node:node.children?.map(child=>t.find(child,id)).find(Boolean);
  t.node=(a,id)=>t.find(JSON.parse(a.document_json()).root,id);
  t.text=(a,id)=>t.node(a,id)?.children.map(run=>run.text??"").join("");
  t.paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  t.create=(parent,nodes)=>({kind:"insert_blocks",data:{parent,before:null,nodes}});
  t.sync=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("Range documents did not converge");};
 });
});

test("rich replacement retains suffix styles and exact directional undo after restart",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.rangeTools,{a,b}=t.peers();let restored;try{
   const selection=t.range("p",3,"p",1);t.select(a,selection);const before=a.document_json(),selectionJson=JSON.stringify(JSON.parse(a.view_json()).selection);let undoSelection;
   t.dispatch(a,[t.replace("p",3,"p",1,[...t.plain("X"),{text:"Y🙂",formats:[t.strong]},...t.plain("Z")])]);
   const after={text:t.text(a,"p"),runs:t.node(a,"p").children};restored=t.wasm.RichReplicaProbe.restore("room",a.checkpoint());
   for(let i=0;i<3;i++){t.history(a);t.history(restored);undoSelection=JSON.parse(a.view_json()).selection;if(a.document_json()!==before||JSON.stringify(undoSelection)!==selectionJson||a.checkpoint()!==restored.checkpoint())throw Error("Range undo/restart mismatch");t.history(a,true);t.history(restored,true);if(a.checkpoint()!==restored.checkpoint())throw Error("Range redo/restart mismatch");}
   return JSON.stringify({...after,undoSelection});
  }finally{restored?.free();a.free();b.free();}
 }));
 expect(result.text).toBe("aXY🙂Zb");expect(result.runs.map(run=>run.formats)).toEqual([[{type:"breditor/strong",properties:{}}],[],[{type:"breditor/strong",properties:{}}],[],[{type:"breditor/strong",properties:{}}]]);
 expect(result.undoSelection).toEqual({kind:"text",anchor:{block:"p",offset:"3",affinity:"after"},focus:{block:"p",offset:"1",affinity:"after"}});
});

test("sibling replacement retains offline suffix and hidden media edits through selective history",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.rangeTools,{a,b}=t.peers();try{
   t.dispatch(a,[t.create("cell",[t.paragraph("end","Tail🙂")])]);b.receive_frame(a.update_frame());
   t.select(b,t.range("end",2,"end",2));t.dispatch(a,[t.replace("p",1,"end",2,t.plain("New"))]);
   t.dispatch(b,[{kind:"insert_text",data:{block:"end",offset:2,text:"R"}},{kind:"insert_text",data:{block:"caption",offset:0,text:"remote"}}]);t.sync(a,b);
   const merged={text:t.text(a,"p"),hidden:!t.node(a,"image-block"),caret:JSON.parse(b.view_json()).selection.focus};
   t.history(a);t.sync(a,b);const undone={left:t.text(a,"p"),right:t.text(a,"end"),caption:t.text(a,"caption")};t.history(a,true);t.sync(a,b);
   return JSON.stringify({merged,undone,redone:t.text(a,"p")});
  }finally{a.free();b.free();}
 }));
 expect(result.merged).toEqual({text:"aNewRil🙂",hidden:true,caret:{block:"p",offset:"5",affinity:"after"}});
 expect(result.undone).toEqual({left:"a🙂b",right:"TaRil🙂",caption:"remotexy🙂"});expect(result.redone).toBe("aNewRil🙂");
});

test("selected typing uses start style in cells and captions with exact caret history",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.rangeTools,{a,b}=t.peers();try{
   const cases=[];for(const [block,from,to,input]of[["p",3,1,"X🙂"],["caption",2,1,"Q"]]){
    const before=a.document_json(),selection=t.range(block,from,block,to);t.select(a,selection);const selectionJson=JSON.stringify(JSON.parse(a.view_json()).selection);t.type(a,input);const after={text:t.text(a,block),selection:JSON.parse(a.view_json()).selection};t.history(a);if(a.document_json()!==before||JSON.stringify(JSON.parse(a.view_json()).selection)!==selectionJson)throw Error("Typing undo mismatch");t.history(a,true);cases.push(after);
   }
   t.select(a,t.range("p",1,"p",4));t.type(a,"");const deleted=t.text(a,"p");t.history(a);return JSON.stringify({cases,deleted,restored:t.text(a,"p")});
  }finally{a.free();b.free();}
 }));
 expect(result.cases[0]).toEqual({text:"aX🙂b",selection:{kind:"text",anchor:{block:"p",offset:"4",affinity:"after"},focus:{block:"p",offset:"4",affinity:"after"}}});
 expect(result.cases[1].text).toBe("xQ🙂");expect(result.deleted).toBe("ab");expect(result.restored).toBe("aX🙂b");
});

test("sibling numbered heads preserve last media tails numbering and reversible structure",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.rangeTools,{a,b}=t.peers();try{
   const image=structuredClone(t.node(a,"image-block"));image.properties["breditor/block-id"]="tail-image";image.properties["breditor/image-id"]="tail-image-id";image.children=[];
   const item=(id,children)=>({kind:"element",type:"breditor/list-item",entityId:null,properties:{"breditor/block-id":id},children});
   const list={kind:"element",type:"breditor/ordered-list",entityId:null,properties:{"breditor/block-id":"list","breditor/start":3},children:[item("item-a",[t.paragraph("head-a","First")]),item("item-b",[t.paragraph("head-b","Last🙂"),image])]};
   t.dispatch(a,[t.create(null,[list])]);const before=a.document_json();t.dispatch(a,[t.replace("head-a",2,"head-b",2,t.plain("X"))]);const after={text:t.text(a,"head-a"),tail:t.node(a,"item-a").children[1].properties["breditor/block-id"],start:t.node(a,"list").properties["breditor/start"]};t.history(a);if(a.document_json()!==before)throw Error("List range undo mismatch");t.history(a,true);return JSON.stringify(after);
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({text:"FiXst🙂",tail:"tail-image",start:3});
});

test("range batches compose earlier creation and splits with later format priorities",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.rangeTools,checks=[];for(const scenario of["create","split"]){const{a,b}=t.peers();try{
   const before=a.document_json();const commands=scenario==="create"?[t.create("cell",[t.paragraph("end","Suffix")]),t.replace("p",1,"end",1,t.plain("New"))]:[{kind:"split_text_block",data:{block:"p",offset:1,right:"right",right_heading:null}},t.replace("p",0,"right",2,[{text:"New",formats:[t.strong]}]),{kind:"set_format",data:{block:"p",offset:0,length:3,format:t.strong,enabled:false}}];
   t.dispatch(a,commands);const text=t.text(a,"p"),runs=t.node(a,"p").children;t.history(a);if(a.document_json()!==before)throw Error("Composed batch undo mismatch");t.history(a,true);checks.push({text,runs});
  }finally{a.free();b.free();}}return JSON.stringify(checks);
 }));
 expect(result[0].text).toBe("aNewuffix");expect(result[1].text).toBe("Newb");expect(result[1].runs[0].formats).toEqual([]);
});

test("invalid selected ranges and late failures preserve the complete live observation",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.rangeTools,{a,b}=t.peers();let observed;try{
   observed=a.observe();const before=a.checkpoint();let rejected=0;
   for(const commands of[[t.replace("p",2,"p",3,t.plain("X"))],[t.replace("p",1,"caption",1,t.plain("X"))],[t.replace("p",1,"p",3,t.plain("X")),t.replace("p",1,"caption",1,t.plain("X"))]])try{a.dispatch(observed,JSON.stringify({commands}));}catch{if(a.checkpoint()!==before)throw Error("Partial range publication");rejected++;}
   return JSON.stringify({rejected,stillLive:a.set_selection(observed,"null")===false,same:a.checkpoint()===before});
  }finally{observed?.free();a.free();b.free();}
 }));
 expect(result).toEqual({rejected:3,stillLive:true,same:true});
});

test("native range journal restores after reload with identical future causal operations",async({page})=>{
 const checkpoint=await page.evaluate(()=>window.rangeTools.vector.shared_range.checkpoint);await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const result=JSON.parse(await page.evaluate(async checkpoint=>{
  const wasm=await import("/probe.js"),vector=(await(await fetch("/native-vector.json")).json()).shared_range,a=wasm.RichReplicaProbe.restore("room",checkpoint);try{
   const cases=[],actual={},expected={},capture=key=>{actual[key]={view:a.view_json(),checkpoint:a.checkpoint()};expected[key]={view:vector[key].view,checkpoint:vector[key].checkpoint};cases.push({name:key,native:vector[key].bytes,wasm:Array.from(a.updates())});};
   const guarded=fn=>{const observed=a.observe();try{return fn(observed);}finally{observed.free();}};
   capture("current");guarded(o=>a.redo_observed(o));capture("redo");const point={block:"p",offset:"4",affinity:"after"};guarded(o=>a.set_selection(o,JSON.stringify({kind:"text",anchor:point,focus:point})));guarded(o=>a.insert_plain_text(o,"!"));capture("typed");guarded(o=>a.undo_observed(o));capture("undo");guarded(o=>a.redo_observed(o));capture("retyped");return JSON.stringify({actual,expected,cases});
  }finally{a.free();}
 },checkpoint));
 const decoded=await compareEngineExports(result.cases);for(const value of decoded)expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});expect(result.actual).toEqual(result.expected);
});
