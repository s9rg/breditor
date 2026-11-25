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
window.sdk.measureLocalCheckpointWrites=async()=>{
 const check=(condition,message)=>{if(!condition)throw Error(message);};
 const bytes=value=>new TextEncoder().encode(typeof value==="string"?value:value.checkpointJson);
 const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes(value))),b=>b.toString(16).padStart(2,"0")).join("");
 const host=document.createElement("main"),results=[];document.body.append(host);
 try{
  for(const family of ["original",3,4]){
   const original=family==="original",name="local-writes-"+family+"-"+crypto.randomUUID();
   const policy={richLanguage:original?3:family,history:"typing-v1",...(family===4?{schemaFingerprint:standardSchemaFingerprintV4}:{})};
   const settings={host,richLanguage:policy.richLanguage,history:policy.history,...(original?{}:{selectionEditing:"document-v1"})};
   const open=original?openLocalEditor:openLocalDocumentEditor;
   const openStore=()=>original?RichLocalSessionStore.open(name):RichDocumentSessionStore.open(name,policy);
   let owner,first,second,put=IDBObjectStore.prototype.put,writes=[];
   try{
    first=await openStore();second=await openStore();
    owner=await open({...settings,initial:{kind:"empty",documentId:"checkpoint-write-proof",blockId:"body"}});
    const empty=owner.view().documentJson;
    owner.execute({kind:"insertPlainText",text:"Durable draft 🙂 ".repeat(8192)});
    const edited=owner.view().documentJson;
    check(edited!==empty,"Native editor must commit the measured draft");
    owner.execute({kind:"undo"});
    const checkpoint=owner.checkpointJson(),undone=owner.view().documentJson;
    check(bytes(checkpoint).byteLength>=128*1024,"A substantial exact checkpoint must be measured");
    await first.save(checkpoint);
    IDBObjectStore.prototype.put=function(value,...args){
     const request=put.call(this,value,...args);
     if(this.name==="checkpoint"&&this.transaction.db.name===name)writes.push(bytes(value).byteLength);
     return request;
    };
    await Promise.all(Array.from({length:6},()=>first.save(checkpoint)));
    check(await first.load()===checkpoint,"Repeated saves must acknowledge the same durable checkpoint");
    const repeated={rows:writes.length,payloadBytes:writes.reduce((sum,size)=>sum+size,0)};
    writes=[];
    owner.execute({kind:"redo"});
    const next=owner.checkpointJson();
    check(next!==checkpoint&&owner.view().documentJson===edited,"Native Redo must produce a different durable cut");
    await second.save(next);
    check(await second.load()===next,"The second handle must commit the different cut");
    await first.save(checkpoint);
    check(await second.load()===checkpoint,"Re-saving the first cut must observe the other handle's actual durable change");
    check(writes.length===2&&writes[0]===bytes(next).byteLength&&writes[1]===bytes(checkpoint).byteLength,"Two actual changes must submit their exact payloads");
    const changed={rows:writes.length,payloadBytes:writes.reduce((sum,size)=>sum+size,0)};
    owner.dispose();owner=undefined;first.close();first=undefined;second.close();second=await openStore();
    const recovered=await second.load();
    check(recovered===checkpoint,"Cold storage must return all prior native bytes");
    owner=await open({...settings,initial:{kind:original?"typingCheckpoint":"documentTypingCheckpoint",checkpointJson:recovered}});
    check(owner.checkpointJson()===checkpoint&&owner.view().documentJson===undone,"Cold native restore must be exact");
    owner.execute({kind:"redo"});check(owner.view().documentJson===edited,"Cold native Redo must retain the draft");
    owner.execute({kind:"undo"});check(owner.view().documentJson===undone,"Cold native Undo must retain the previous cut");
    results.push({family,repeated,changed,checkpointBytes:bytes(checkpoint).byteLength,checkpointSha256:await hash(checkpoint),nativeUndoRedo:true});
   }finally{IDBObjectStore.prototype.put=put;owner?.dispose();first?.close();second?.close();}
  }
  return results;
 }finally{host.remove();}
};
document.querySelector("#files").addEventListener("change",async event=>{try{await editor.insertImageFiles(assets,[...event.currentTarget.files],{parent:{kind:"document"},before:null});}catch(error){errors.push(String(error));}});
document.querySelector("#save").addEventListener("click",window.sdk.save);document.querySelector("#ready").textContent="Ready";
