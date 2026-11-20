import type {SharedReviewMessage,SharedReviewGuard} from "../review_types.js";
import type {PanelContext} from "./types.js";
import {button,field,sameGuard} from "./dom.js";
import {richUiError,setRichChromeText} from "@breditor/experimental-rich-content/rendering";
/** Keyed controls retain an unsaved draft and its original native guard through remote renders. */
export function messageCard(context:PanelContext) {
 const d=context.document,ui=context.ui,element=d.createElement("section"),values=d.createElement("div"),edit=field(d,ui.text("reviewEditComment")),warning=d.createElement("p");
 let message:SharedReviewMessage,guard:SharedReviewGuard|undefined;
 const begin=button(d,ui.text("reviewEdit"),()=>context.run(()=>{guard=context.core.reviewSnapshot();edit.input.value=message.versions.length===1?(message.versions[0]?.text??""):"";update();edit.input.focus();}));
 const retract=button(d,ui.text("reviewRetract"),()=>context.run(()=>{context.core.dispatchReview({kind:"retract_message",data:{message:message.id}},context.core.reviewSnapshot());}));
 const save=button(d,ui.text("reviewSaveEdit"),()=>context.run(()=>{if(!guard)throw richUiError("reviewErrorNoEdit");context.core.dispatchReview({kind:"edit_message",data:{message:message.id,body:edit.input.value}},guard);guard=undefined;update();}));
 const refresh=button(d,ui.text("reviewUseCurrent"),()=>context.run(()=>{guard=context.core.reviewSnapshot();update();}));
 const cancel=button(d,ui.text("reviewCancelEdit"),()=>{guard=undefined;update();});
 edit.input.oninput=()=>update();element.append(values,begin,retract,edit.label,warning,save,refresh,cancel);
 function update(){
  const allowed=context.moderates(message.author),stale=guard!==undefined&&!sameGuard(guard,context.snapshot);
  begin.disabled=!allowed;retract.disabled=!allowed;edit.label.hidden=guard===undefined;
  save.hidden=refresh.hidden=cancel.hidden=guard===undefined;
  save.disabled=!allowed||stale||!edit.input.value.trim();refresh.disabled=!allowed;
  warning.hidden=guard===undefined||!stale;warning.textContent=stale?ui.text("reviewEditStale"):"";
 }
 return {element,render(next:SharedReviewMessage){message=next;values.replaceChildren();
  const author=d.createElement("p");setRichChromeText(author,ui,"reviewAuthor",{author:message.author},["author"]);values.append(author);
  if(message.versions.length>1){const conflict=d.createElement("p");conflict.textContent=ui.text("reviewConcurrentVersions");values.append(conflict);}
  for(const value of message.versions){const p=d.createElement("p");p.style.whiteSpace="pre-wrap";setRichChromeText(p,ui,value.text===null?"reviewMessageRetracted":"reviewMessage",{principal:value.principal,...(value.text===null?{}:{text:value.text})},["principal","text"]);values.append(p);}
  if(!message.versions.length){const p=d.createElement("p");p.textContent=ui.text("reviewContributionUndone");values.append(p);}
  update();
 }};
}
