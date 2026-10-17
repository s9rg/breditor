import type {SharedReviewView} from "../review_types.js";
import type {PanelContext} from "./types.js";
import {button,field,idKey} from "./dom.js";
import {messageCard} from "./message_card.js";
type Thread=SharedReviewView["threads"][number];
export function threadCard(context:PanelContext){
 const d=context.document,element=d.createElement("article"),state=d.createElement("h3"),targets=d.createElement("p"),messages=d.createElement("div"),reply=field(d,"Reply");
 let current:Thread;const cards=new Map<string,ReturnType<typeof messageCard>>();
 const resolve=button(d,"Resolve",()=>decision(true)),reopen=button(d,"Reopen",()=>decision(false));
 const reanchor=button(d,"Reanchor to selection",()=>context.run(()=>{const target=context.target();if(!target)throw Error("Select an explicit target in the editor first");const observed=context.core.reviewSnapshot();const anchorJson=context.core.captureReviewAnchor(target,observed.documentRevision);context.core.dispatchReview({kind:"reanchor_thread",data:{thread:current.thread.id,anchorJson}},observed);}));
 const send=button(d,"Post reply",()=>context.run(()=>{context.core.dispatchReview({kind:"reply",data:{thread:current.thread.id,body:reply.input.value}},context.core.reviewSnapshot());reply.input.value="";update();}));
 function decision(resolved:boolean){context.run(()=>{context.core.dispatchReview({kind:"set_thread_state",data:{thread:current.thread.id,resolved}},context.core.reviewSnapshot());});}
 function update(){send.disabled=!context.commentAllowed()||!reply.input.value.trim();resolve.disabled=reopen.disabled=!context.commentAllowed();reanchor.disabled=!context.moderates(current.thread.author)||context.target()===null;}
 reply.input.oninput=update;element.append(state,targets,resolve,reopen,reanchor,messages,reply.label,send);
 return {element,render(next:Thread){current=next;state.textContent=`Discussion — ${next.thread.state}${next.thread.hidden?" (hidden contributions)":""}`;
  targets.textContent=next.targets.map(t=>t.resolution.kind==="orphaned"?`Orphaned: ${t.resolution.reason}`:t.resolution.kind==="pending"?"Waiting for document edits":"Attached to original target").join("; ");
  if(next.targets.length>1)targets.textContent=`Concurrent anchors: ${targets.textContent}`;
  const keep=new Set<string>();for(const message of next.thread.messages){const key=idKey(message.id);keep.add(key);let card=cards.get(key);if(!card){card=messageCard(context);cards.set(key,card);messages.append(card.element);}card.render(message);}
  for(const [key,card]of cards)if(!keep.has(key)){card.element.remove();cards.delete(key);}update();
 }};
}
