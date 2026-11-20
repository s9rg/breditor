import type {SharedReviewGuard,SharedReviewTarget} from "../review_types.js";
import type {PanelContext,SharedReviewPanel,SharedReviewPanelCore,SharedReviewPanelOptions} from "./types.js";
import {button,field,idKey,sameGuard} from "./dom.js";
import {threadCard} from "./thread_card.js";
import {versionControls} from "./version_controls.js";
import {mountSharedSuggestionPanel} from "../suggestion_panel/mount.js";
import type {SharedSuggestionPanelCore} from "../suggestion_panel/types.js";
import {resolveRichUi,richUiError} from "@breditor/experimental-rich-content/rendering";
function requireSuggestionCore(core:SharedReviewPanelCore):asserts core is SharedReviewPanelCore&SharedSuggestionPanelCore{const candidate:Partial<SharedSuggestionPanelCore>=core;for(const method of ["subscribe","supportsDocumentSuggestions","prepareSuggestion","checkSuggestionPreview"] as const)if(typeof candidate[method]!=="function")throw Error("Suggestion controls require matching native proposal capabilities");}
/** Borrow one enabled native review facade; this mount never opens, replaces or closes a writer. */
export function mountSharedReviewPanel(host:HTMLElement,core:SharedReviewPanelCore,options:SharedReviewPanelOptions):SharedReviewPanel {
 const ui=resolveRichUi(options.ui),initial=core.reviewSnapshot(),d=host.ownerDocument,element=d.createElement("section"),heading=d.createElement("h2"),status=d.createElement("p"),discussions=d.createElement("div"),compose=field(d,ui.text("reviewNewComment"));
 let closed=false,anchorJson:string|undefined,guard:SharedReviewGuard|undefined;
 const context:PanelContext={core,options,snapshot:initial,ui,document:d,refresh,run(work){if(closed)return;try{work();status.textContent="";refresh();}catch(error){context.report(error);}},report(error){if(closed)return;status.textContent=ui.describe(error,String(error));try{options.onError?.(error);}catch{/* Reporting cannot modify accepted native state. */}},target(){if(options.target)return options.target();const selected=core.view().selection;return selected===null?null:selected.kind==="document"?{kind:"document"}:{kind:"selection",selection:selected};},commentAllowed(){return options.policy().access!=="read_only";},moderates(author){const policy=options.policy();return policy.access==="moderate"||(policy.access==="comment"&&policy.principal===author);}};
 heading.textContent=ui.text("reviewHeading");status.setAttribute("role","status");element.dataset["breditorReview"]="";ui.applyChrome(element);
 const targetStatus=d.createElement("p");
 function capture(target:SharedReviewTarget|null){context.run(()=>{if(!target)throw richUiError("reviewErrorSelect");guard=core.reviewSnapshot();anchorJson=core.captureReviewAnchor(target,guard.documentRevision);targetStatus.textContent=ui.text(target.kind==="document"?"reviewTargetDocument":"reviewTargetSelection");});}
 const useSelection=button(d,ui.text("reviewUseSelection"),()=>capture(context.target())),useDocument=button(d,ui.text("reviewUseDocument"),()=>capture({kind:"document"}));
 const post=button(d,ui.text("reviewPost"),()=>context.run(()=>{if(!anchorJson||!guard)throw richUiError("reviewErrorTarget");core.dispatchReview({kind:"create_thread",data:{anchorJson,body:compose.input.value}},guard);compose.input.value="";anchorJson=undefined;guard=undefined;targetStatus.textContent=ui.text("reviewChooseTarget");}));
 const undo=button(d,ui.text("reviewUndo"),()=>context.run(()=>{core.undoReview(core.reviewSnapshot());})),redo=button(d,ui.text("reviewRedo"),()=>context.run(()=>{core.redoReview(core.reviewSnapshot());}));
 const cards=new Map<string,ReturnType<typeof threadCard>>();let versions:ReturnType<typeof versionControls>,suggestions:ReturnType<typeof mountSharedSuggestionPanel>|undefined;
 function refresh(){if(closed)return;context.snapshot=core.reviewSnapshot();
  const allowed=context.commentAllowed();useSelection.disabled=!allowed||context.target()===null;useDocument.disabled=!allowed;post.disabled=!allowed||!anchorJson||!guard||!sameGuard(guard,context.snapshot)||!compose.input.value.trim();
  undo.disabled=!allowed||context.snapshot.view.undoDepth===0;redo.disabled=!allowed||context.snapshot.view.redoDepth===0;
  if(guard&&!sameGuard(guard,context.snapshot))targetStatus.textContent=ui.text("reviewTargetChanged");
  const keep=new Set<string>();for(const next of context.snapshot.view.threads){const key=idKey(next.thread.id);keep.add(key);let card=cards.get(key);if(!card){card=threadCard(context);cards.set(key,card);discussions.append(card.element);}card.render(next);}
  for(const [key,card]of cards)if(!keep.has(key)){card.element.remove();cards.delete(key);}versions?.refresh();suggestions?.refresh();
 }
 compose.input.oninput=refresh;
 try{versions=versionControls(context);element.append(heading,compose.label,useSelection,useDocument,targetStatus,post,undo,redo,discussions);if(versions)element.append(versions.element);if(options.suggestions){requireSuggestionCore(core);suggestions=mountSharedSuggestionPanel(element,core,options.suggestions.ui===undefined?{...options.suggestions,ui}:options.suggestions);}element.append(status);refresh();}catch(error){suggestions?.dispose();versions?.dispose();throw error;}
 let unsubscribe:()=>void;try{unsubscribe=core.subscribeReview(()=>{try{refresh();}catch(error){context.report(error);}});host.append(element);}catch(error){suggestions?.dispose();versions?.dispose();element.remove();throw error;}
 return {element,refresh,dispose(){if(closed)return;closed=true;unsubscribe();suggestions?.dispose();versions?.dispose();element.remove();cards.clear();}};
}
