/** New selection intent must produce only original recipes readable by actual pre-capability Wasm. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {coverageSeed,range,grid} from "./fixtures/editor-consumer/coverage-seed.mjs";
const schema={name:"example/selection-format-interop",version:1};
const guard=(a,f)=>{const o=a.observe();try{return f(o);}finally{o.free();}};
const read=r=>{try{assert.equal(r.status,"value");return r.takeValue();}finally{r.free();}};
const take=(r,kind)=>{try{assert.equal(r.status,kind);return r[kind==="profile"?"takeProfile":"takeEditor"]();}finally{r.free();}};
async function load(dir,name){const bytes=readFileSync(resolve(dir,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(dir,`${name}.js`)));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
const local=(a,c)=>guard(a,o=>{const r=a.execute(o,JSON.stringify(c));try{assert.notEqual(r.status,"error");return r.status;}finally{r.free();}});
const strong={type:"breditor/strong",properties:{}},link=(href,newWindow)=>({type:"breditor-inline/link",properties:{"breditor-inline/href":href,"breditor-inline/new-window":newWindow}});
const set=f=>({kind:"set",formatsJson:JSON.stringify([f])});
export async function probeSelectionFormattingCompatibility(oldLocalDir,oldSharedDir,newLocalDir,newSharedDir){
 const ol=await load(oldLocalDir,"breditor_wasm"),os=await load(oldSharedDir,"breditor_shared"),nl=await load(newLocalDir,"breditor_wasm"),ns=await load(newSharedDir,"breditor_shared");
 let restores=0,future=0,legacyRejects=0,guardRejects=0,unchangedLegacyReads=0;
 const selections=[range("z-intro",1,"q2",2),{kind:"node",block:"image"},grid()];
 for(const selection of selections)for(const natural of [false,true])for(const patch of [false,true]){
  const owned=[];try{
   const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:7,schema,extensions:[]});
   const op=take(ol.module.BreditorRichProfile.fromStandardStructuralBootstrapJsonV2(bootstrap),"profile"),np=take(nl.module.BreditorRichProfile.fromStandardStructuralBootstrapJsonV2(bootstrap),"profile");owned.push(op,np);assert.equal(read(op.descriptorJson()),read(np.descriptorJson()));
   const input=coverageSeed(JSON.parse(read(np.descriptorJson()))),a=take(np.createEditor(input,"100"),"editor"),old=take(op.createEditor(input,"100"),"editor");owned.push(a,old);assert.equal(a.selectionFormattingVersion(),"1");assert.equal(old.selectionFormattingVersion,undefined);
   if(natural)guard(a,o=>read(a.enableTypingHistory(o)));
   local(a,{kind:"setSelection",selection});local(old,{kind:"setSelection",selection});
   if(selection.kind!=="text"){for(const owner of [a,old]){assert.equal(JSON.parse(guard(owner,o=>read(o.inlineFormatStateJson("breditor/strong")))).state.kind,"unavailable");unchangedLegacyReads++;}}
   const changes=[set(patch?link("https://one.test/",true):strong)],request={kind:"changeSelectionFormats",data:{changes}};
   const before=read(old.checkpointJson());guard(old,o=>{const r=old.execute(o,JSON.stringify(request));try{assert.equal(r.status,"error");}finally{r.free();}});assert.equal(read(old.checkpointJson()),before);legacyRejects++;
   local(a,request);if(patch)local(a,{kind:"changeSelectionFormats",data:{changes:[{kind:"patch",formatsJson:JSON.stringify([link("https://two.test/",false)]),properties:["breditor-inline/href"]}]}});
   const recover=natural?"restoreTypingEditor":"restoreEditor",saved=read(a.checkpointJson()),b=take(op[recover](saved),"editor");owned.push(b);assert.equal(read(b.checkpointJson()),saved);restores++;
   for(const kind of ["undo","redo","undo","redo"]){assert.equal(local(a,{kind}),local(b,{kind}));assert.equal(read(a.checkpointJson()),read(b.checkpointJson()));future++;}
   const c=take(np[recover](read(b.checkpointJson())),"editor");owned.push(c);assert.equal(read(c.checkpointJson()),read(b.checkpointJson()));restores++;
   for(const kind of ["undo","redo"]){local(b,{kind});local(c,{kind});assert.equal(read(b.checkpointJson()),read(c.checkpointJson()));future++;}
   const config=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:2,schema,extensions:[]}),osp=os.module.SharedRichProfile.from_standard_configuration_json_v2(config),nsp=ns.module.SharedRichProfile.from_standard_configuration_json_v2(config);owned.push(osp,nsp);assert.equal(osp.descriptor_json(),nsp.descriptor_json());
   const x=nsp.create(coverageSeed(JSON.parse(nsp.descriptor_json())),"101");owned.push(x);assert.equal(x.selection_formatting_version(),"1");assert.equal(os.module.SharedEditorOwner.prototype.selection_formatting_version,undefined);
   if(natural)guard(x,o=>x.enable_typing_history(o));guard(x,o=>x.set_selection(o,JSON.stringify(selection)));
   const cp=a=>natural?a.typing_checkpoint():a.checkpoint(),stale=x.observe();guard(x,o=>x.set_selection(o,JSON.stringify({kind:"node",block:"list"})));const unchanged=cp(x);assert.throws(()=>x.change_selection_formats(stale,"not JSON"));stale.free();assert.equal(cp(x),unchanged);guardRejects++;guard(x,o=>x.set_selection(o,JSON.stringify(selection)));
   guard(x,o=>x.change_selection_formats(o,JSON.stringify({changes})));if(patch)guard(x,o=>x.change_selection_formats(o,JSON.stringify({changes:[{kind:"patch",formatsJson:JSON.stringify([link("https://two.test/",false)]),properties:["breditor-inline/href"]}]})));
   const sharedRecover=natural?"restore_typing":"restore",y=osp[sharedRecover]("room",cp(x));owned.push(y);assert.equal(cp(y),cp(x));restores++;
   for(const kind of ["undo","redo","undo","redo"]){assert.equal(guard(x,o=>x[`${kind}_observed`](o)),guard(y,o=>y[`${kind}_observed`](o)));assert.equal(cp(x),cp(y));future++;}
   const z=nsp[sharedRecover]("room",cp(y));owned.push(z);assert.equal(cp(z),cp(y));restores++;for(const kind of ["undo","redo"]){guard(y,o=>y[`${kind}_observed`](o));guard(z,o=>z[`${kind}_observed`](o));assert.equal(cp(y),cp(z));future++;}
  }finally{for(const owner of owned.reverse())owner.free();}
 }
 return {format:"breditor/selection-formatting-interoperability",formatVersion:1,before:{local:ol.sha256,shared:os.sha256},after:{local:nl.sha256,shared:ns.sha256},crossVersionRestores:restores,exactFutureComparisons:future,legacyLocalRejections:legacyRejects,guardedSharedRejections:guardRejects,unchangedLegacyReads,originalProtocolsRetained:true,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==4)throw Error("Expected old-local old-shared new-local new-shared runtime directories");console.log(JSON.stringify(await probeSelectionFormattingCompatibility(...args),null,2));}
