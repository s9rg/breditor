import {openLocalEditor,openLocalDocumentEditor,createLocalProfile,RichAssetStore,RichDocumentSessionStore,RichLocalSessionStore,standardSchemaFingerprintV4} from "@breditor/editor";
import {seed,range} from "./seed.mjs";
const errors=[],profile=await createLocalProfile(),documentJson=seed(profile.descriptor());profile.dispose();const assets=await RichAssetStore.open("installed-sdk-assets");
const natural=new URL(location.href).searchParams.get("history")==="typing",storageKey=natural?"installed-sdk-typing":"installed-sdk-checkpoint",saved=sessionStorage.getItem(storageKey);
const editor=await openLocalEditor({host:document.querySelector("#editor"),...(natural?{history:"typing-v1"}:{}),initial:saved?{kind:natural?"typingCheckpoint":"checkpoint",checkpointJson:saved}:{kind:"document",documentJson},resolveAsset:binding=>assets.resolve(binding.asset),onError:error=>errors.push(String(error)),onFiles:(files,position)=>editor.insertImageFiles(assets,files,position)});
window.sdk={editor,openLocalEditor,createLocalProfile,errors,assets,range,save:()=>sessionStorage.setItem(storageKey,editor.checkpointJson()),dispose:()=>{editor.dispose();assets.close();}};
window.sdk.verifyLocalCheckpointAdmission=async()=>{
 const check=(condition,message)=>{if(!condition)throw Error(message);};
 const refuses=async operation=>{try{await operation();return false;}catch{return true;}};
 const host=document.createElement("main");document.body.append(host);
 const receipt={freshFamilies:0,malformedReads:0,malformedWrites:0,exactMalformedRows:0,exactNativeReopens:0};
 try{
  for(const family of ["original",3,4]){
   const original=family==="original",key=original?"current":"current:document-v1",name="local-admission-"+family+"-"+crypto.randomUUID();
   const policy={richLanguage:original?3:family,...(family===4?{schemaFingerprint:standardSchemaFingerprintV4}:{}),history:"typing-v1"};
   const options={host,richLanguage:policy.richLanguage,history:policy.history,...(original?{}:{selectionEditing:"document-v1"})};
   const open=original?openLocalEditor:openLocalDocumentEditor;
   const store=original?await RichLocalSessionStore.open(name):await RichDocumentSessionStore.open(name,policy);
   const legacy=original?store:await RichLocalSessionStore.open(name);
   let owner,db;
   try{
    check(await store.load()===null,"A genuinely absent key must load as empty");receipt.freshFamilies++;
    if(!original){check(await store.loadLegacy()===null,"Absent legacy key must load as empty");await legacy.save("opaque legacy bytes");}
    owner=await open({...options,initial:{kind:"empty",documentId:"checkpoint-admission",blockId:"body"}});
    const before=owner.view().documentJson;
    owner.execute({kind:"insertPlainText",text:"Durable native history"});
    const after=owner.view().documentJson;check(before!==after,"The edit must produce distinct native document bytes");
    owner.execute({kind:"undo"});
    const checkpoint=owner.checkpointJson(),undone=owner.view().documentJson;await store.save(checkpoint);owner.dispose();owner=undefined;
    db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const request=(mode,issue)=>new Promise((resolve,reject)=>{
     const tx=db.transaction("checkpoint",mode),operation=issue(tx.objectStore("checkpoint"));
     tx.oncomplete=()=>resolve(operation.result);tx.onabort=()=>reject(tx.error);
    });
    const read=()=>request("readonly",object=>object.getAll(key,1)),put=value=>request("readwrite",object=>object.put(value,key));
    const [durable]=await read(),bad=[undefined,null,original?{checkpointJson:checkpoint}:{...durable,checkpointJson:"[]"}];
    if(!original)bad.push({...durable,richLanguage:1});
    for(const value of bad){
     await put(value);
     if(await refuses(()=>store.load()))receipt.malformedReads++;
     if(await refuses(()=>store.save(checkpoint)))receipt.malformedWrites++;
     const rows=await read();if(rows.length===1&&JSON.stringify(rows[0])===JSON.stringify(value))receipt.exactMalformedRows++;
    }
    if(!original)check(await store.loadLegacy()==="opaque legacy bytes","Document writes must preserve distinct opaque legacy bytes");
    if(original){
     const prospective=await RichDocumentSessionStore.open(name,policy);
     try{if(await refuses(()=>prospective.loadLegacy()))receipt.malformedReads++;}finally{prospective.close();}
    }
    await put(durable);db.close();db=undefined;store.close();
    const reader=original?await RichLocalSessionStore.open(name):await RichDocumentSessionStore.open(name,policy);
    try{
     check(await reader.load()===checkpoint,"The exact native checkpoint must survive a cold reopen");
     owner=await open({...options,initial:{kind:original?"typingCheckpoint":"documentTypingCheckpoint",checkpointJson:await reader.load()}});
     check(owner.checkpointJson()===checkpoint&&owner.view().documentJson===undone,"Native checkpoint and undone document must match");
     owner.execute({kind:"redo"});check(owner.view().documentJson===after,"Native Redo must recover exact future bytes");
     owner.execute({kind:"undo"});check(owner.view().documentJson===undone,"Native Undo must recover exact prior bytes");
     receipt.exactNativeReopens++;
    }finally{reader.close();}
   }finally{owner?.dispose();db?.close();legacy.close();store.close();}
  }
  return receipt;
 }finally{host.remove();}
};
document.querySelector("#files").addEventListener("change",async event=>{try{await editor.insertImageFiles(assets,[...event.currentTarget.files],{parent:{kind:"document"},before:null});}catch(error){errors.push(String(error));}});
document.querySelector("#save").addEventListener("click",window.sdk.save);document.querySelector("#ready").textContent="Ready";
