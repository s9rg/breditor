import {test,expect} from "@playwright/test";
test.beforeEach(async({page})=>{await page.goto("/layout-headless.html");await expect(page.locator("#ready")).toHaveText("Ready");});
test("installed V3 local native layout retains merged domains and exact explicit/natural recovery",async({page})=>{
 expect(await page.evaluate(()=>{
  const t=window.layout,results=[];
  for(const typing of [false,true]){
   const a=t.local.createEditor(t.source);let b;
   try{
    if(typing)a.enableTypingHistory();a.execute({kind:"setSelection",selection:t.grid()});
    const original=a.documentJson();a.execute({kind:"changeSelectionLayout",data:t.full});const saved=a.checkpointJson();
    b=typing?t.local.restoreTypingEditor(saved):t.local.restoreEditor(saved);
    const state=a.blockLayoutState(),checks=[];
    for(const kind of ["undo","redo","undo","redo"]){a.execute({kind});b.execute({kind});checks.push(a.checkpointJson()===b.checkpointJson()&&(kind!=="undo"||a.documentJson()===original));}
    results.push({version:a.richLanguageVersion(),supported:a.supportsBlockLayout(),blocks:state.blocks,alignment:state.alignment,direction:state.direction,exact:checks.every(Boolean)});
   }finally{a.dispose();b?.dispose();}
  }return results;
 })).toEqual([false,true].map(()=>({version:3,supported:true,blocks:"4",alignment:{kind:"uniform",value:"start"},direction:{kind:"uniform",value:"rtl"},exact:true})));
});
test("installed V3 shared independent offline fields and peer text retain selective undo and restart",async({page})=>{
 expect(await page.evaluate(async()=>{
  const t=window.layout,a=new t.SharedRichEditor(t.shared.create(t.source,"101")),b=new t.SharedRichEditor(t.shared.join_frame("room","202",a.updateFrame()));let restored;
  try{
   a.enableTypingHistory();a.select(t.grid());b.select(t.grid());a.changeSelectionLayout({alignment:"start",indent:12});b.changeSelectionLayout({direction:"rtl",lineHeightPercent:300});
   b.dispatch({commands:[{kind:"insert_text",data:{block:"p-0-0",offset:1,text:"PEER"}}]});const x=a.updateFrame(),y=b.updateFrame();await a.receiveFrame(y);await b.receiveFrame(x);
   const converged=a.documentJson()===b.documentJson(),state=a.blockLayoutState(),saved=a.checkpointJson();restored=new t.SharedRichEditor(t.shared.restore_typing("room",saved));
   a.undo();restored.undo();const undone=a.blockLayoutState(),peer=a.documentJson().includes("PEER"),exactUndo=a.checkpointJson()===restored.checkpointJson();a.redo();restored.redo();
   return {version:a.richLanguageVersion(),converged,state:{alignment:state.alignment,direction:state.direction},undone:{alignment:undone.alignment,direction:undone.direction},peer,exactUndo,exactRedo:a.checkpointJson()===restored.checkpointJson()};
  }finally{a.dispose();b.dispose();restored?.dispose();}
 })).toEqual({version:3,converged:true,state:{alignment:{kind:"uniform",value:"start"},direction:{kind:"uniform",value:"rtl"}},undone:{alignment:{kind:"uniform",value:null},direction:{kind:"uniform",value:"rtl"}},peer:true,exactUndo:true,exactRedo:true});
});
for(const history of ["explicit","typing-v1"])test(`installed V3 ${history} durable storage uses exact model13 recovery and future history`,async({page})=>{
 expect(await page.evaluate(async history=>{
  const t=window.layout,options={database:`layout-${history}-${crypto.randomUUID()}`,room:"room",writer:"505",richLanguage:3,history,create:()=>t.shared.create(t.source,"505"),restore:(s,family)=>family==="typing-v1"?t.shared.restore_typing("room",s):t.shared.restore("room",s)};
  const first=await t.SharedPersistentSession.open(options);let reopened;
  try{
   first.core.select({kind:"node",block:"image"});first.core.changeSelectionLayout(t.full);await first.flush();const saved=first.core.checkpointJson();await first.close();
   reopened=await t.SharedPersistentSession.open(options);const exact=reopened.core.checkpointJson()===saved;reopened.core.undo();const undone=reopened.core.blockLayoutState();reopened.core.redo();await reopened.flush();
   return {recovered:reopened.recovered,exact,undone:undone.alignment,redone:reopened.core.blockLayoutState().alignment,model:reopened.core.descriptor().modelVersion};
  }finally{await first.close();await reopened?.close();}
 },history)).toEqual({recovered:true,exact:true,undone:{kind:"uniform",value:null},redone:{kind:"uniform",value:"start"},model:13});
});
test("installed old factories remain strict and V3 stale malformed/read-only requests publish nothing",async({page})=>{
 expect(await page.evaluate(async()=>{
  const t=window.layout,legacy=[];
  for(const factory of [t.createLocalProfile,t.createStructuralLocalProfileV2]){
   const p=await factory();let a;
   try{a=p.createEditor(t.emptyDocumentJson(p.descriptor(),"old","p"));a.execute({kind:"setSelection",selection:t.range("p",0)});const before=a.checkpointJson();let refused=false;try{a.execute({kind:"changeSelectionLayout",data:t.full});}catch{refused=true;}legacy.push(refused&&!a.supportsBlockLayout()&&a.checkpointJson()===before);}finally{a?.dispose();p.dispose();}
  }
  const a=t.local.createEditor(t.source);try{
   a.execute({kind:"setSelection",selection:t.range("empty",0)});const revision=a.view().revision;a.execute({kind:"changeSelectionLayout",data:t.full});const before=a.checkpointJson();let stale=false,duplicate=false,locked=false;
   try{a.execute("not JSON",revision);}catch{stale=true;}
   try{a.execute('{"kind":"changeSelectionLayout","data":{"alignment":"left","alignment":"right"}}');}catch{duplicate=true;}
   const exact=before===a.checkpointJson();a.setReadOnly(true);const saved=a.checkpointJson();try{a.execute({kind:"changeSelectionLayout",data:{alignment:null}});}catch{locked=true;}
   return {legacy,stale,duplicate,exact,locked,unchanged:saved===a.checkpointJson(),readable:a.blockLayoutState().alignment};
  }finally{a.dispose();}
 })).toEqual({legacy:[true,true],stale:true,duplicate:true,exact:true,locked:true,unchanged:true,readable:{kind:"uniform",value:"start"}});
});
