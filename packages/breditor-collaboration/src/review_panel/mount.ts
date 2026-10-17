import type {SharedReviewGuard,SharedReviewTarget} from "../review_types.js";
import type {PanelContext,SharedReviewPanel,SharedReviewPanelCore,SharedReviewPanelOptions} from "./types.js";
import {button,field,idKey,sameGuard} from "./dom.js";
import {threadCard} from "./thread_card.js";
import {versionControls} from "./version_controls.js";
/** Borrow one enabled native review facade; this mount never opens, replaces or closes a writer. */
export function mountSharedReviewPanel(host:HTMLElement,core:SharedReviewPanelCore,options:SharedReviewPanelOptions):SharedReviewPanel {
 const initial=core.reviewSnapshot(),d=host.ownerDocument,element=d.createElement("section"),heading=d.createElement("h2"),status=d.createElement("p"),discussions=d.createElement("div"),compose=field(d,"New comment");
 let closed=false,anchorJson:string|undefined,guard:SharedReviewGuard|undefined;
 const context:PanelContext={core,options,snapshot:initial,document:d,refresh,run(work){if(closed)return;try{work();status.textContent="";refresh();}catch(error){context.report(error);}},report(error){if(closed)return;status.textContent=error instanceof Error?error.message:String(error);try{options.onError?.(error);}catch{/* Reporting cannot modify accepted native state. */}},target(){if(options.target)return options.target();const selected=core.view().selection;return selected===null?null:selected.kind==="document"?{kind:"document"}:{kind:"selection",selection:selected};},commentAllowed(){return options.policy().access!=="read_only";},moderates(author){const policy=options.policy();return policy.access==="moderate"||(policy.access==="comment"&&policy.principal===author);}};
 heading.textContent="Review";status.setAttribute("role","status");element.dataset["breditorReview"]="";
 const targetStatus=d.createElement("p");
 function capture(target:SharedReviewTarget|null){context.run(()=>{if(!target)throw Error("Select text, an image or table cells first");guard=core.reviewSnapshot();anchorJson=core.captureReviewAnchor(target,guard.documentRevision);targetStatus.textContent=target.kind==="document"?"Target: document discussion":"Target: captured editor selection";});}
 const useSelection=button(d,"Use editor selection",()=>capture(context.target())),useDocument=button(d,"Use document",()=>capture({kind:"document"}));
 const post=button(d,"Post comment",()=>context.run(()=>{if(!anchorJson||!guard)throw Error("Choose a comment target first");core.dispatchReview({kind:"create_thread",data:{anchorJson,body:compose.input.value}},guard);compose.input.value="";anchorJson=undefined;guard=undefined;targetStatus.textContent="Choose a target for the next comment.";}));
 const undo=button(d,"Undo comment",()=>context.run(()=>{core.undoReview(core.reviewSnapshot());})),redo=button(d,"Redo comment",()=>context.run(()=>{core.redoReview(core.reviewSnapshot());}));
 const cards=new Map<string,ReturnType<typeof threadCard>>();let versions:ReturnType<typeof versionControls>;
 function refresh(){if(closed)return;context.snapshot=core.reviewSnapshot();
  const allowed=context.commentAllowed();useSelection.disabled=!allowed||context.target()===null;useDocument.disabled=!allowed;post.disabled=!allowed||!anchorJson||!guard||!sameGuard(guard,context.snapshot)||!compose.input.value.trim();
  undo.disabled=!allowed||context.snapshot.view.undoDepth===0;redo.disabled=!allowed||context.snapshot.view.redoDepth===0;
  if(guard&&!sameGuard(guard,context.snapshot))targetStatus.textContent="The captured publication changed. Choose the target again; your draft is retained.";
  const keep=new Set<string>();for(const next of context.snapshot.view.threads){const key=idKey(next.thread.id);keep.add(key);let card=cards.get(key);if(!card){card=threadCard(context);cards.set(key,card);discussions.append(card.element);}card.render(next);}
  for(const [key,card]of cards)if(!keep.has(key)){card.element.remove();cards.delete(key);}versions?.refresh();
 }
 compose.input.oninput=refresh;
 try{versions=versionControls(context);element.append(heading,compose.label,useSelection,useDocument,targetStatus,post,undo,redo,discussions);if(versions)element.append(versions.element);element.append(status);refresh();}catch(error){versions?.dispose();throw error;}
 const unsubscribe=core.subscribeReview(()=>{try{refresh();}catch(error){context.report(error);}});host.append(element);
 return {element,refresh,dispose(){if(closed)return;closed=true;unsubscribe();versions?.dispose();element.remove();cards.clear();}};
}
