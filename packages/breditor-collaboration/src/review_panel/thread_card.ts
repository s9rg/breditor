import type {SharedReviewView} from "../review_types.js";
import type {PanelContext} from "./types.js";
import {button,field,idKey} from "./dom.js";
import {messageCard} from "./message_card.js";
import {originalQuotes} from "./original_quotes.js";
import {richUiError,type RichUiStringKey} from "@breditor/experimental-rich-content/rendering";
const states:Readonly<Record<string,RichUiStringKey>>={open:"reviewStateOpen",resolved:"reviewStateResolved",conflicted:"reviewStateConflicted"};
const reasons:Readonly<Record<string,RichUiStringKey>>={target_deleted:"reviewOrphanTargetDeleted",hidden_table:"reviewOrphanHiddenTable",range_collapsed:"reviewOrphanRangeCollapsed",target_kind_changed:"reviewOrphanKindChanged"};
type Thread=SharedReviewView["threads"][number];
export function threadCard(context:PanelContext){
 const d=context.document,ui=context.ui,element=d.createElement("article"),state=d.createElement("h3"),targets=d.createElement("p"),quotes=originalQuotes(context),messages=d.createElement("div"),reply=field(d,ui.text("reviewReply"));
 const code=(map:Readonly<Record<string,RichUiStringKey>>,value:string)=>Object.prototype.hasOwnProperty.call(map,value)?ui.text(map[value]!):value;
 let current:Thread;const cards=new Map<string,ReturnType<typeof messageCard>>();
 const resolve=button(d,ui.text("reviewResolve"),()=>decision(true)),reopen=button(d,ui.text("reviewReopen"),()=>decision(false));
 const reanchor=button(d,ui.text("reviewReanchor"),()=>context.run(()=>{const target=context.target();if(!target)throw richUiError("reviewErrorReanchor");const observed=context.core.reviewSnapshot();const anchorJson=context.core.captureReviewAnchor(target,observed.documentRevision);context.core.dispatchReview({kind:"reanchor_thread",data:{thread:current.thread.id,anchorJson}},observed);}));
 const send=button(d,ui.text("reviewPostReply"),()=>context.run(()=>{context.core.dispatchReview({kind:"reply",data:{thread:current.thread.id,body:reply.input.value}},context.core.reviewSnapshot());reply.input.value="";update();}));
 function decision(resolved:boolean){context.run(()=>{context.core.dispatchReview({kind:"set_thread_state",data:{thread:current.thread.id,resolved}},context.core.reviewSnapshot());});}
 function update(){send.disabled=!context.commentAllowed()||!reply.input.value.trim();resolve.disabled=reopen.disabled=!context.commentAllowed();reanchor.disabled=!context.moderates(current.thread.author)||context.target()===null;}
 reply.input.oninput=update;element.append(state,targets,quotes.element,resolve,reopen,reanchor,messages,reply.label,send);
 return {element,render(next:Thread){current=next;state.textContent=ui.text(next.thread.hidden?"reviewThreadHidden":"reviewThread",{state:code(states,next.thread.state)});
  const anchors=next.targets.map(t=>t.resolution.kind==="orphaned"?ui.text("reviewOrphaned",{reason:code(reasons,t.resolution.reason)}):ui.text(t.resolution.kind==="pending"?"reviewTargetPending":"reviewTargetAttached")).join(ui.text("panelGroupSeparator"));
  targets.textContent=next.targets.length>1?ui.text("reviewConcurrentAnchors",{targets:anchors}):anchors;
  quotes.render(next.targets);
  const keep=new Set<string>();for(const message of next.thread.messages){const key=idKey(message.id);keep.add(key);let card=cards.get(key);if(!card){card=messageCard(context);cards.set(key,card);messages.append(card.element);}card.render(message);}
  for(const [key,card]of cards)if(!keep.has(key)){card.element.remove();cards.delete(key);}update();
 }};
}
