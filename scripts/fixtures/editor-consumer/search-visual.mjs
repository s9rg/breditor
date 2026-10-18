/** Real installed owners, standard semantic fixtures and the shipped borrowed search controls. */
import {createLayoutLocalProfileV3,openLocalDocumentEditor,mountSearchPanel} from "@breditor/editor";
import {createLayoutSharedProfileV3,openSharedDocumentSearchEditor} from "@breditor/editor/collaboration";
import {coverageSeed} from "./coverage-seed.mjs";
const query={pattern:"a🙂b",mode:"literal",caseSensitive:true,wholeWords:false},errors=[];
const report=error=>{errors.push(String(error));document.querySelector("#ready").textContent=String(error);};
try{
 const localProfile=await createLayoutLocalProfileV3(),sharedProfile=await createLayoutSharedProfileV3();let local,shared;
 try{
  const toolbar=(_core,standard)=>standard.filter(control=>["undo","redo","bold","italic"].includes(control.id)),resolveAsset=binding=>binding.asset==="asset"&&binding.generation==="gen"?new URL("./search-diagram.svg",import.meta.url).href:undefined;
  local=await openLocalDocumentEditor({host:document.querySelector("#local .editor"),selectionEditing:"document-v1",richLanguage:3,history:"typing-v1",initial:{kind:"document",documentJson:coverageSeed(localProfile.descriptor())},toolbar,resolveAsset,onError:report});
  shared=await openSharedDocumentSearchEditor({host:document.querySelector("#shared .editor"),selectionEditing:"document-v1",richLanguage:3,history:"typing-v1",database:"breditor-installed-search-browser",room:"room",writer:"101",initial:{kind:"document",documentJson:coverageSeed(JSON.parse(sharedProfile.descriptor_json()))},toolbar,resolveAsset,onError:report});
 }finally{localProfile.dispose();sharedProfile.free();}
 const localPanel=mountSearchPanel(document.querySelector("#local .controls"),local.search(),{initialQuery:query,initialReplacement:{text:"Found",mode:"literal"},debounceMs:0,onError:report}),sharedPanel=mountSearchPanel(document.querySelector("#shared .controls"),shared.search(),{initialQuery:query,initialReplacement:{text:"Found",mode:"literal"},debounceMs:0,onError:report});
 document.querySelector("#local [data-open-search]").addEventListener("click",()=>localPanel.focus());document.querySelector("#shared [data-open-search]").addEventListener("click",()=>sharedPanel.focus());
 globalThis.searchExample={local,shared,localPanel,sharedPanel,errors,snapshot(){return{local:local.view(),shared:shared.view(),localSearch:localPanel.state(),sharedSearch:sharedPanel.state()};},async close(){localPanel.dispose();sharedPanel.dispose();local.dispose();await shared.close();}};
 document.querySelector("#ready").textContent="Ready · Two actual native owners · Search is transient; replacements use exact native history";
}catch(error){report(error);throw error;}
