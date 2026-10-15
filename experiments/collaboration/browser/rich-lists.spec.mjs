import {test,expect} from "@playwright/test";
import {compareEngineExports} from "./compare-exports.mjs";

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json();const t={wasm,vector};window.listTools=t;
  t.peers=()=>{const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());return{a,b};};
  t.dispatch=(a,commands)=>{const o=a.observe();try{return a.dispatch(o,JSON.stringify({commands}));}finally{o.free();}};
  t.history=(a,redo=false)=>{const o=a.observe();try{return redo?a.redo_observed(o):a.undo_observed(o);}finally{o.free();}};
  t.caret=(block,offset)=>{const point={block,offset:String(offset),affinity:"after"};return{kind:"text",anchor:point,focus:point};};
  t.select=(a,value)=>{const o=a.observe();try{return a.set_selection(o,JSON.stringify(value));}finally{o.free();}};
  t.type=(a,text)=>{const o=a.observe();try{return a.insert_plain_text(o,text);}finally{o.free();}};
  t.find=(node,id)=>node.properties?.["breditor/block-id"]===id?node:node.children?.map(child=>t.find(child,id)).find(Boolean);
  t.node=(a,id)=>t.find(JSON.parse(a.document_json()).root,id);
  t.children=(a,id)=>t.node(a,id).children.map(node=>node.properties?.["breditor/block-id"]).filter(Boolean);
  t.text=(a,id)=>t.node(a,id).children.map(run=>run.text??"").join("");
  t.paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  t.add=(a,count)=>t.dispatch(a,[{kind:"insert_blocks",data:{parent:"cell",before:null,nodes:[t.paragraph("end","Tail🙂"),...(count===3?[t.paragraph("third","Last")]:[])]}}]);
  t.wrap=(count=2)=>({kind:"wrap_list",data:{first:"p",last:count===3?"third":"end",container:"list",items:Array.from({length:count},(_,i)=>`item-${i+1}`),style:{kind:"ordered",start:3}}});
  t.wrapEmpty=(id,container,item)=>({kind:"wrap_list",data:{first:id,last:id,container,items:[item],style:{kind:"bullet"}}});
  t.style=(container,style)=>({kind:"set_list_kind",data:{container,style}});
  t.indent=(first,last,nested)=>({kind:"indent_list_items",data:{container:"list",first,last,new_nested:nested?{block:"nested",style:{kind:"ordered",start:7}}:null}});
  t.outdent=(container,first,last,fresh_tail=null)=>({kind:"outdent_list_items",data:{container,first,last,fresh_tail}});
  t.unwrap=container=>({kind:"unwrap_list",data:{container}});
  t.split=(block="p",offset=1)=>({kind:"split_list_item",data:{block,offset,new_item:"right-item",right:"right",right_heading:2}});
  t.join=(left,right)=>({kind:"join_list_items",data:{container:"list",left,right}});
  t.insert=(block,offset,text)=>({kind:"insert_text",data:{block,offset,text}});
  t.sync=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("List documents did not converge");};
  t.empty=a=>t.dispatch(a,[{kind:"delete_block",data:{block:"p"}},{kind:"delete_block",data:{block:"image-block"}}]);
 });
});

test("list wrap unwrap retain media order offline text and exact saved history",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,{a,b}=t.peers();let restored;try{
   t.add(a,2);b.receive_frame(a.update_frame());t.select(a,t.caret("caption",2));const before=a.document_json();t.dispatch(a,[t.wrap()]);const body=t.children(a,"item-1");t.history(a);if(a.document_json()!==before)throw Error("Wrap undo mismatch");t.history(a,true);
   t.dispatch(b,[t.insert("p",1,"R"),t.insert("caption",0,"remote")]);t.sync(a,b);t.dispatch(a,[t.unwrap("list")]);const unwrapped={body:t.children(a,"cell"),text:t.text(a,"p"),caption:t.text(a,"caption"),selection:JSON.parse(a.view_json()).selection};
   restored=t.wasm.RichReplicaProbe.restore("room",a.checkpoint());for(let i=0;i<3;i++){t.history(a);t.history(restored);if(a.checkpoint()!==restored.checkpoint())throw Error("List undo journal mismatch");t.history(a,true);t.history(restored,true);if(a.checkpoint()!==restored.checkpoint())throw Error("List redo journal mismatch");}return JSON.stringify({body,unwrapped});
  }finally{restored?.free();a.free();b.free();}
 }));
 expect(result.body).toEqual(["p","image-block"]);expect(result.unwrapped).toEqual({body:["p","image-block","end"],text:"aR🙂b",caption:"remotexy🙂",selection:{kind:"text",anchor:{block:"caption",offset:"8",affinity:"after"},focus:{block:"caption",offset:"8",affinity:"after"}}});
});

test("concurrent list styles keep paired ordinals masked undo and complete noops",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,{a,b}=t.peers();try{
   t.add(a,2);t.dispatch(a,[t.wrap()]);b.receive_frame(a.update_frame());const before=a.checkpoint(),noop=t.dispatch(a,[t.style("list",{kind:"ordered",start:3})]),unchanged=before===a.checkpoint();
   t.dispatch(a,[t.style("list",{kind:"bullet"})]);t.dispatch(b,[t.style("list",{kind:"ordered",start:6})]);t.sync(a,b);const values=[t.node(a,"list").properties["breditor/start"]];t.history(a);t.sync(a,b);values.push(t.node(a,"list").properties["breditor/start"]);t.history(b);t.sync(a,b);values.push(t.node(a,"list").properties["breditor/start"]);t.history(a,true);t.sync(a,b);values.push(t.node(a,"list").type);t.history(b,true);t.sync(a,b);values.push(t.node(a,"list").properties["breditor/start"]);return JSON.stringify({noop,unchanged,values});
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({noop:false,unchanged:true,values:[6,6,3,"breditor/bullet-list",6]});
});

test("nested and top level outdent retain complete bodies and numbered tail starts",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,{a,b}=t.peers();try{
   t.add(a,3);t.dispatch(a,[t.wrap(3)]);const original=a.document_json();t.dispatch(a,[t.indent("item-2","item-2",true)]);t.dispatch(a,[t.indent("item-3","item-3",false)]);const before=a.document_json();t.dispatch(a,[t.outdent("nested","item-2","item-2")]);const nested={outer:t.children(a,"list"),left:t.children(a,"item-1"),right:t.children(a,"item-2"),start:t.node(a,"nested").properties["breditor/start"]};t.history(a);if(a.document_json()!==before)throw Error("Nested outdent undo mismatch");t.history(a);t.history(a);if(a.document_json()!==original)throw Error("Indent undo mismatch");
   t.dispatch(a,[t.outdent("list","item-2","item-2","tail-list")]);const top={body:t.children(a,"cell"),start:t.node(a,"tail-list").properties["breditor/start"]};t.history(a);if(a.document_json()!==original)throw Error("Top outdent undo mismatch");return JSON.stringify({nested,top});
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({nested:{outer:["item-1","item-2"],left:["p","image-block"],right:["end","nested"],start:8},top:{body:["list","end","tail-list"],start:5}});
});

test("list Enter and Backspace keep original source characters and offline typing",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,{a,b}=t.peers();try{
   t.add(a,2);t.dispatch(a,[t.wrap()]);b.receive_frame(a.update_frame());t.select(a,t.caret("p",3));t.dispatch(a,[t.split()]);t.dispatch(b,[t.insert("p",3,"R")]);t.sync(a,b);const split={left:t.text(a,"p"),right:t.text(a,"right"),body:t.children(a,"right-item"),rank:t.node(a,"right").properties["breditor/level"]},before=a.document_json();t.dispatch(a,[t.join("item-1","right-item")]);const joined={text:t.text(a,"p"),body:t.children(a,"item-1")};t.history(a);if(a.document_json()!==before)throw Error("List source undo mismatch");t.history(a,true);return JSON.stringify({split,joined});
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({split:{left:"a",right:"🙂Rb",body:["right","image-block"],rank:2},joined:{text:"a🙂Rb",body:["p","image-block"]}});
});

test("left media tails keep joined right paragraphs in their original reading order",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,{a,b}=t.peers();try{
   t.add(a,2);t.dispatch(a,[t.wrap()]);b.receive_frame(a.update_frame());t.dispatch(a,[t.join("item-1","item-2")]);t.dispatch(b,[t.insert("end",0,"R")]);t.sync(a,b);const after={body:t.children(a,"item-1"),left:t.text(a,"p"),right:t.text(a,"end")};t.history(a);t.sync(a,b);return JSON.stringify({after,restored:t.children(a,"item-2"),right:t.text(a,"end")});
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({after:{body:["p","image-block","end"],left:"a🙂b",right:"RTail🙂"},restored:["end"],right:"RTail🙂"});
});

test("empty normalized and derived cells retain one movable text identity through list history",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,checks=[];for(const scenario of["cell","derived","root"]){const{a,b}=t.peers();try{
   let parent="cell";if(scenario==="derived"){t.dispatch(a,[{kind:"insert_column",data:{block:"table-block",column:"new-column",width:140,before:null}}]);parent=t.children(a,"row")[1];}else if(scenario==="root"){t.dispatch(a,[{kind:"delete_block",data:{block:"table-block"}}]);parent=null;}else t.empty(a);
   const id=parent?t.children(a,parent)[0]:JSON.parse(a.document_json()).root.children[0].properties["breditor/block-id"],before=a.document_json();t.select(a,t.caret(id,0));t.dispatch(a,[t.wrapEmpty(id,"empty-list","empty-item")]);t.type(a,"Typed🙂");const text=t.text(a,id);t.history(a);t.history(a);if(a.document_json()!==before)throw Error("Normalized wrap undo mismatch");t.history(a,true);t.history(a,true);checks.push({scenario,text,body:t.children(a,"empty-item")});
  }finally{a.free();b.free();}}return JSON.stringify(checks);
 }));
 expect(result).toHaveLength(3);for(const item of result){expect(item.text).toBe("Typed🙂");expect(item.body).toHaveLength(1);expect(item.body[0]).toMatch(/^breditor-virtual:/);}
});

test("independent retention of the same empty head converges without duplicate occurrences",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,{a,b}=t.peers();try{
   t.empty(a);b.receive_frame(a.update_frame());const id=t.children(a,"cell")[0];t.dispatch(a,[t.wrapEmpty(id,"list-a","item-a")]);t.dispatch(b,[t.wrapEmpty(id,"list-b","item-b")]);t.select(b,t.caret(id,0));t.type(b,"Remote");t.sync(a,b);const count=t.children(a,"cell").length;t.history(a);t.sync(a,b);const undone={body:t.children(a,"cell"),text:t.text(a,id)};t.history(a,true);t.sync(a,b);return JSON.stringify({count,undone});
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({count:2,undone:{body:["list-b"],text:"Remote"}});
});

test("composed list commands share one undo boundary and reject late shape failures atomically",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,{a,b}=t.peers();let observed;try{
   t.add(a,2);observed=a.observe();const before=a.checkpoint();let rejected=false;try{a.dispatch(observed,JSON.stringify({commands:[t.wrap(),t.indent("item-1","item-1",true)]}));}catch{rejected=a.checkpoint()===before;}
   const document=a.document_json(),depth=JSON.parse(a.view_json()).undoDepth;t.dispatch(a,[t.wrap(),t.indent("item-2","item-2",true),t.style("nested",{kind:"ordered",start:9})]);const after={rank:t.node(a,"nested").properties["breditor/start"],depth:JSON.parse(a.view_json()).undoDepth-depth};t.history(a);return JSON.stringify({rejected,after,exact:a.document_json()===document});
  }finally{observed?.free();a.free();b.free();}
 }));
 expect(result).toEqual({rejected:true,after:{rank:9,depth:1},exact:true});
});

test("a batch can synthesize an implicit head after deletion and unwrap it with one exact undo",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.listTools,checks=[];for(const split of[false,true]){const{a,b}=t.peers();try{
   t.add(a,2);t.dispatch(a,[t.wrap()]);const before=a.document_json(),depth=JSON.parse(a.view_json()).undoDepth;
   t.dispatch(a,[...(split?[t.split()]:[]),{kind:"delete_block",data:{block:split?"right":"p"}},t.unwrap("list")]);
   const body=t.children(a,"cell"),implicit=body[split?1:0];checks.push({body:body.map(id=>id.startsWith("breditor-virtual:")?"implicit":id),text:t.text(a,implicit),depth:JSON.parse(a.view_json()).undoDepth-depth});t.history(a);if(a.document_json()!==before)throw Error("Synthesized-head group undo mismatch");t.history(a,true);
  }finally{a.free();b.free();}}return JSON.stringify(checks);
 }));
 expect(result).toEqual([{body:["implicit","image-block","end"],text:"",depth:1},{body:["p","implicit","image-block","end"],text:"",depth:1}]);
});

for(const [key,steps]of[["shared_list",["redo","unwrapped","undo","repeated"]],["shared_empty_list",["redo","undo","unwrapped","older"]]]){
 test(`native ${key} journal restores after reload with exact future operations`,async({page})=>{
  const checkpoint=await page.evaluate(key=>window.listTools.vector[key].checkpoint,key);await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
  const result=JSON.parse(await page.evaluate(async({checkpoint,key,steps})=>{
   const wasm=await import("/probe.js"),vector=(await(await fetch("/native-vector.json")).json())[key],a=wasm.RichReplicaProbe.restore("room",checkpoint);try{
    const cases=[],actual={},expected={},capture=name=>{actual[name]={view:a.view_json(),checkpoint:a.checkpoint()};expected[name]={view:vector[name].view,checkpoint:vector[name].checkpoint};cases.push({name,native:vector[name].bytes,wasm:Array.from(a.updates())});};
    const guarded=fn=>{const o=a.observe();try{return fn(o);}finally{o.free();}};capture("current");for(const step of steps){if(step==="redo"||step==="repeated")guarded(o=>a.redo_observed(o));else if(step==="unwrapped"&&key==="shared_list")guarded(o=>a.dispatch(o,JSON.stringify({commands:[{kind:"delete_block",data:{block:"third"}},{kind:"unwrap_list",data:{container:"nested"}}]})));else guarded(o=>a.undo_observed(o));capture(step);}return JSON.stringify({actual,expected,cases});
   }finally{a.free();}
  },{checkpoint,key,steps}));
  const decoded=await compareEngineExports(result.cases);for(const value of decoded)expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});expect(result.actual).toEqual(result.expected);
 });
}
