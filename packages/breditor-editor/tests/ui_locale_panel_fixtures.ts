/**
 * Deterministic panel scenarios for the chrome catalog contract. Each scenario mounts one opt-in panel on a fake
 * borrowed host, drives it through its user-visible states and returns the panel markup after every step. The
 * English run is pinned byte for byte (ui_locale_panels_baseline.test.ts); the Arabic run checks the catalog.
 */
import {vi} from "vitest";
import {mountRichSearchPanel} from "../../breditor-experimental-rich-content/src/search_panel.js";
import {mountRichWritingTools} from "../../breditor-experimental-rich-content/src/writing_tools_panel.js";
import {createRichFullscreen} from "../../breditor-experimental-rich-content/src/fullscreen_controller.js";
import {mountRichFullscreenControls} from "../../breditor-experimental-rich-content/src/fullscreen_controls.js";
import type {RichUiLocale} from "../../breditor-experimental-rich-content/src/ui_locale.js";
import {mountSharedReviewPanel} from "../../breditor-collaboration/src/review_panel/mount.js";
import type {SharedReviewPanelCore} from "../../breditor-collaboration/src/review_panel/types.js";
import {mountSharedSuggestionPanel} from "../../breditor-collaboration/src/suggestion_panel/mount.js";
import type {SharedSuggestionPanelCore,SharedSuggestionPanelSource,SharedSuggestionPanelEntry} from "../../breditor-collaboration/src/suggestion_panel/types.js";
import type {SharedDocumentSuggestionPreview} from "../../breditor-collaboration/src/suggestion_preview.js";
import type {SharedEditorView,SharedSelectionPolicy} from "../../breditor-collaboration/src/types.js";

export async function settle(){for(let n=0;n<20;n++)await Promise.resolve();}
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
/** A native refusal as the rich owner surfaces it: a stable code with a fixed English message. */
export const refusal=(code:string)=>Object.assign(Error("the rich editor request was rejected"),{code});
const buttonBy=(root:ParentNode,attribute:string,name:string)=>root.querySelector<HTMLButtonElement>(`[${attribute}="${name}"]`)!;
const nth=(root:ParentNode,index:number)=>[...root.querySelectorAll<HTMLButtonElement>("button")][index]!;

export async function searchScenario(ui?:RichUiLocale):Promise<string[]> {
 const surface=document.createElement("div"),root=document.createElement("div");document.body.append(surface,root);
 const state={revision:"1",closed:false,busy:false,composing:false,available:true,readOnly:false,canReplace:true},listeners=new Set<()=>void>();
 const results=(count:string)=>({metadata:()=>({count}),navigate:(active:string|null,direction:string)=>{const n=Number(count);if(!n)return null;const a=active===null?-1:Number(active);return String(direction==="previous"?(a<=0?n-1:a-1):(a+1)%n);},dispose:vi.fn()});
 let select=deferred();
 const host={surface,searchState:()=>({...state}),subscribeSearch:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
  findText:(query:{pattern:string})=>{if(query.pattern==="(")throw refusal("breditor_rich.search_query");return results(String(query.pattern.length));},
  checkSearchResults:()=>{},selectSearchMatch:vi.fn(()=>select.promise),replaceSearchOne:vi.fn(async()=>{}),replaceSearchAll:vi.fn(async()=>{}),focus:()=>{},
  ...(ui?{uiLocale:()=>ui}:{})};
 const out:string[]=[],capture=()=>out.push(root.innerHTML);
 const panel=mountRichSearchPanel(root,host as never,{initialQuery:{pattern:"abc",mode:"literal",caseSensitive:false,wholeWords:false},decorations:false,debounceMs:0});
 capture();
 const moving=panel.next();capture();select.resolve();await moving;capture();
 state.readOnly=true;state.canReplace=false;panel.refresh();capture();
 state.readOnly=false;panel.refresh();capture();
 state.composing=true;panel.refresh();capture();state.composing=false;
 const element=root.firstElementChild!;element.dispatchEvent(new Event("compositionstart"));capture();element.dispatchEvent(new Event("compositionend"));capture();
 state.busy=true;await panel.next().catch(()=>{});capture();state.busy=false;
 await panel.replaceOne().catch(()=>{});capture();state.canReplace=true;
 const pattern=root.querySelector<HTMLInputElement>('[data-search-field="pattern"]')!;pattern.value="(";pattern.dispatchEvent(new Event("change",{bubbles:true}));capture();
 pattern.value="";pattern.dispatchEvent(new Event("change",{bubbles:true}));capture();
 select=deferred();pattern.value="ab";pattern.dispatchEvent(new Event("change",{bubbles:true}));
 const keyed=new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true});pattern.dispatchEvent(keyed);await settle();capture();select.resolve();await settle();capture();
 state.closed=true;panel.refresh();capture();
 panel.dispose();return out;
}

export async function writingScenario(ui?:RichUiLocale):Promise<string[]> {
 const surface=document.createElement("div"),root=document.createElement("div");document.body.append(surface,root);
 const state={revision:"4",closed:false,busy:false,composing:false,available:true,readOnly:false},listeners=new Set<()=>void>();let fail=false,select=deferred();
 const outline=[{block:"h1",level:1,label:"Introduction",labelTruncated:false},{block:"h2",level:2,label:"",labelTruncated:false},{block:"h3",level:2,label:"",labelTruncated:true},{block:"h4",level:3,label:"Long heading",labelTruncated:true}];
 const read=()=>Object.freeze({revision:state.revision,schema:Object.freeze({name:"fixture",version:1}),counts:Object.freeze({words:"12",graphemes:"80",unicodeScalars:"81",utf16Units:"82",utf8Bytes:"90",textBlocks:"5"}),outline:Object.freeze(outline.map(entry=>Object.freeze({...entry})))});
 const host={surface,writingState:()=>({...state}),subscribeWriting:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
  readWritingTools:()=>{if(fail)throw refusal("breditor_rich.writing_tools_read");return read();},selectWritingHeading:vi.fn(()=>select.promise),...(ui?{uiLocale:()=>ui}:{})};
 const out:string[]=[],capture=()=>out.push(root.innerHTML);
 const panel=mountRichWritingTools(root,host as never,{pageSize:2,debounceMs:0});capture();
 panel.setPage(1);capture();panel.setPage(0);
 state.readOnly=true;panel.refresh();capture();state.readOnly=false;
 const choosing=panel.selectHeading(0);capture();select.resolve();await choosing;capture();
 await panel.selectHeading(0,"stale").catch(()=>{});capture();panel.refresh();
 state.composing=true;panel.refresh();capture();state.composing=false;
 for(const listener of listeners)listener();capture();panel.refresh();
 fail=true;panel.refresh();capture();fail=false;panel.refresh();capture();
 state.closed=true;panel.refresh();capture();
 panel.dispose();return out;
}

export async function fullscreenScenario(ui?:RichUiLocale):Promise<string[]> {
 const target=document.createElement("div"),surface=document.createElement("div"),root=document.createElement("div");target.append(surface,root);document.body.append(target);
 const state={revision:"1",closed:false,busy:false,composing:false},listeners=new Set<()=>void>();let current:Element|null=null,enabled=false;
 Object.defineProperty(document,"fullscreenEnabled",{configurable:true,get:()=>enabled});
 Object.defineProperty(document,"fullscreenElement",{configurable:true,get:()=>current});
 const change=()=>document.dispatchEvent(new Event("fullscreenchange"));
 (document as unknown as {exitFullscreen:()=>Promise<void>}).exitFullscreen=async()=>{current=null;change();};
 (target as unknown as {requestFullscreen:()=>Promise<void>}).requestFullscreen=async()=>{current=target;change();};
 const host={surface,fullscreenRoot:surface,fullscreenState:()=>({...state}),subscribeFullscreen:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},focusFullscreen:()=>{},...(ui?{uiLocale:()=>ui}:{})};
 const out:string[]=[],capture=()=>out.push(root.innerHTML);
 const controller=createRichFullscreen(host as never,{target}),controls=mountRichFullscreenControls(root,controller);
 try{
  capture();
  await controller.enter().catch(()=>{});capture();
  enabled=true;await controller.enter();capture();
  await controller.exit();capture();
  state.composing=true;controls.refresh();capture();state.composing=false;
  await controller.enter("stale").catch(()=>{});capture();
  const first=controller.enter();await controller.enter().catch(()=>{});capture();await first;await controller.exit();
  current=document.createElement("div");change();capture();
  await controller.exit().catch(()=>{});capture();
  await controller.enter().catch(()=>{});capture();current=null;change();
  await controller.enter();capture();
 }finally{controls.dispose();await controller.dispose().catch(()=>{});delete (document as unknown as Record<string,unknown>)["fullscreenEnabled"];delete (document as unknown as Record<string,unknown>)["fullscreenElement"];}
 return out;
}

const id=(actor:string,counter:string)=>({actor,counter});
export async function reviewScenario(ui?:RichUiLocale):Promise<string[]> {
 const host=document.createElement("main");document.body.append(host);
 const owner={},snapshot={owner,documentRevision:"1",reviewRevision:"1",view:{undoDepth:1,redoDepth:0,threads:[
  {thread:{id:id("a","1"),author:"alice",anchors:["x"],state:"open",hidden:false,messages:[{id:id("a","2"),author:"alice",versions:[{event:id("a","2"),principal:"alice",text:"First comment"}]}]},targets:[{packet:"q1",resolution:{kind:"resolved",target:{kind:"document"}}}]},
  {thread:{id:id("b","1"),author:"bob",anchors:["y","z"],state:"conflicted",hidden:true,messages:[{id:id("b","2"),author:"bob",versions:[{event:id("b","2"),principal:"bob",text:"Left"},{event:id("c","2"),principal:"carol",text:null}]},{id:id("b","3"),author:"bob",versions:[]}]},
   targets:[{packet:"q2",resolution:{kind:"orphaned",reason:"target_deleted"}},{packet:"q3",resolution:{kind:"pending"}},{packet:"q4",resolution:{kind:"resolved",target:{kind:"document"}}},{packet:"q5",resolution:{kind:"orphaned",reason:"range_collapsed"}}]},
  {thread:{id:id("d","1"),author:"dan",anchors:["w"],state:"resolved",hidden:false,messages:[]},targets:[{packet:"q6",resolution:{kind:"orphaned",reason:"hidden_table"}},{packet:"q7",resolution:{kind:"orphaned",reason:"target_kind_changed"}}]},
 ]}};
 const quotes:Record<string,unknown>={q1:{kind:"quoted",plainText:"Quoted text"},q2:{kind:"quoted",plainText:""},q3:{kind:"document"},q4:{kind:"pending"},q5:{kind:"unavailable",reason:"too_large"},q6:{kind:"document"},q7:{kind:"pending"}};
 let selection:unknown={kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"2",affinity:"after"}},targetNull=false,versionsState:Record<string,unknown>|undefined={status:"ready",canPublish:true,queued:1,catalogEntries:2,cachedPackets:1,localPending:false,waitingForDocument:true,error:null};
 const listeners=new Set<()=>void>(),plan={version:()=>({id:"v1"}),comparison:()=>({changed:1}),documentJson:()=>JSON.stringify({root:"r"}),dispose:vi.fn()};
 const core={view:()=>({revision:"1",selection,readOnly:false}),reviewSnapshot:()=>({...snapshot}),subscribeReview:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
  captureReviewAnchor:()=>"anchor",dispatchReview:vi.fn(),undoReview:vi.fn(),redoReview:vi.fn(),compareVersion:()=>({kind:"comparison",changes:2}),prepareVersionRestore:()=>plan,applyVersionRestore:vi.fn(),
  supportsReviewQuotes:()=>true,readReviewQuote:(packet:string)=>quotes[packet]} as unknown as SharedReviewPanelCore;
 let saveFails=false,loadFails=false;
 const versions={versions:()=>[{id:"v1",name:"Draft one",author:"alice",createdAtMs:"1"},{id:"v2",name:"Draft two",author:"bob",createdAtMs:"2"}],versionPacket:()=>"packet",
  saveVersion:vi.fn(()=>{if(saveFails)throw refusal("version_save_failed");return {id:"v3",name:"n",author:"alice",createdAtMs:"3"};}),flush:vi.fn(async()=>{}),retry:vi.fn(async()=>{}),
  loadVersion:vi.fn(async()=>{if(loadFails)throw refusal("version_unavailable");return "packet";}),versionsState:()=>versionsState,
  versionStatus:(version:string)=>version==="v1"?{cached:true,localSaved:true,queued:false,accepted:{sequence:"5",version:{id:"v1"}}}:{cached:false,localSaved:false,queued:true,accepted:null},
  syncVersions:vi.fn(async()=>{})};
 const out:string[]=[],capture=()=>out.push(host.innerHTML);
 const panel=mountSharedReviewPanel(host,core,{policy:()=>({principal:"alice",access:"moderate"}),target:()=>targetNull?null:selection===null?null:{kind:"selection",selection} as never,versions:versions as never,allocatePrefix:()=>"prefix",nowMs:()=>"7",...(ui?{ui}:{})} as never);
 const button=(text:string)=>[...host.querySelectorAll("button")].find(b=>b.textContent===text);
 const at=(index:number)=>nth(panel.element,index);
 capture();
 at(1).click();capture();
 const compose=panel.element.querySelector("textarea")!;compose.value="New remark";compose.dispatchEvent(new Event("input"));at(2).click();capture();
 at(0).click();capture();
 snapshot.reviewRevision="2";panel.refresh();capture();
 targetNull=true;at(0).click();capture();targetNull=false;panel.refresh();
 const threads=panel.element.querySelectorAll("article");
 for(const thread of threads)nth(thread,0).click();capture();
 targetNull=true;nth(threads[0]!,3).click();targetNull=false;capture();
 const message=threads[0]!.querySelectorAll<HTMLElement>(":scope > div > section")[0]!;
 nth(message,0).click();capture();snapshot.reviewRevision="3";panel.refresh();capture();
 const versionSection=[...panel.element.querySelectorAll("section")].find(section=>section.querySelector("select"))!,name=versionSection.querySelector("textarea")!;
 name.value="Milestone";name.dispatchEvent(new Event("input"));nth(versionSection,0).click();await settle();capture();
 nth(versionSection,3).click();await settle();capture();
 nth(versionSection,4).click();await settle();capture();
 nth(versionSection,5).click();await settle();capture();
 loadFails=true;nth(versionSection,3).click();await settle();capture();loadFails=false;
 const select=versionSection.querySelector("select")!;select.value="v2";select.dispatchEvent(new Event("change"));capture();
 nth(versionSection,2).click();await settle();capture();
 name.value="Broken";name.dispatchEvent(new Event("input"));saveFails=true;nth(versionSection,0).click();await settle();capture();saveFails=false;
 versionsState=undefined;delete (versions as Partial<typeof versions>).versionsState;nth(versionSection,1).click();await settle();capture();
 name.value="Local";name.dispatchEvent(new Event("input"));nth(versionSection,0).click();await settle();capture();
 nth(versionSection,4).click();await settle();snapshot.view={...snapshot.view};(core as unknown as {view:()=>unknown}).view=()=>({revision:"2",selection,readOnly:false});panel.refresh();capture();
 void button;panel.dispose();return out;
}

const digest=(n:number)=>`sha256:${String(n).padStart(64,"0")}`;
export async function suggestionScenario(ui?:RichUiLocale):Promise<string[]> {
 const host=document.createElement("main");document.body.append(host);
 const root={kind:"element",type:"breditor/document",properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"p"},children:[{kind:"text",text:"abc🙂",formats:[]}]}]};
 const view={format:"breditor/shared-rich-view",formatVersion:1,revision:"1",causalVersion:"1",documentJson:JSON.stringify({schema:{name:"fixture",version:1},schemaFingerprint:digest(1),root}),selection:{kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"1",affinity:"after"}},pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as SharedEditorView<SharedSelectionPolicy>;
 const rows:SharedSuggestionPanelEntry[]=[],listeners=new Set<()=>void>(),coreListeners=new Set<()=>void>();let count=0,failed=false,prepare:"ready"|"pending"|"conflict"="ready";
 const core={view:()=>structuredClone(view),subscribe:(listener:()=>void)=>{coreListeners.add(listener);return()=>coreListeners.delete(listener);},supportsDocumentSuggestions:()=>true,
  prepareSuggestion:vi.fn((packet:string)=>{const id=JSON.parse(packet).id;if(prepare!=="ready")return {kind:prepare,...(prepare==="pending"?{missing:[]}:{reason:{kind:"changed"}})};return {kind:"ready",preview:{id,summary:()=>({kind:"ready",suggestion:{id},changes:[]}),documentJson:()=>JSON.stringify({root:"proposed"}),dispose:vi.fn()} as unknown as SharedDocumentSuggestionPreview};}),
  checkSuggestionPreview:vi.fn()} as SharedSuggestionPanelCore;
 const emit=()=>{for(const listener of [...listeners])listener();};
 let rebaseFormat:unknown={kind:"queued"},rebaseText:unknown={kind:"queued"};
 const revisionRow=(previous:string,title:string,state:"queued"|"conflict",winning:string|null=null)=>{const suggestion={id:digest(++count),title,author:"alice",createdAtMs:"1"};rows.push({suggestion,publication:null,decision:null,local:{localSaved:true,publish:true,publication:null,intent:null,decision:null},revision:{id:digest(100+count),previousSuggestionId:previous,rootSuggestionId:null,state,canDecide:false,winningSuccessor:winning}} as SharedSuggestionPanelEntry);emit();return suggestion;};
 const source={core,check:vi.fn(),entries:()=>structuredClone(rows),packet:(id:string)=>JSON.stringify({id}),
  propose:vi.fn((title:string)=>{const suggestion={id:digest(++count),title,author:"alice",createdAtMs:"1"};rows.push({suggestion,publication:null,decision:null,local:{localSaved:true,publish:true,publication:null,intent:null,decision:null}} as SharedSuggestionPanelEntry);emit();return suggestion;}),
  queueDecision:vi.fn((id:string,requested:"accept"|"reject")=>{const row=rows.find(row=>row.suggestion.id===id)!;row.local!.intent={requested,retry:true,queuedAtMs:"1"};emit();return true;}),
  stopDecision:vi.fn((id:string)=>{rows.find(row=>row.suggestion.id===id)!.local!.intent!.retry=false;emit();}),stopPublication:vi.fn((id:string)=>{rows.find(row=>row.suggestion.id===id)!.local!.publish=false;emit();}),
  resumePublication:vi.fn((id:string)=>{rows.find(row=>row.suggestion.id===id)!.local!.publish=true;emit();}),flush:vi.fn(async()=>{if(failed)throw refusal("local_save_failed");}),retry:vi.fn(async()=>{failed=false;}),
  state:()=>({failed,closed:false,retiring:false}),subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
  syncState:()=>({status:"pending",permissions:{canPropose:true,canAccept:true,canReject:true},discovered:3,publications:2,decisions:1,waitingForDocument:true,conflicts:[{suggestionId:"s-1",targets:[]},{suggestionId:"s-2",targets:[]}],error:null}),
  sync:vi.fn(async()=>{}),load:vi.fn(async(id:string)=>JSON.stringify({id})),canRevise:()=>true,
  revise:vi.fn((previous:string,title:string)=>revisionRow(previous,title,"queued")),
  rebaseFormat:vi.fn((previous:string,title:string)=>{if((rebaseFormat as {kind:string}).kind==="queued")return {kind:"queued",revision:{suggestion:revisionRow(previous,title,"queued")}};return rebaseFormat;}),
  rebaseText:vi.fn((previous:string,title:string)=>{if((rebaseText as {kind:string}).kind==="queued")return {kind:"queued",revision:{suggestion:revisionRow(previous,title,"queued")}};return rebaseText;}),
  revisionState:()=>({status:"ready",pending:2,error:"relay paused"})} satisfies SharedSuggestionPanelSource;
 const out:string[]=[],capture=()=>out.push(host.innerHTML);
 let rights={canPropose:true,canAccept:true,canReject:true};
 const panel=mountSharedSuggestionPanel(host,core,{source,policy:()=>rights,allocate:(kind:string)=>`fresh-${kind}`,nowMs:()=>"9",...(ui?{ui}:{})} as never);
 const element=panel.element,buttons=()=>[...element.querySelectorAll<HTMLButtonElement>("button")],at=(index:number)=>buttons()[index]!;
 const selects=()=>[...element.querySelectorAll("select")],textareas=()=>[...element.querySelectorAll("textarea")];
 const setValue=(field:HTMLTextAreaElement|HTMLSelectElement,value:string)=>{field.value=value;field.dispatchEvent(new Event(field.tagName==="SELECT"?"change":"input"));};
 // Buttons in DOM order: 0 create, 1 revise, 2 rebase format, 3 rebase text (fieldset), 4 retry, 5 sync, 6 load, 7 preview, 8 accept, 9 reject, 10 stop, 11 stop publish, 12 resume.
 capture();
 for(const action of selects()[0]!.options){setValue(selects()[0]!,action.value);capture();}
 setValue(selects()[0]!,"replace-text");
 setValue(textareas()[0]!,"Fix typo");setValue(textareas()[1]!,"abd");at(0).click();await settle();capture();
 at(7).click();await settle();capture();
 at(8).click();await settle();capture();
 at(10).click();await settle();capture();at(11).click();await settle();capture();at(12).click();await settle();capture();
 prepare="pending";at(7).click();await settle();capture();prepare="conflict";at(7).click();await settle();capture();prepare="ready";
 at(1).click();await settle();capture();
 const first=rows[0]!.suggestion.id;
 for(const result of [{kind:"queued"},{kind:"pending",missing:[]},{kind:"unsupported"},{kind:"conflict",reason:{kind:"changed"}}]){rebaseFormat=result;setValue(selects()[2]!,first);at(2).click();await settle();capture();}
 const policy=element.querySelector("fieldset select") as HTMLSelectElement;
 for(const result of [{kind:"queued"},{kind:"pending",missing:[]},{kind:"unsupported"},{kind:"conflict",reason:{kind:"intervening_text"}},{kind:"conflict",reason:{kind:"formatting_changed"}}]){rebaseText=result;setValue(selects()[2]!,first);setValue(policy,"preserve_intervening_text");at(3).click();await settle();capture();}
 rows[0]!.decision={sequence:"8",suggestionId:first,principal:"bob",decision:"accept",acceptingWriter:"writer-1"} as never;rows[0]!.local!.intent={requested:"reject",retry:false,queuedAtMs:"1"};rows[0]!.publication={sequence:"4"} as never;rows[0]!.supersededBy="next-id";emit();setValue(selects()[2]!,first);capture();
 rows[0]!.local!.decision={sequence:"8"} as never;rows[0]!.local!.localSaved=false;emit();capture();rows[0]!.local!.localSaved=true;emit();capture();
 const remote=structuredClone(rows[0]!);remote.suggestion={...remote.suggestion,id:digest(500),title:"Remote"};remote.local=null;remote.decision={...remote.decision!,decision:"reject",acceptingWriter:undefined} as never;delete remote.supersededBy;rows.push(remote);emit();setValue(selects()[2]!,digest(500));capture();
 rows[0]!.decision={sequence:"9",suggestionId:first,principal:"bob",decision:"accept"} as never;emit();setValue(selects()[2]!,first);capture();
 revisionRow(first,"Lost revision","conflict","winner-id");setValue(selects()[2]!,rows.at(-1)!.suggestion.id);capture();
 revisionRow(first,"Lost again","conflict");setValue(selects()[2]!,rows.at(-1)!.suggestion.id);capture();
 rows.push({suggestion:{id:digest(600),title:"Unsaved",author:"eve",createdAtMs:"1"},publication:null,decision:null,local:{localSaved:false,publish:false,publication:null,intent:{requested:"accept",retry:true,queuedAtMs:"1"},decision:null}} as SharedSuggestionPanelEntry);emit();setValue(selects()[2]!,digest(600));capture();
 rows.push({suggestion:{id:digest(700),title:"Unloaded",author:"zoe",createdAtMs:"1"},publication:null,decision:null,local:null} as SharedSuggestionPanelEntry);emit();setValue(selects()[2]!,digest(700));capture();
 at(6).click();await settle();capture();
 rights={canPropose:false,canAccept:false,canReject:false};setValue(selects()[2]!,first);rows[0]!.decision=null;rows[0]!.local!.decision=null;emit();
 (at(0) as HTMLButtonElement).disabled=false;at(0).click();await settle();capture();
 rights={canPropose:true,canAccept:true,canReject:true};
 setValue(selects()[0]!,"format-text");failed=true;at(0).click();await settle();capture();at(4).click();await settle();capture();
 at(5).click();await settle();capture();
 panel.dispose();return out;
}
