import {test,expect} from "@playwright/test";

function findBlock(node,block){return node.properties?.["breditor/block-id"]===block?node:node.children?.map(value=>findBlock(value,block)).find(Boolean);}

test("original update envelopes reject wrong room and model before importing malformed engine bytes",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   const frame=a.update_frame(),joined=window.richShared.wasm.RichReplicaProbe.join_frame("room","303",frame);
   const same=joined.document_json()===a.document_json();joined.free();
   const before=b.document_json(),checkpoint=b.checkpoint(),failures=[];
   for(const [field,value] of [["document","other-room"],["modelVersion",2],["engine",{name:"loro",version:"wrong-version"}]]){
    const wrong=JSON.parse(frame);wrong[field]=value;wrong.bytes=[255];try{b.receive_frame(JSON.stringify(wrong));}catch(error){failures.push(String(error));}
   }
   return {same,failures,unchanged:b.document_json()===before&&b.checkpoint()===checkpoint};
  }finally{a.free();b.free();}
 });
 expect(result.same).toBe(true);expect(result.unchanged).toBe(true);expect(result.failures).toHaveLength(3);expect(result.failures.every(value=>value.includes("binding"))).toBe(true);
});

test("stale shared versions reject before JSON decoding and keep the committed owner exact",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   const version=a.causal_version();window.sharedApply(b,{kind:"insert_text",data:{block:"p",offset:1,text:"remote"}});a.receive(b.updates());
   const before=a.document_json(),checkpoint=a.checkpoint();let failure;
   try{a.apply_at(version,"not valid JSON");}catch(error){failure=String(error);}
   const unchanged=a.document_json()===before&&a.checkpoint()===checkpoint;
   const current=a.causal_version();a.apply_at(current,JSON.stringify([{kind:"insert_text",data:{block:"p",offset:0,text:"Current "}}]));
   return {failure,unchanged,version:JSON.parse(current),after:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.failure).toContain("stale shared causal version");expect(result.unchanged).toBe(true);expect(Object.values(result.version).every(value=>typeof value==="string")).toBe(true);
 expect(findBlock(JSON.parse(result.after).root,"p").children.map(run=>run.text).join("")).toContain("Current ");
});

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json();
  window.richShared={wasm,input:vector.rich_local_input};
  window.makePeers=()=>{
   const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());
   return {a,b};
  };
  window.sharedSync=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("Shared ASTs diverged");};
  window.sharedApply=(owner,...commands)=>owner.apply(JSON.stringify(commands));
  window.sharedNode=(node,block)=>node.properties?.["breditor/block-id"]===block?node:node.children?.map(value=>window.sharedNode(value,block)).find(Boolean);
 });
});

test("real shared Wasm materializes an identical admitted rich AST, not probe JSON",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{return {a:a.document_json(),b:b.document_json(),admitted:JSON.parse(window.richShared.wasm.admit_rich_ast(window.richShared.input)).canonical,undo:[a.undo_count(),b.undo_count()]};}finally{a.free();b.free();}
 });
 expect(result.a).toBe(result.admitted);expect(result.b).toBe(result.a);expect(result.undo).toEqual([0,0]);
});

test("simultaneous cell caption and paired metadata effects survive another writers selective undo",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;
  try{
   apply(a,{kind:"insert_text",data:{block:"p",offset:1,text:"A"}},{kind:"resize_column",data:{block:"table-block",column:"c",width:240}});
   apply(b,{kind:"insert_text",data:{block:"p",offset:1,text:"B"}},{kind:"insert_text",data:{block:"caption",offset:0,text:"remote "}},{kind:"set_image_alt",data:{block:"image-block",text:"Remote alt",decorative:false}});
   sync(a,b);const before=a.document_json();a.undo();sync(a,b);const undone=a.document_json();a.redo();sync(a,b);return {before,undone,redone:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.redone).toBe(result.before);
 const doc=JSON.parse(result.undone),node=findBlock;
 expect(node(doc.root,"p").children.map(run=>run.text).join("")).toBe("aB🙂b");
 expect(node(doc.root,"caption").children.map(run=>run.text).join("")).toBe("remote xy🙂");
 expect(node(doc.root,"image-block").properties["breditor/alt-text"]).toBe("Remote alt");
 expect(node(doc.root,"table-block").properties["breditor/columns"][0].width).toBe(120);
});

test("shared owned formatting and paired size survive offline merge and exact writer restart",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;let restored;
  try{
   const format={kind:"set_format",data:{block:"caption",offset:0,length:2,format:{type:"breditor/strong",properties:{}},enabled:true}};
   apply(a,format,{kind:"resize_image",data:{block:"image-block",size:[320,180]}});apply(b,format,{kind:"resize_image",data:{block:"image-block",size:[640,360]}});
   sync(a,b);a.undo();sync(a,b);const before=a.document_json(),checkpoint=a.checkpoint();
   restored=window.richShared.wasm.RichReplicaProbe.restore("room",checkpoint);a.redo();restored.redo();
   return {before,restored:restored.document_json(),after:a.document_json(),bytesEqual:Array.from(a.updates()).join(",")===Array.from(restored.updates()).join(","),redo:restored.redo_count()};
  }finally{a.free();b.free();restored?.free();}
 });
 expect(result.restored).toBe(result.after);expect(result.bytesEqual).toBe(true);expect(result.redo).toBe(0);
 const parsed=JSON.parse(result.before);const image=parsed.root.children[0].children[0].children[0].children[1];
 expect(image.properties).toMatchObject({"breditor/width":640,"breditor/height":360});
 expect(image.children[0].children[0].formats).toEqual([{type:"breditor/strong",properties:{}}]);
});

test("independent shared row and column deletion effects cannot be retracted by another writer",async({page})=>{
 const result=await page.evaluate(()=>{
  const outputs=[];
  for(const command of [{kind:"delete_block",data:{block:"row"}},{kind:"delete_column",data:{block:"table-block",column:"c"}}]){
   const {a,b}=window.makePeers();try{window.sharedApply(a,command);window.sharedApply(b,command);window.sharedSync(a,b);a.undo();window.sharedSync(a,b);
    const hidden=!window.sharedNode(JSON.parse(a.document_json()).root,"p");b.undo();window.sharedSync(a,b);outputs.push({hidden,restored:!!window.sharedNode(JSON.parse(a.document_json()).root,"p")});
   }finally{a.free();b.free();}
  }return outputs;
 });
 expect(result).toEqual([{hidden:true,restored:true},{hidden:true,restored:true}]);
});

test("same-node later remote placement survives Undo and Redo with its caption intact",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   window.sharedApply(a,{kind:"move_block",data:{block:"image-block",parent:null,before:"table-block"}});b.receive(a.updates());
   window.sharedApply(b,{kind:"move_block",data:{block:"image-block",parent:null,before:null}},{kind:"insert_text",data:{block:"caption",offset:0,text:"Moved "}});a.receive(b.updates());
   const before=a.document_json();a.undo();const undo=a.document_json();window.sharedSync(a,b);a.redo();return {before,undo,redo:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.undo).toBe(result.before);expect(result.redo).toBe(result.before);
 expect(JSON.parse(result.before).root.children.at(-1).children[0].children.map(value=>value.text).join("")).toBe("Moved xy🙂");
});

test("failed shared groups do not partially publish and a real page reload preserves selective redo",async({page})=>{
 const saved=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   const before=a.document_json(),journal=a.checkpoint();let rejected=false;
   try{window.sharedApply(a,{kind:"insert_text",data:{block:"p",offset:1,text:"partial"}},{kind:"resize_image",data:{block:"image-block",size:[0,10]}});}catch{rejected=true;}
   if(a.document_json()!==before||a.checkpoint()!==journal)throw Error("Failed group published");
   window.sharedApply(a,{kind:"insert_text",data:{block:"p",offset:1,text:"local"}});window.sharedApply(b,{kind:"insert_text",data:{block:"caption",offset:0,text:"remote"}});window.sharedSync(a,b);a.undo();
   const saved=a.checkpoint(),current=a.document_json();a.redo();return {saved,current,future:a.document_json(),rejected};
  }finally{a.free();b.free();}
 });
 expect(saved.rejected).toBe(true);await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const recovered=await page.evaluate(async saved=>{const {RichReplicaProbe}=await import("/probe.js"),owner=RichReplicaProbe.restore("room",saved.saved);try{const current=owner.document_json();owner.redo();return {current,future:owner.document_json()};}finally{owner.free();}},saved);
 expect(recovered.current).toBe(saved.current);expect(recovered.future).toBe(saved.future);
});
