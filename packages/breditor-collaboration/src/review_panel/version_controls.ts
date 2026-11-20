import type {SharedDocumentVersionRestorePlan} from "../version_plan.js";
import type {PanelContext} from "./types.js";
import {button,field} from "./dom.js";
import {richUiError,type RichUiStringKey} from "@breditor/experimental-rich-content/rendering";
const syncStates:Readonly<Record<string,RichUiStringKey>>={offline:"syncOffline",connecting:"syncConnecting",syncing:"syncSyncing",ready:"syncReady",pending:"syncPending",denied:"syncDenied",failed:"syncFailed","local-save-failed":"syncLocalSaveFailed",closed:"syncClosed"};
/** @internal Catalog text for a synchronization state code; unknown codes display as themselves. */
export function syncStateText(ui:import("@breditor/experimental-rich-content/rendering").RichUiLocale,status:string):string{return Object.prototype.hasOwnProperty.call(syncStates,status)?ui.text(syncStates[status]!):status;}
/** A native preview must be explicitly confirmed; UI never applies a document JSON snapshot. */
export function versionControls(context:PanelContext){
 const catalog=context.options.versions;if(!catalog)return undefined;
 if(!context.options.allocatePrefix)throw Error("Version restore controls require a durable fresh-prefix allocator");
 const d=context.document,ui=context.ui,element=d.createElement("section"),heading=d.createElement("h2"),name=field(d,ui.text("versionName"),1),select=d.createElement("select"),selectionLabel=d.createElement("label"),preview=d.createElement("pre"),status=d.createElement("p"),sharedStatus=d.createElement("p");
 heading.textContent=ui.text("versionHeading");selectionLabel.append(d.createTextNode(ui.text("versionSaved")),select);
 let plan:SharedDocumentVersionRestorePlan|undefined,planRevision:string|undefined,busy=false,closed=false,failed=false,choice=0;
 const save=button(d,ui.text("versionSave"),()=>{void saving(false);});
 const retry=button(d,ui.text("versionRetry"),()=>{void saving(true);});retry.hidden=true;
 const compare=button(d,ui.text("versionCompare"),()=>withPacket(packet=>{const diff=context.core.compareVersion(packet);preview.textContent=JSON.stringify(diff,null,2);}));
 const prepare=button(d,ui.text("versionPreview"),()=>withPacket((packet,revision)=>{
  disposePlan();plan=context.core.prepareVersionRestore(packet,context.options.allocatePrefix!(),revision);planRevision=revision;
  preview.textContent=JSON.stringify({version:plan.version(),comparison:plan.comparison(),document:JSON.parse(plan.documentJson()) as unknown,notice:ui.text("versionRestoreNotice")},null,2);update();
 }));
 const apply=button(d,ui.text("versionApply"),()=>context.run(()=>{if(!plan)throw richUiError("versionErrorNoPlan");context.core.applyVersionRestore(plan);disposePlan();status.textContent=ui.text("versionRestored");update();}));
 function disposePlan(){plan?.dispose();plan=undefined;planRevision=undefined;}
 function withPacket(work:(packet:string,revision:string)=>void){if(busy||closed||!select.value)return;const id=select.value,revision=context.core.view().revision,generation=choice;
  if(!catalog!.loadVersion){context.run(()=>work(catalog!.versionPacket(id),revision));return;}
  busy=true;status.textContent=ui.text("versionLoading");update();
  void catalog!.loadVersion(id).then(packet=>{if(closed)return;if(choice!==generation||select.value!==id||context.core.view().revision!==revision)throw richUiError("versionErrorChanged");status.textContent=ui.text("versionLoaded");context.run(()=>work(packet,revision));}).catch(error=>{if(!closed){status.textContent=ui.text("versionUnusable");context.report(error);}}).finally(()=>{busy=false;if(!closed)update();});
 }
 const sync=button(d,ui.text("versionSync"),()=>{if(busy||closed)return;busy=true;update();void catalog!.syncVersions!().then(()=>{if(!closed){status.textContent=ui.text("versionRefreshed");refresh();}}).catch(error=>{if(!closed){status.textContent=ui.text("versionSyncFailed");context.report(error);}}).finally(()=>{busy=false;if(!closed)update();});});sync.hidden=!catalog.syncVersions;
 function update(){const state=catalog!.versionsState?.();save.disabled=busy||!name.input.value.trim();retry.hidden=!(failed||state?.status==="local-save-failed");retry.disabled=busy;sync.disabled=busy;compare.disabled=busy||!select.value;prepare.disabled=compare.disabled||context.core.view().readOnly===true;apply.disabled=busy||!plan||context.core.view().readOnly===true;
  if(state){const selected=select.value?catalog!.versionStatus?.(select.value):undefined,sentence=(first:string,second:string)=>ui.text("panelSentences",{first,second});
   let text=ui.text("versionShared",{status:syncStateText(ui,state.status),queued:state.queued,entries:state.catalogEntries});if(state.waitingForDocument)text=sentence(text,ui.text("syncWaiting"));
   if(selected)text=sentence(text,ui.text("versionSelected",{cache:ui.text(selected.cached?(selected.localSaved?"versionCacheSaved":"versionCacheUnconfirmed"):"versionCacheMissing"),acceptance:selected.accepted?ui.text("versionAccepted",{sequence:selected.accepted.sequence}):ui.text(selected.queued?"versionQueued":"versionLocalDraft")}));
   sharedStatus.textContent=text;}else sharedStatus.textContent="";
 }
 async function saving(retrying:boolean){if(busy||closed)return;busy=true;failed=false;const captured=name.input.value;status.textContent=ui.text("versionSaving");update();try{if(retrying)await catalog!.retry();else{catalog!.saveVersion(captured,(context.options.nowMs??(()=>Date.now().toString()))());await catalog!.flush();}if(!closed){if(!retrying&&name.input.value===captured)name.input.value="";context.run(()=>{});status.textContent=ui.text(catalog!.versionsState?"versionSavedRemote":"versionSavedLocal");refresh();}}catch(error){if(!closed){failed=true;status.textContent=ui.text("versionSaveFailed");context.report(error);}}finally{busy=false;if(!closed)update();}}
 function refresh(){const value=select.value;select.replaceChildren();for(const info of catalog!.versions()){const option=d.createElement("option");option.value=info.id;option.textContent=ui.text("versionOption",{name:info.name,author:info.author});select.append(option);}if([...select.options].some(o=>o.value===value))select.value=value;
  if(plan&&planRevision!==context.core.view().revision){disposePlan();preview.textContent=ui.text("versionSourceChanged");}update();}
 select.onchange=()=>{choice++;disposePlan();preview.textContent="";update();};name.input.oninput=update;element.append(heading,name.label,save,retry,sync,selectionLabel,compare,prepare,apply,preview,status,sharedStatus);refresh();const unsubscribe=catalog.subscribeVersions?.(()=>{if(!closed)refresh();});
 return {element,refresh,dispose(){closed=true;unsubscribe?.();disposePlan();}};
}
