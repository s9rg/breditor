import type {SharedDocumentVersionRestorePlan} from "../version_plan.js";
import type {PanelContext} from "./types.js";
import {button,field} from "./dom.js";
/** A native preview must be explicitly confirmed; UI never applies a document JSON snapshot. */
export function versionControls(context:PanelContext){
 const catalog=context.options.versions;if(!catalog)return undefined;
 if(!context.options.allocatePrefix)throw Error("Version restore controls require a durable fresh-prefix allocator");
 const d=context.document,element=d.createElement("section"),heading=d.createElement("h2"),name=field(d,"Version name",1),select=d.createElement("select"),selectionLabel=d.createElement("label"),preview=d.createElement("pre"),status=d.createElement("p"),sharedStatus=d.createElement("p");
 heading.textContent="Named versions";selectionLabel.append(d.createTextNode("Saved version"),select);
 let plan:SharedDocumentVersionRestorePlan|undefined,planRevision:string|undefined,busy=false,closed=false,failed=false,choice=0;
 const save=button(d,"Save named version",()=>{void saving(false);});
 const retry=button(d,"Retry version persistence",()=>{void saving(true);});retry.hidden=true;
 const compare=button(d,"Compare version",()=>withPacket(packet=>{const diff=context.core.compareVersion(packet);preview.textContent=JSON.stringify(diff,null,2);}));
 const prepare=button(d,"Preview restore",()=>withPacket((packet,revision)=>{
  disposePlan();plan=context.core.prepareVersionRestore(packet,context.options.allocatePrefix!(),revision);planRevision=revision;
  preview.textContent=JSON.stringify({version:plan.version(),comparison:plan.comparison(),document:JSON.parse(plan.documentJson()) as unknown,notice:"Restore creates fresh identities and keeps current discussions. Inactive merge history and asset bytes are not restored."},null,2);update();
 }));
 const apply=button(d,"Apply restore",()=>context.run(()=>{if(!plan)throw Error("Prepare a current native restore preview first");context.core.applyVersionRestore(plan);disposePlan();status.textContent="Restored as a new undoable edit. Current discussions were retained.";update();}));
 function disposePlan(){plan?.dispose();plan=undefined;planRevision=undefined;}
 function withPacket(work:(packet:string,revision:string)=>void){if(busy||closed||!select.value)return;const id=select.value,revision=context.core.view().revision,generation=choice;
  if(!catalog!.loadVersion){context.run(()=>work(catalog!.versionPacket(id),revision));return;}
  busy=true;status.textContent="Loading and saving the immutable version packet locally…";update();
  void catalog!.loadVersion(id).then(packet=>{if(closed)return;if(choice!==generation||select.value!==id||context.core.view().revision!==revision)throw Error("The selected version or source publication changed while loading. Retry against the current source.");status.textContent="Version packet loaded and saved locally.";context.run(()=>work(packet,revision));}).catch(error=>{if(!closed){status.textContent="Version could not be used. The current document and drafts were retained.";context.report(error);}}).finally(()=>{busy=false;if(!closed)update();});
 }
 const sync=button(d,"Sync versions",()=>{if(busy||closed)return;busy=true;update();void catalog!.syncVersions!().then(()=>{if(!closed){status.textContent="Version catalog refreshed. Queued publications remain pending until accepted.";refresh();}}).catch(error=>{if(!closed){status.textContent="Version synchronization did not finish; retained local packets were kept.";context.report(error);}}).finally(()=>{busy=false;if(!closed)update();});});sync.hidden=!catalog.syncVersions;
 function update(){const state=catalog!.versionsState?.();save.disabled=busy||!name.input.value.trim();retry.hidden=!(failed||state?.status==="local-save-failed");retry.disabled=busy;sync.disabled=busy;compare.disabled=busy||!select.value;prepare.disabled=compare.disabled||context.core.view().readOnly===true;apply.disabled=busy||!plan||context.core.view().readOnly===true;
  if(state){const selected=select.value?catalog!.versionStatus?.(select.value):undefined;sharedStatus.textContent=`Shared versions: ${state.status}. ${state.queued} queued; ${state.catalogEntries} accepted catalog entries.${state.waitingForDocument?" Waiting for document history acceptance.":""}${selected?` Selected packet: ${selected.cached?(selected.localSaved?"saved locally":"local save unconfirmed"):"not cached; requires a connection"}; ${selected.accepted?`server accepted at ${selected.accepted.sequence}`:selected.queued?"queued, not yet accepted":"local draft, not queued"}.`:""}`;}else sharedStatus.textContent="";
 }
 async function saving(retrying:boolean){if(busy||closed)return;busy=true;failed=false;const captured=name.input.value;status.textContent="Saving paired histories and versions…";update();try{if(retrying)await catalog!.retry();else{catalog!.saveVersion(captured,(context.options.nowMs??(()=>Date.now().toString()))());await catalog!.flush();}if(!closed){if(!retrying&&name.input.value===captured)name.input.value="";context.run(()=>{});status.textContent=catalog!.versionsState?"Version saved locally. Server acceptance is reported separately below.":"Version catalog and both histories saved locally.";refresh();}}catch(error){if(!closed){failed=true;status.textContent="Version save failed. Your draft is retained; inspect retained versions, then retry persistence without recapturing.";context.report(error);}}finally{busy=false;if(!closed)update();}}
 function refresh(){const value=select.value;select.replaceChildren();for(const info of catalog!.versions()){const option=d.createElement("option");option.value=info.id;option.textContent=`${info.name} — ${info.author}`;select.append(option);}if([...select.options].some(o=>o.value===value))select.value=value;
  if(plan&&planRevision!==context.core.view().revision){disposePlan();preview.textContent="The source publication changed. Preview the restore again before applying.";}update();}
 select.onchange=()=>{choice++;disposePlan();preview.textContent="";update();};name.input.oninput=update;element.append(heading,name.label,save,retry,sync,selectionLabel,compare,prepare,apply,preview,status,sharedStatus);refresh();const unsubscribe=catalog.subscribeVersions?.(()=>{if(!closed)refresh();});
 return {element,refresh,dispose(){closed=true;unsubscribe?.();disposePlan();}};
}
