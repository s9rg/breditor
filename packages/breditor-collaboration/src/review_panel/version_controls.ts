import type {SharedDocumentVersionRestorePlan} from "../version_plan.js";
import type {PanelContext} from "./types.js";
import {button,field} from "./dom.js";
/** A native preview must be explicitly confirmed; UI never applies a document JSON snapshot. */
export function versionControls(context:PanelContext){
 const catalog=context.options.versions;if(!catalog)return undefined;
 if(!context.options.allocatePrefix)throw Error("Version restore controls require a durable fresh-prefix allocator");
 const d=context.document,element=d.createElement("section"),heading=d.createElement("h2"),name=field(d,"Version name",1),select=d.createElement("select"),selectionLabel=d.createElement("label"),preview=d.createElement("pre"),status=d.createElement("p");
 heading.textContent="Named versions";selectionLabel.append(d.createTextNode("Saved version"),select);
 let plan:SharedDocumentVersionRestorePlan|undefined,planRevision:string|undefined,busy=false,closed=false,failed=false;
 const save=button(d,"Save named version",()=>{void saving(false);});
 const retry=button(d,"Retry version persistence",()=>{void saving(true);});retry.hidden=true;
 const compare=button(d,"Compare version",()=>context.run(()=>{const diff=context.core.compareVersion(catalog.versionPacket(select.value));preview.textContent=JSON.stringify(diff,null,2);}));
 const prepare=button(d,"Preview restore",()=>context.run(()=>{
  disposePlan();const revision=context.core.view().revision;plan=context.core.prepareVersionRestore(catalog.versionPacket(select.value),context.options.allocatePrefix!(),revision);planRevision=revision;
  preview.textContent=JSON.stringify({version:plan.version(),comparison:plan.comparison(),document:JSON.parse(plan.documentJson()) as unknown,notice:"Restore creates fresh identities and keeps current discussions. Inactive merge history and asset bytes are not restored."},null,2);update();
 }));
 const apply=button(d,"Apply restore",()=>context.run(()=>{if(!plan)throw Error("Prepare a current native restore preview first");context.core.applyVersionRestore(plan);disposePlan();status.textContent="Restored as a new undoable edit. Current discussions were retained.";update();}));
 function disposePlan(){plan?.dispose();plan=undefined;planRevision=undefined;}
 function update(){save.disabled=busy||!name.input.value.trim();retry.hidden=!failed;retry.disabled=busy;compare.disabled=busy||!select.value;prepare.disabled=compare.disabled||context.core.view().readOnly===true;apply.disabled=busy||!plan||context.core.view().readOnly===true;}
 async function saving(retrying:boolean){if(busy||closed)return;busy=true;failed=false;const captured=name.input.value;status.textContent="Saving paired histories and versions…";update();try{if(retrying)await catalog!.retry();else{catalog!.saveVersion(captured,(context.options.nowMs??(()=>Date.now().toString()))());await catalog!.flush();}if(!closed){if(!retrying&&name.input.value===captured)name.input.value="";context.run(()=>{});status.textContent="Version catalog and both histories saved locally.";refresh();}}catch(error){if(!closed){failed=true;status.textContent="Version save failed. Your draft is retained; inspect retained versions, then retry persistence without recapturing.";context.report(error);}}finally{busy=false;if(!closed)update();}}
 function refresh(){const value=select.value;select.replaceChildren();for(const info of catalog!.versions()){const option=d.createElement("option");option.value=info.id;option.textContent=`${info.name} — ${info.author}`;select.append(option);}if([...select.options].some(o=>o.value===value))select.value=value;
  if(plan&&planRevision!==context.core.view().revision){disposePlan();preview.textContent="The source publication changed. Preview the restore again before applying.";}update();}
 select.onchange=()=>{disposePlan();preview.textContent="";update();};name.input.oninput=update;element.append(heading,name.label,save,retry,selectionLabel,compare,prepare,apply,preview,status);refresh();
 return {element,refresh,dispose(){closed=true;disposePlan();}};
}
