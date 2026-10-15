import {test,expect} from "@playwright/test";
import {compareEngineExports} from "./compare-exports.mjs";

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json();
  const t={wasm,vector};window.headingTools=t;
  t.peers=()=>{const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());return {a,b};};
  t.heading=(block,level)=>({kind:"set_heading",data:{block,level}});
  t.dispatch=(owner,commands)=>{const observed=owner.observe();try{return owner.dispatch(observed,JSON.stringify({commands}));}finally{observed.free();}};
  t.history=(owner,redo=false)=>{const observed=owner.observe();try{return redo?owner.redo_observed(observed):owner.undo_observed(observed);}finally{observed.free();}};
  t.caret=(block,offset)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
  t.select=(owner,value)=>{const observed=owner.observe();try{return owner.set_selection(observed,JSON.stringify(value));}finally{observed.free();}};
  t.find=(node,id)=>node.properties?.["breditor/block-id"]===id?node:node.children?.map(child=>t.find(child,id)).find(Boolean);
  t.node=(owner,id)=>t.find(JSON.parse(owner.document_json()).root,id);
  t.sync=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("Heading documents did not converge");};
  t.empty=a=>t.dispatch(a,[{kind:"delete_block",data:{block:"p"}},{kind:"delete_block",data:{block:"image-block"}}]);
  t.fallback=a=>t.node(a,"cell").children[0].properties["breditor/block-id"];
 });
});

test("shared heading conversion retains formats caret and exact history for every rank",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.headingTools,{a,b}=t.peers();try{
   t.select(a,t.caret("p",3));const initial=a.document_json(),runs=t.node(a,"p").children,checks=[];
   for(let rank=1;rank<=6;rank++){
    t.dispatch(a,[t.heading("p",rank)]);const heading=t.node(a,"p");t.history(a);const restored=a.document_json()===initial;t.history(a,true);
    checks.push({rank:heading.properties["breditor/level"],type:heading.type,runsSame:JSON.stringify(heading.children)===JSON.stringify(runs),caret:JSON.parse(a.view_json()).selection.focus,restored});
    t.dispatch(a,[t.heading("p",null)]);
   }
   return JSON.stringify(checks);
  }finally{a.free();b.free();}
 }));
 expect(result).toHaveLength(6);for(let index=0;index<6;index++)expect(result[index]).toEqual({rank:index+1,type:"breditor/heading",runsSame:true,caret:{block:"p",offset:"3",affinity:"after"},restored:true});
});

test("concurrent heading ranks and masked undo preserve each writers owned intent",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.headingTools,checks=[];for(const reverse of [false,true]){const {a,b}=t.peers();try{
   const rank=()=>t.node(a,"p").properties["breditor/level"]??null;
   t.dispatch(a,[t.heading("p",2)]);t.dispatch(b,[t.heading("p",5)]);if(reverse)t.sync(b,a);else t.sync(a,b);const values=[rank()];
   t.history(a);t.sync(a,b);values.push(rank());t.history(b);t.sync(a,b);values.push(rank());t.history(a,true);t.sync(a,b);values.push(rank());t.history(b,true);t.sync(a,b);values.push(rank());checks.push(values);
  }finally{a.free();b.free();}}
  return JSON.stringify(checks);
 }));
 expect(result).toEqual([[5,5,null,2,5],[5,5,null,2,5]]);
});

test("normalized headings survive concurrent flow creation without replacing cell text",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.headingTools,{a,b}=t.peers();try{
   t.empty(a);b.receive_frame(a.update_frame());const id=t.fallback(a);t.dispatch(a,[t.heading(id,4)]);
   t.dispatch(b,[{kind:"insert_blocks",data:{parent:"cell",before:null,nodes:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"remote-p"},children:[{kind:"text",text:"Remote🙂",formats:[]}]}]}}]);
   t.sync(a,b);const after={count:t.node(a,"cell").children.length,rank:t.node(a,id).properties["breditor/level"]};t.history(a);t.sync(a,b);const undone={hidden:!t.node(a,id),remote:t.node(a,"remote-p").children[0].text};t.history(b);t.sync(a,b);
   return JSON.stringify({after,undone,returned:t.fallback(a)===id,type:t.node(a,id).type});
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({after:{count:2,rank:4},undone:{hidden:true,remote:"Remote🙂"},returned:true,type:"breditor/paragraph"});
});

test("invalid ranks captions and late failures preserve the complete observed publication",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.headingTools,{a,b}=t.peers();let observed;try{
   observed=a.observe();const before=a.checkpoint();let rejected=0;
   for(const commands of [[t.heading("p",0)],[t.heading("p",7)],[t.heading("caption",2)],[t.heading("p",3),t.heading("caption",2)]])try{a.dispatch(observed,JSON.stringify({commands}));}catch{if(a.checkpoint()!==before)throw Error("Partial heading publication");rejected++;}
   const noop=a.dispatch(observed,JSON.stringify({commands:[t.heading("p",null)]}));return JSON.stringify({rejected,noop,same:a.checkpoint()===before});
  }finally{observed?.free();a.free();b.free();}
 }));
 expect(result).toEqual({rejected:4,noop:false,same:true});
});

test("new derived cells and freshly split paragraphs can change rank in one real group",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.headingTools,{a,b}=t.peers();try{
   t.dispatch(a,[{kind:"insert_column",data:{block:"table-block",column:"new-column",width:140,before:null}}]);const cell=t.node(a,"row").children[1],id=cell.children[0].properties["breditor/block-id"];
   t.dispatch(a,[t.heading(id,4)]);t.dispatch(a,[{kind:"split_text_block",data:{block:id,offset:0,right:"right",right_heading:null}},t.heading("right",3),{kind:"insert_text",data:{block:"right",offset:0,text:"Typed🙂"}}]);
   const after={left:t.node(a,id).properties["breditor/level"],right:t.node(a,"right").properties["breditor/level"],text:t.node(a,"right").children[0].text};t.history(a);const undone=!t.node(a,"right");t.history(a,true);return JSON.stringify({after,undone,redone:t.node(a,"right").children[0].text});
  }finally{a.free();b.free();}
 }));
 expect(result).toEqual({after:{left:4,right:3,text:"Typed🙂"},undone:true,redone:"Typed🙂"});
});

test("native heading journal restores after page reload with exact future causal operations",async({page})=>{
 const checkpoint=await page.evaluate(()=>window.headingTools.vector.shared_heading.checkpoint);await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const result=JSON.parse(await page.evaluate(async checkpoint=>{
  const wasm=await import("/probe.js"),vector=(await(await fetch("/native-vector.json")).json()).shared_heading,a=wasm.RichReplicaProbe.restore("room",checkpoint);try{
   const cases=[],actual={},expected={},capture=key=>{actual[key]={view:a.view_json(),checkpoint:a.checkpoint()};expected[key]={view:vector[key].view,checkpoint:vector[key].checkpoint};cases.push({name:key,native:vector[key].bytes,wasm:Array.from(a.updates())});};
   capture("current");let observed=a.observe();try{a.redo_observed(observed);}finally{observed.free();}capture("redo");observed=a.observe();try{a.dispatch(observed,JSON.stringify({commands:[{kind:"set_heading",data:{block:"p",level:null}}]}));}finally{observed.free();}capture("paragraph");observed=a.observe();try{a.undo_observed(observed);}finally{observed.free();}capture("undo");observed=a.observe();try{a.redo_observed(observed);}finally{observed.free();}capture("retyped");return JSON.stringify({actual,expected,cases});
  }finally{a.free();}
 },checkpoint));
 const decoded=await compareEngineExports(result.cases);
 for(const value of decoded)expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});
 expect(result.actual).toEqual(result.expected);
});

test("matching heading no-op keeps relocated selection metadata and its live observation",async({page})=>{
 const result=JSON.parse(await page.evaluate(()=>{
  const t=window.headingTools,{a,b}=t.peers();let observed;try{
   t.select(a,t.caret("p",1));t.dispatch(b,[{kind:"insert_text",data:{block:"p",offset:1,text:"X"}}]);a.receive_frame(b.update_frame());
   const before=a.checkpoint(),view=JSON.parse(a.view_json());observed=a.observe();
   const changed=a.dispatch(observed,JSON.stringify({commands:[t.heading("p",null)]}));
   const same=a.checkpoint()===before,stillLive=a.set_selection(observed,JSON.stringify(view.selection));
   return JSON.stringify({outcome:view.selectionOutcome.kind,changed,same,stillLive});
  }finally{observed?.free();a.free();b.free();}
 }));
 expect(result).toEqual({outcome:"relocated",changed:false,same:true,stillLive:false});
});
