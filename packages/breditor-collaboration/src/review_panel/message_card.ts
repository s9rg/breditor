import type {SharedReviewMessage,SharedReviewGuard} from "../review_types.js";
import type {PanelContext} from "./types.js";
import {button,field,sameGuard} from "./dom.js";
/** Keyed controls retain an unsaved draft and its original native guard through remote renders. */
export function messageCard(context:PanelContext) {
 const d=context.document,element=d.createElement("section"),values=d.createElement("div"),edit=field(d,"Edit comment"),warning=d.createElement("p");
 let message:SharedReviewMessage,guard:SharedReviewGuard|undefined;
 const begin=button(d,"Edit",()=>context.run(()=>{guard=context.core.reviewSnapshot();edit.input.value=message.versions.length===1?(message.versions[0]?.text??""):"";update();edit.input.focus();}));
 const retract=button(d,"Retract",()=>context.run(()=>{context.core.dispatchReview({kind:"retract_message",data:{message:message.id}},context.core.reviewSnapshot());}));
 const save=button(d,"Save edit",()=>context.run(()=>{if(!guard)throw Error("Open an edit before saving");context.core.dispatchReview({kind:"edit_message",data:{message:message.id,body:edit.input.value}},guard);guard=undefined;update();}));
 const refresh=button(d,"Use current discussion",()=>context.run(()=>{guard=context.core.reviewSnapshot();update();}));
 const cancel=button(d,"Cancel edit",()=>{guard=undefined;update();});
 edit.input.oninput=()=>update();element.append(values,begin,retract,edit.label,warning,save,refresh,cancel);
 function update(){
  const allowed=context.moderates(message.author),stale=guard!==undefined&&!sameGuard(guard,context.snapshot);
  begin.disabled=!allowed;retract.disabled=!allowed;edit.label.hidden=guard===undefined;
  save.hidden=refresh.hidden=cancel.hidden=guard===undefined;
  save.disabled=!allowed||stale||!edit.input.value.trim();refresh.disabled=!allowed;
  warning.hidden=guard===undefined||!stale;warning.textContent=stale?"The document or discussion changed. Review current versions, then use the current discussion before saving your draft.":"";
 }
 return {element,render(next:SharedReviewMessage){message=next;values.replaceChildren();
  const author=d.createElement("p");author.textContent=`Author: ${message.author}`;values.append(author);
  if(message.versions.length>1){const conflict=d.createElement("p");conflict.textContent="Concurrent message versions — choose an explicit combined edit.";values.append(conflict);}
  for(const value of message.versions){const p=d.createElement("p");p.style.whiteSpace="pre-wrap";p.textContent=`${value.principal}: ${value.text??"[Retracted]"}`;values.append(p);}
  if(!message.versions.length){const p=d.createElement("p");p.textContent="[Contribution undone]";values.append(p);}
  update();
 }};
}
