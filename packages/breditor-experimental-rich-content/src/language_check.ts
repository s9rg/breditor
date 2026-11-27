/**
 * Opt-in spelling/grammar review (docs/AI_AND_LANGUAGE_TOOLS.md). A host provider receives only explicitly scoped
 * plain text and returns untrusted issues. Issues are validated, painted outside the editable DOM, navigable from a
 * keyboard list, and a suggestion is applied as one ordinary guarded replace command. Issues whose block text no
 * longer matches are dropped; the only remapping is the exact shift after this tool's own verified replacement.
 */
import {createRichStyleElement} from "./style_element.js";
import type {RichCommandOutcome} from "./core.js";
import {defaultRichUi,type RichUiLocale,type RichUiStringKey} from "./ui_locale.js";
import {RICH_AI_MAX_BYTES,RICH_AI_MAX_TIMEOUT_MS,RichAiAbortError,RichAiScopeError,admitAiText,boundedOption,plainRecord,readAiDocument,resolveAiTarget,runAiProvider,scalarBoundary,utf8Bytes,type RichAiScope,type RichAiSegment,type RichAiToolsHost,type RichTextSelection} from "./ai_tools_host.js";
import {RichAiHighlightOverlay} from "./language_overlay.js";

export type RichLanguageIssueKind="spelling"|"grammar"|"style";
/** Untrusted provider issue. Offsets are UTF-16 code units in the block's text, inside a requested segment. */
export interface RichLanguageIssue {
 readonly range:Readonly<{block:string;start:number;end:number}>;
 readonly message:string;readonly suggestions:readonly string[];readonly kind?:RichLanguageIssueKind;
}
export interface RichLanguageProviderRequest {
 readonly kind:"language";readonly scope:RichAiScope;readonly segments:readonly RichAiSegment[];
 /** Opaque revision of the snapshot (informational; it is not an edit credential). */
 readonly revision:string;readonly signal:AbortSignal;
}
export type RichLanguageProvider=(request:RichLanguageProviderRequest)=>readonly RichLanguageIssue[]|Promise<readonly RichLanguageIssue[]>;
/** An admitted issue, still bound to the block text it was found in. */
export interface RichLanguageIssueView {
 readonly key:string;readonly block:string;readonly start:number;readonly end:number;readonly text:string;
 readonly message:string;readonly suggestions:readonly string[];readonly kind:RichLanguageIssueKind|null;
}
export interface RichLanguageCheckRequest {readonly scope:RichAiScope;readonly block?:string}
export interface RichLanguageCheckOptions {
 provider?:RichLanguageProvider;
 /** Scopes offered by the form, in order (default document, block, selection). */
 scopes?:readonly RichAiScope[];
 /** UTF-8 bytes of scoped text sent (default 256 KiB, at most 1 MiB). */
 maxInputBytes?:number;
 /** Issues admitted per check (default 500, at most 5000); suggestions per issue (default 8, at most 32). */
 maxIssues?:number;maxSuggestions?:number;
 timeoutMs?:number;
 /** Paint highlights over the editor (default true). */
 decorations?:boolean;
 /** Select an activated issue's range in the editor (a selection-only publication; default true). */
 reveal?:boolean;
 label?:string;
 onApply?:(outcome:RichCommandOutcome|"queued",issue:RichLanguageIssueView)=>void;
 onError?:(error:unknown)=>void;
}
export type RichLanguagePhase="idle"|"pending"|"ready"|"cancelled"|"failed";
export interface RichLanguageCheckState {
 readonly phase:RichLanguagePhase;readonly disposed:boolean;readonly issues:readonly RichLanguageIssueView[];
 readonly active:string|null;readonly error:string|null;readonly ignoredMalformed:number;
}
export interface RichLanguageCheck {
 /** Snapshot the scope and ask the provider. Resolves the admitted issues, or null when cancelled/failed. */
 check(request?:RichLanguageCheckRequest,provider?:RichLanguageProvider):Promise<readonly RichLanguageIssueView[]|null>;
 issues():readonly RichLanguageIssueView[];
 /** Make an issue active (highlight and optionally reveal it in the editor). */
 select(key:string):void;
 /** Replace the issue's range with one of its suggestions as one guarded command. */
 applySuggestion(key:string,index:number):RichCommandOutcome|"queued";
 ignore(key:string):void;
 clear():void;
 cancel():void;
 state():RichLanguageCheckState;
 dispose():void;
}
interface Issue extends RichLanguageIssueView {readonly blockText:string}
/** Exact expectation after this tool's own replacement; other issues in the block shift only if it holds. */
interface Remap {readonly block:string;readonly start:number;readonly end:number;readonly inserted:number;readonly expected:string;readonly before:string}
const hosts=new WeakSet<HTMLElement>();
class LanguageCheck implements RichLanguageCheck {
 readonly #root:HTMLElement;readonly #host:RichAiToolsHost;readonly #options:RichLanguageCheckOptions;readonly #ui:RichUiLocale;readonly #window:Window;readonly #abort:AbortController;readonly #unsubscribe:()=>void;
 readonly #maxInput:number;readonly #maxIssues:number;readonly #maxSuggestions:number;readonly #timeout:number;readonly #scopes:readonly RichAiScope[];
 readonly #element:HTMLElement;readonly #scope:HTMLSelectElement|undefined;readonly #check:HTMLButtonElement|undefined;readonly #stop:HTMLButtonElement;readonly #list:HTMLUListElement;readonly #status:HTMLParagraphElement;
 readonly #overlay:RichAiHighlightOverlay|undefined;
 #phase:RichLanguagePhase="idle";#disposed=false;#error:string|null=null;#message:string|null=null;#issues:Issue[]=[];#active:string|null=null;#keys=0;#generation=0;#pending:AbortController|undefined;
 #provider:RichLanguageProvider|undefined;#seen:string|undefined;#remap:Remap|undefined;#scheduled=false;#ignored=0;
 constructor(root:HTMLElement,host:RichAiToolsHost,options:RichLanguageCheckOptions){
  if(hosts.has(root)||root===host.surface||root.contains(host.surface)||host.surface.contains(root)||root.ownerDocument!==host.surface.ownerDocument)throw Error("Language check requires an unused separate host outside the editing surface");
  if(host.aiState().closed)throw Error("Use an open editor");
  if(options.provider!==undefined&&typeof options.provider!=="function")throw new TypeError("Expected a provider function");
  if(options.label!==undefined&&(typeof options.label!=="string"||!options.label||options.label.length>256))throw new TypeError("Expected a bounded label");
  for(const flag of [options.decorations,options.reveal])if(flag!==undefined&&typeof flag!=="boolean")throw new TypeError("Expected Boolean presentation options");
  const scopes=options.scopes??["document","block","selection"];
  if(!Array.isArray(scopes)||!scopes.length||scopes.length>3||new Set(scopes).size!==scopes.length||scopes.some(s=>s!=="selection"&&s!=="block"&&s!=="document"))throw new TypeError("Expected language-check scopes selection, block and/or document");
  this.#maxInput=boundedOption(options.maxInputBytes,256*1024,RICH_AI_MAX_BYTES,"maxInputBytes");this.#maxIssues=boundedOption(options.maxIssues,500,5000,"maxIssues");
  this.#maxSuggestions=boundedOption(options.maxSuggestions,8,32,"maxSuggestions",0);this.#timeout=boundedOption(options.timeoutMs,60_000,RICH_AI_MAX_TIMEOUT_MS,"timeoutMs",0);this.#scopes=Object.freeze([...scopes]);
  this.#root=root;this.#host=host;this.#options={...options};this.#ui=host.uiLocale?.()??defaultRichUi;this.#provider=options.provider;
  const d=root.ownerDocument,window=d.defaultView;if(!window)throw Error("Language check requires a live document");this.#window=window;
  const realm=window as unknown as {AbortController:typeof AbortController},signal=(this.#abort=new realm.AbortController()).signal,ui=this.#ui,label=options.label??ui.text("langPanelLabel");
  this.#element=d.createElement("section");this.#element.dataset["breditorLanguage"]="";this.#element.setAttribute("aria-label",label);ui.applyChrome(this.#element);
  const style=createRichStyleElement(d,styles);const title=d.createElement("h2");title.textContent=label;
  const controls=d.createElement("div");controls.dataset["languageControls"]="";
  const button=(name:string,key:RichUiStringKey,run:()=>void,parent:HTMLElement)=>{const node=d.createElement("button");node.type="button";node.dataset["languageAction"]=name;node.textContent=ui.text(key);node.addEventListener("click",()=>run(),{signal});parent.append(node);return node;};
  if(options.provider){
   const scopeLabel=d.createElement("label");this.#scope=d.createElement("select");this.#scope.dataset["languageField"]="scope";
   for(const scope of this.#scopes){const option=d.createElement("option");option.value=scope;option.textContent=ui.text(scope==="selection"?"aiScopeSelection":scope==="block"?"aiScopeBlock":"aiScopeDocument");this.#scope.append(option);}
   scopeLabel.append(ui.text("aiScopeLabel"),this.#scope);controls.append(scopeLabel);
   this.#check=button("check","langCheck",()=>{void this.check({scope:this.#scope!.value as RichAiScope}).catch(()=>{/* Reported in status. */});},controls);
  }
  this.#stop=button("stop","aiStop",()=>this.cancel(),controls);
  this.#status=d.createElement("p");this.#status.dataset["languageStatus"]="";this.#status.setAttribute("role","status");this.#status.setAttribute("aria-live","polite");
  this.#list=d.createElement("ul");this.#list.dataset["languageIssues"]="";this.#list.setAttribute("aria-label",ui.text("langIssuesLabel"));
  this.#list.addEventListener("keydown",event=>this.#key(event),{signal});
  this.#element.append(style,title,controls,this.#status,this.#list);
  let unsubscribe:(()=>void)|undefined,overlay:RichAiHighlightOverlay|undefined;
  try{unsubscribe=host.subscribeAi(()=>this.#schedule());overlay=options.decorations===false?undefined:new RichAiHighlightOverlay(host.surface,()=>host.aiState());this.#unsubscribe=unsubscribe;this.#overlay=overlay;hosts.add(root);root.replaceChildren(this.#element);this.#render(false);}
  catch(error){unsubscribe?.();overlay?.dispose();this.#abort.abort();hosts.delete(root);throw error;}
 }
 #live():void{if(this.#disposed)throw Error("Language check is disposed");}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Reporting cannot rewind a native publication. */}}
 #schedule():void{if(this.#disposed||this.#scheduled)return;this.#scheduled=true;queueMicrotask(()=>{this.#scheduled=false;this.#published();});}
 /** Keep issues whose block text is unchanged; apply the one exact remap of this tool's own replacement. */
 #published():void{
  if(this.#disposed)return;
  if(this.#issues.length){
   let view;try{view=this.#host.aiView();}catch{view=undefined;}
   if(!view||this.#host.aiState().closed){this.#issues=[];this.#active=null;}
   else if(view.documentJson!==this.#seen){
    this.#seen=view.documentJson;const texts=readAiDocument(view.documentJson).texts,remap=this.#remap;this.#remap=undefined;const before=this.#issues.length;
    this.#issues=this.#issues.flatMap(issue=>{
     const current=texts.get(issue.block);if(current===issue.blockText)return[issue];
     if(remap&&remap.block===issue.block&&issue.blockText===remap.before&&current===remap.expected){
      if(issue.end<=remap.start)return[{...issue,blockText:current}];
      if(issue.start>=remap.end){const delta=remap.inserted-(remap.end-remap.start);return[{...issue,start:issue.start+delta,end:issue.end+delta,blockText:current}];}
     }
     return[];
    });
    const dropped=before-this.#issues.length;if(this.#active!==null&&!this.#issues.some(issue=>issue.key===this.#active))this.#active=this.#issues[0]?.key??null;
    if(dropped>0)this.#message=this.#ui.text("langStale",{count:dropped});
   }
  }
  this.#render(true);
 }
 async check(request:RichLanguageCheckRequest={scope:this.#scopes[0]!},provider:RichLanguageProvider|undefined=this.#provider):Promise<readonly RichLanguageIssueView[]|null>{
  this.#live();if(typeof provider!=="function")throw new TypeError("Supply a language provider function");
  const record=plainRecord(request);
  if(!record||Object.keys(record).some(key=>key!=="scope"&&key!=="block")||!this.#scopes.includes(record["scope"] as RichAiScope)||record["block"]!==undefined&&(typeof record["block"]!=="string"||!record["block"]))throw new TypeError("Expected an explicit language-check scope");
  this.#pending?.abort(new RichAiAbortError("superseded"));this.#pending=undefined;
  const generation=++this.#generation,state=this.#host.aiState();this.#provider=provider;this.#error=null;this.#message=null;this.#ignored=0;
  const fail=(message:string,error?:unknown):never=>{this.#phase="failed";this.#error=message;this.#render(false);const failure=error instanceof Error?error:Error(message);this.#report(failure);throw failure;};
  if(state.closed)fail("The editor is closed");if(state.busy||state.composing)fail(this.#ui.text("aiBusy"));
  let target;
  try{target=resolveAiTarget(this.#host.aiView(),record["scope"] as RichAiScope,record["block"] as string|undefined);}catch(error){if(error instanceof RichAiScopeError)fail(this.#ui.text("aiNoSelection"),error);throw error;}
  if(utf8Bytes(target.text)>this.#maxInput)fail(this.#ui.text("aiInputTooLarge",{limit:this.#maxInput}));
  this.#issues=[];this.#active=null;this.#phase="pending";this.#render(false);
  const realm=this.#window as unknown as {AbortController:typeof AbortController},controller=new realm.AbortController();this.#pending=controller;
  const live=()=>!this.#disposed&&this.#generation===generation;
  let output:unknown;
  try{output=await runAiProvider(this.#window,controller,this.#timeout,signal=>provider(Object.freeze({kind:"language",scope:target.scope,segments:target.segments,revision:target.revision,signal})));}
  catch(error){
   if(!live())return null;this.#pending=undefined;
   if(error instanceof RichAiAbortError&&error.reason!=="timeout"){this.#phase="cancelled";this.#message=this.#ui.text("aiCancelled");this.#render(false);return null;}
   this.#phase="failed";this.#error=error instanceof RichAiAbortError?this.#ui.text("aiTimeout"):this.#ui.text("aiFailed",{reason:error instanceof Error&&error.message?error.message.slice(0,256):"error"});this.#render(false);this.#report(error);return null;
  }
  if(!live())return null;this.#pending=undefined;
  if(!Array.isArray(output)){this.#phase="failed";this.#error=this.#ui.text("aiInvalidOutput");this.#render(false);this.#report(Error("Language provider output must be an array of issues"));return null;}
  const segments=new Map<string,RichAiSegment[]>(),texts=readAiDocument(target.documentJson).texts;
  for(const segment of target.segments)segments.set(segment.block,[...(segments.get(segment.block)??[]),segment]);
  const admitted:Issue[]=[];let ignored=0;
  for(const raw of output){
   if(admitted.length>=this.#maxIssues){ignored++;continue;}
   const issue=this.#admit(raw,segments,texts);if(issue)admitted.push(issue);else ignored++;
  }
  admitted.sort((a,b)=>target.segments.findIndex(s=>s.block===a.block)-target.segments.findIndex(s=>s.block===b.block)||a.start-b.start||a.end-b.end);
  this.#issues=admitted;this.#seen=target.documentJson;this.#ignored=ignored;this.#active=admitted[0]?.key??null;this.#phase="ready";
  if(ignored)this.#message=this.#ui.text("langIgnoredMalformed",{count:ignored});
  // Publications while the provider ran: re-validate against the current text before display.
  this.#published();
  return this.issues();
 }
 #admit(raw:unknown,segments:ReadonlyMap<string,readonly RichAiSegment[]>,texts:ReadonlyMap<string,string>):Issue|null{
  const issue=plainRecord(raw);if(!issue||Object.keys(issue).some(key=>!["range","message","suggestions","kind"].includes(key)))return null;
  const range=plainRecord(issue["range"]);if(!range||Object.keys(range).length!==3)return null;
  const block=range["block"],start=range["start"],end=range["end"];
  if(typeof block!=="string"||typeof start!=="number"||typeof end!=="number"||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start)return null;
  const text=texts.get(block);if(text===undefined||!(segments.get(block)??[]).some(s=>s.start<=start&&end<=s.end))return null;
  if(!scalarBoundary(text,start)||!scalarBoundary(text,end))return null;
  const message=admitAiText(issue["message"],false);if(message===null||!message.trim()||message.length>512)return null;
  const kind=issue["kind"];if(kind!==undefined&&kind!=="spelling"&&kind!=="grammar"&&kind!=="style")return null;
  const list=issue["suggestions"];if(!Array.isArray(list)||list.length>this.#maxSuggestions)return null;
  const suggestions:string[]=[];
  for(const value of list){const suggestion=admitAiText(value,false);if(suggestion===null||suggestion.length>256)return null;if(!suggestions.includes(suggestion)&&suggestion!==text.slice(start,end))suggestions.push(suggestion);}
  return Object.freeze({key:`i${this.#keys++}`,block,start,end,text:text.slice(start,end),message,suggestions:Object.freeze(suggestions),kind:(kind as RichLanguageIssueKind|undefined)??null,blockText:text});
 }
 issues():readonly RichLanguageIssueView[]{return Object.freeze(this.#issues.map(({blockText:_,...view})=>Object.freeze(view)));}
 #find(key:string):Issue{const issue=this.#issues.find(item=>item.key===key);if(!issue)throw Error("That issue is no longer current");return issue;}
 select(key:string):void{
  this.#live();const issue=this.#find(key);this.#active=issue.key;this.#render(true);
  if(this.#options.reveal===false)return;
  const state=this.#host.aiState();if(state.closed||state.busy||state.composing)return;
  try{const view=this.#host.aiView();if(readAiDocument(view.documentJson).texts.get(issue.block)!==issue.blockText)return;this.#host.selectAiRange(this.#selection(issue),view.revision);}catch(error){this.#report(error);}
 }
 #selection(issue:Issue):RichTextSelection{return {kind:"text",anchor:{block:issue.block,offset:String(issue.start),affinity:"after"},focus:{block:issue.block,offset:String(issue.end),affinity:"after"}};}
 applySuggestion(key:string,index:number):RichCommandOutcome|"queued"{
  this.#live();const issue=this.#find(key),suggestion=issue.suggestions[index];
  if(!Number.isSafeInteger(index)||suggestion===undefined)throw RangeError("No such suggestion");
  const state=this.#host.aiState(),refuse=(message:string):never=>{this.#error=message;this.#render(false);const error=Error(message);this.#report(error);throw error;};
  if(state.closed)refuse("The editor is closed");if(state.busy||state.composing)refuse(this.#ui.text("aiBusy"));if(state.readOnly)refuse(this.#ui.text("langReadOnly"));
  const view=this.#host.aiView(),texts=readAiDocument(view.documentJson).texts;
  if(texts.get(issue.block)!==issue.blockText){const before=this.#issues.length;this.#issues=this.#issues.filter(item=>texts.get(item.block)===item.blockText);this.#active=this.#issues[0]?.key??null;refuse(this.#ui.text("langStale",{count:before-this.#issues.length}));}
  const position=this.#issues.indexOf(issue);
  this.#remap={block:issue.block,start:issue.start,end:issue.end,inserted:suggestion.length,before:issue.blockText,expected:issue.blockText.slice(0,issue.start)+suggestion+issue.blockText.slice(issue.end)};
  this.#issues=this.#issues.filter(item=>item!==issue);
  let outcome:RichCommandOutcome|"queued";
  try{outcome=this.#host.replaceAiText(this.#selection(issue),suggestion,view.revision,false);}
  catch(error){this.#remap=undefined;this.#issues.splice(position,0,issue);this.#error=this.#ui.text("aiFailed",{reason:error instanceof Error?error.message.slice(0,256):"error"});this.#render(false);this.#report(error);throw error;}
  const next=this.#issues[Math.min(position,this.#issues.length-1)];this.#active=next?.key??null;this.#error=null;this.#message=this.#ui.text("langApplied",{revision:this.#host.aiState().revision});
  this.#render(true);
  try{this.#options.onApply?.(outcome,Object.freeze({key:issue.key,block:issue.block,start:issue.start,end:issue.end,text:issue.text,message:issue.message,suggestions:issue.suggestions,kind:issue.kind}));}catch(error){this.#report(error);}
  return outcome;
 }
 ignore(key:string):void{this.#live();const issue=this.#find(key),position=this.#issues.indexOf(issue);this.#issues.splice(position,1);this.#active=this.#issues[Math.min(position,this.#issues.length-1)]?.key??null;this.#render(true);}
 clear():void{this.#live();this.#pending?.abort(new RichAiAbortError("cancelled"));this.#issues=[];this.#active=null;this.#phase="idle";this.#error=this.#message=null;this.#render(false);}
 cancel():void{if(this.#disposed||!this.#pending)return;this.#pending.abort(new RichAiAbortError("cancelled"));}
 #key(event:KeyboardEvent):void{
  const target=event.target as HTMLElement|null;if(!target||event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
  const issueKey=target.dataset["languageIssue"],owner=target.closest<HTMLElement>("[data-language-item]")?.dataset["languageItem"];
  if(event.key==="Escape"){event.preventDefault();if(issueKey===undefined&&owner!==undefined)this.#focusIssue(owner);else if(!this.#host.aiState().closed)this.#host.focus();return;}
  if(issueKey===undefined)return;
  const index=this.#issues.findIndex(issue=>issue.key===issueKey);if(index<0)return;
  const move=event.key==="ArrowDown"?index+1:event.key==="ArrowUp"?index-1:event.key==="Home"?0:event.key==="End"?this.#issues.length-1:null;
  if(move!==null){event.preventDefault();const next=this.#issues[Math.max(0,Math.min(this.#issues.length-1,move))];if(next){this.#attempt(()=>this.select(next.key));this.#focusIssue(next.key);}return;}
  if(event.key==="Enter"||event.key===" "){event.preventDefault();this.#attempt(()=>this.select(issueKey));const first=this.#list.querySelector<HTMLButtonElement>(`[data-language-item="${issueKey}"] [data-language-detail] button:not([disabled])`);first?.focus({preventScroll:true});}
 }
 #attempt(work:()=>void):void{try{work();}catch{/* Reported through status/onError. */}}
 #focusIssue(key:string):void{this.#list.querySelector<HTMLButtonElement>(`[data-language-issue="${key}"]`)?.focus({preventScroll:true});}
 #render(rebuild:boolean):void{
  if(this.#disposed)return;const d=this.#root.ownerDocument,state=this.#host.aiState(),ui=this.#ui,phase=this.#phase;
  this.#element.dataset["languagePhase"]=phase;this.#element.setAttribute("aria-busy",String(phase==="pending"));
  if(this.#check)this.#check.disabled=state.closed||state.busy||state.composing||phase==="pending";this.#stop.hidden=phase!=="pending";
  const blocked=state.closed||state.busy||state.composing||state.readOnly;
  if(rebuild||this.#list.childElementCount!==this.#issues.length){
   // Rebuilding replaces the buttons; restore focus to the equivalent control (issue, suggestion or Ignore).
   const active=d.activeElement,inside=active instanceof d.defaultView!.HTMLElement&&this.#list.contains(active)?active:null,focusedKey=inside?.closest<HTMLElement>("[data-language-item]")?.dataset["languageItem"]??null,focusedSelector=!inside?null:inside.dataset["languageSuggestion"]!==undefined?`[data-language-suggestion="${inside.dataset["languageSuggestion"]}"]`:inside.dataset["languageAction"]==="ignore"?"[data-language-action=ignore]":null;
   const items=this.#issues.map(issue=>{
    const li=d.createElement("li"),button=d.createElement("button"),selected=issue.key===this.#active;li.dataset["languageItem"]=issue.key;
    button.type="button";button.dataset["languageIssue"]=issue.key;button.tabIndex=selected?0:-1;button.setAttribute("aria-current",String(selected));if(issue.kind)button.dataset["languageKind"]=issue.kind;
    button.textContent=ui.text("langIssue",{text:issue.text,message:issue.message});button.addEventListener("click",()=>this.#attempt(()=>this.select(issue.key)));li.append(button);
    if(selected){
     const detail=d.createElement("div");detail.dataset["languageDetail"]="";
     if(!issue.suggestions.length){const none=d.createElement("p");none.textContent=ui.text("langNoSuggestions");detail.append(none);}
     issue.suggestions.forEach((suggestion,index)=>{const node=d.createElement("button");node.type="button";node.dataset["languageSuggestion"]=String(index);node.textContent=ui.text("langReplace",{suggestion});node.disabled=blocked;node.addEventListener("click",()=>this.#attempt(()=>{this.applySuggestion(issue.key,index);this.#refocus();}));detail.append(node);});
     const ignore=d.createElement("button");ignore.type="button";ignore.dataset["languageAction"]="ignore";ignore.textContent=ui.text("langIgnore");ignore.addEventListener("click",()=>{this.ignore(issue.key);this.#refocus();});detail.append(ignore);li.append(detail);
    }
    return li;
   });
   if(!items.some(li=>li.querySelector('[tabindex="0"]'))){const first=items[0]?.querySelector<HTMLButtonElement>("[data-language-issue]");if(first)first.tabIndex=0;}
   this.#list.replaceChildren(...items);
   if(focusedKey!==null){const same=this.#issues.some(issue=>issue.key===focusedKey);if(!same)this.#refocus();else{const control=focusedSelector?this.#list.querySelector<HTMLButtonElement>(`[data-language-item="${focusedKey}"] ${focusedSelector}`):null;if(control)control.focus({preventScroll:true});else this.#focusIssue(focusedKey);}}
  }else for(const node of this.#list.querySelectorAll<HTMLButtonElement>("[data-language-suggestion]"))node.disabled=blocked;
  this.#overlay?.set(phase==="ready"?this.#issues.map(issue=>Object.freeze({key:issue.key,block:issue.block,start:issue.start,end:issue.end,active:issue.key===this.#active})):[]);
  const count=this.#issues.length,summary=count===0?ui.text("langCountNone"):count===1?ui.text("langCountOne"):ui.text("langCount",{count});
  this.#status.textContent=state.closed?"Editor closed":this.#error??(phase==="pending"?ui.text("langChecking"):phase==="ready"?[summary,this.#message,state.readOnly?ui.text("langReadOnly"):null].filter(Boolean).join(" · "):this.#message??"");
  this.#status.toggleAttribute("data-language-error",this.#error!==null);
 }
 /** After an issue disappears from the list, keep keyboard focus on the next current issue. */
 #refocus():void{const key=this.#active;if(key!==null)this.#focusIssue(key);else if(!this.#host.aiState().closed)this.#host.focus();}
 state():RichLanguageCheckState{return Object.freeze({phase:this.#phase,disposed:this.#disposed,issues:this.issues(),active:this.#active,error:this.#error,ignoredMalformed:this.#ignored});}
 /** Releases the panel, paint, subscription and any pending provider call; never the editor. */
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#generation++;this.#pending?.abort(new RichAiAbortError("disposed"));this.#pending=undefined;this.#issues=[];this.#abort.abort();this.#unsubscribe();this.#overlay?.dispose();this.#element.remove();hosts.delete(this.#root);}
}
/** Mount the opt-in spelling/grammar review in a host element outside the editing surface. */
export function mountRichLanguageCheck(root:HTMLElement,host:RichAiToolsHost,options:RichLanguageCheckOptions={}):RichLanguageCheck{return new LanguageCheck(root,host,options);}
const styles=`[data-breditor-language]{padding:12px;border:1px solid #bdcdc5;border-radius:8px;color:#173d37;background:#f4f7f4;font:14px system-ui,sans-serif}[data-breditor-language] h2{font-size:16px;margin:0 0 8px}[data-breditor-language] label{display:inline-flex;align-items:center;gap:6px;margin-inline-end:6px}[data-breditor-language] select{font:inherit;padding:5px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-language] ul{list-style:none;padding:0;margin:8px 0}[data-breditor-language] li{margin:2px 0}[data-breditor-language] [data-language-issue]{display:block;width:100%;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere}[data-breditor-language] [data-language-issue][aria-current=true]{border-color:#c62828;background:#fff4f2}[data-breditor-language] [data-language-detail]{padding:4px 0 6px 16px}[data-breditor-language] [hidden]{display:none}[data-breditor-language] button{padding:6px 9px;margin:2px;border:1px solid #aabbb3;border-radius:4px;background:white;color:inherit}[data-breditor-language] button:disabled{opacity:.5}[data-breditor-language] [data-language-status]{font-size:12px;margin:8px 0 0}[data-breditor-language] [data-language-error]{color:#8a1f11}`;
