/** Actual pre-capability/current Wasm must replay atom edits through original persisted recipes. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=JSON.parse(readFileSync(new URL("../crates/breditor-core/tests/fixtures/rich-local-root.json",import.meta.url),"utf8"));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const schema={name:"example/atom-interop",version:1};
const guard=(a,f)=>{const o=a.observe();try{return f(o);}finally{o.free();}};
const read=r=>{try{assert.equal(r.status,"value");return r.takeValue();}finally{r.free();}};
const take=(r,kind)=>{try{assert.equal(r.status,kind);return r[kind==="profile"?"takeProfile":"takeEditor"]();}finally{r.free();}};
async function load(dir,name){const bytes=readFileSync(resolve(dir,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(dir,`${name}.js`)));await module.default({module_or_path:bytes});return {module,sha256:createHash("sha256").update(bytes).digest("hex")};}
const local=(a,c)=>guard(a,o=>{const r=a.execute(o,JSON.stringify(c));try{assert.notEqual(r.status,"error");return r.status;}finally{r.free();}});
const localSaved=a=>read(a.checkpointJson());
const localView=a=>guard(a,o=>read(o.viewJson()));
function document(binding,language){const value=structuredClone(root);if(language===2)value.children.push({kind:"element",type:"breditor/horizontal-rule",entityId:null,properties:{"breditor/block-id":"rule"},children:[]});return JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(value)});}
export async function probeAtomEditCompatibility(oldLocalDir,oldSharedDir,newLocalDir,newSharedDir){
 const ol=await load(oldLocalDir,"breditor_wasm"),os=await load(oldSharedDir,"breditor_shared"),nl=await load(newLocalDir,"breditor_wasm"),ns=await load(newSharedDir,"breditor_shared");
 let restores=0,future=0,legacyRejects=0,guardRejects=0,typingGroups=0;
 for(const language of [1,2])for(const target of language===2?["table-block","image-block","rule"]:["table-block","image-block"])for(const mode of ["delete","plain","typing"]){
  const owned=[];try{
   const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:language===2?7:6,schema,extensions:[]}),factory=language===2?"fromStructuralBootstrapJsonV2":"fromBootstrapJson";
   const op=take(ol.module.BreditorRichProfile[factory](bootstrap),"profile"),np=take(nl.module.BreditorRichProfile[factory](bootstrap),"profile");owned.push(op,np);assert.equal(read(op.descriptorJson()),read(np.descriptorJson()));
   const input=document(JSON.parse(read(np.descriptorJson())),language),a=take(np.createEditor(input,"100"),"editor"),old=take(op.createEditor(input,"100"),"editor");owned.push(a,old);assert.equal(a.atomEditVersion(),"1");assert.equal(old.atomEditVersion,undefined);
   if(mode==="typing")guard(a,o=>read(a.enableTypingHistory(o)));
   local(a,{kind:"setSelection",selection:{kind:"node",block:target}});local(old,{kind:"setSelection",selection:{kind:"node",block:target}});
   const request=mode==="delete"?{kind:"deleteAtom",data:{paragraph:"fresh",movement:"after"}}:mode==="plain"?{kind:"replaceAtomPlainText",data:{paragraph:"fresh",text:"Q🙂"}}:{kind:"replaceAtomTypingText",data:{paragraph:"fresh",text:"Q",clockMs:"100"}};
   const before=localSaved(old);guard(old,o=>{const r=old.execute(o,JSON.stringify(request));try{assert.equal(r.status,"error");}finally{r.free();}});assert.equal(localSaved(old),before);legacyRejects++;
   local(a,request);if(mode==="typing"){for(const [text,clockMs] of [["R","200"],["🙂","300"]])local(a,{kind:"insertTypingText",data:{text,clockMs}});assert.equal(JSON.parse(localView(a)).undoDepth,1);typingGroups++;}
   const restoreName=mode==="typing"?"restoreTypingEditor":"restoreEditor",saved=localSaved(a),b=take(op[restoreName](saved),"editor");owned.push(b);assert.equal(localSaved(b),saved);restores++;
   const canType=JSON.parse(localView(a)).selection?.kind==="text";
   for(const c of [{kind:"undo"},{kind:"redo"},...(canType?[{kind:"insertPlainText",text:"!"}]:[]),{kind:"undo"},{kind:"redo"}]){assert.equal(local(a,c),local(b,c));assert.equal(localSaved(a),localSaved(b));assert.equal(localView(a),localView(b));future++;}
   const c=take(np[restoreName](localSaved(b)),"editor");owned.push(c);assert.equal(localSaved(c),localSaved(b));restores++;for(const kind of ["undo","redo"]){local(b,{kind});local(c,{kind});assert.equal(localSaved(b),localSaved(c));future++;}

   const config=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:language,schema,extensions:[]}),sf=language===2?"from_configuration_json_v2":"from_configuration_json";
   const osp=os.module.SharedRichProfile[sf](config),nsp=ns.module.SharedRichProfile[sf](config);owned.push(osp,nsp);const x=nsp.create(document(JSON.parse(nsp.descriptor_json()),language),"101");owned.push(x);assert.equal(x.atom_edit_version(),"1");assert.equal(os.module.SharedEditorOwner.prototype.atom_edit_version,undefined);
   if(mode==="typing")guard(x,o=>x.enable_typing_history(o));guard(x,o=>x.set_selection(o,JSON.stringify({kind:"node",block:target})));
   const cp=a=>mode==="typing"?a.typing_checkpoint():a.checkpoint();const stale=x.observe();guard(x,o=>x.set_selection(o,JSON.stringify({kind:"node",block:target==="image-block"?"table-block":"image-block"})));const unchanged=cp(x);assert.throws(()=>x.delete_atom(stale,"fresh","invalid"));stale.free();assert.equal(cp(x),unchanged);guardRejects++;guard(x,o=>x.set_selection(o,JSON.stringify({kind:"node",block:target})));
   if(mode==="delete")guard(x,o=>x.delete_atom(o,"fresh","after"));else if(mode==="plain")guard(x,o=>x.replace_atom_plain_text(o,"fresh","Q🙂"));else{guard(x,o=>x.replace_atom_typing_text(o,"fresh","Q","100"));for(const [text,clockMs]of [["R","200"],["🙂","300"]])guard(x,o=>x.insert_typing_text(o,JSON.stringify({text,clockMs})));assert.equal(JSON.parse(x.view_json()).undoDepth,1);typingGroups++;}
   const recover=mode==="typing"?"restore_typing":"restore",y=osp[recover]("room",cp(x));owned.push(y);assert.equal(cp(y),cp(x));restores++;
   for(const kind of ["undo","redo","undo","redo"]){assert.equal(guard(x,o=>x[`${kind}_observed`](o)),guard(y,o=>y[`${kind}_observed`](o)));assert.equal(cp(x),cp(y));assert.equal(x.view_json(),y.view_json());future++;}
   const z=nsp[recover]("room",cp(y));owned.push(z);assert.equal(cp(z),cp(y));restores++;for(const kind of ["undo","redo"]){guard(y,o=>y[`${kind}_observed`](o));guard(z,o=>z[`${kind}_observed`](o));assert.equal(cp(y),cp(z));future++;}
  }finally{for(const v of owned.reverse())v.free();}
 }
 return {format:"breditor/atom-edit-interoperability",formatVersion:1,before:{local:ol.sha256,shared:os.sha256},after:{local:nl.sha256,shared:ns.sha256},crossVersionRestores:restores,exactFutureComparisons:future,legacyLocalRejections:legacyRejects,guardedSharedRejections:guardRejects,compositeTypingGroups:typingGroups,originalProtocolsRetained:true,passed:true};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==4)throw Error("Expected old-local old-shared new-local new-shared runtime directories");console.log(JSON.stringify(await probeAtomEditCompatibility(...args),null,2));}
