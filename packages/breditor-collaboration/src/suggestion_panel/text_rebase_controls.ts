/** Complete native text rebase controls. No default policy, inferred ranges or accepted edits. */
import {button} from "../review_panel/dom.js";
import type {SharedSuggestionPanelCore,SharedSuggestionPanelEntry,SharedSuggestionPanelOptions} from "./types.js";
import type {SharedSuggestionTextRebasePolicy} from "../suggestion_types.js";
import type {SharedSuggestionTextRebaseQueued} from "../suggestion_revisions/types.js";
interface Context {
 core:SharedSuggestionPanelCore;options:SharedSuggestionPanelOptions;
 chosen():SharedSuggestionPanelEntry|undefined;canPropose():boolean;title():string;now():string;
 saving(work:()=>void,message:()=>string):void;dropPreview():void;
 queued(id:string):void;showResult(result:SharedSuggestionTextRebaseQueued):void;
}
function isPolicy(value:string):value is SharedSuggestionTextRebasePolicy{return value==="reject_intervening_text"||value==="preserve_intervening_text";}
export function createTextRebaseControls(d:Document,c:Context){
 const source=c.options.source,element=d.createElement("fieldset"),legend=d.createElement("legend"),label=d.createElement("label"),policy=d.createElement("select");
 legend.textContent="Text revision";label.append(d.createTextNode("Peer text handling"),policy);element.hidden=!source.rebaseText;
 for(const [value,text] of [["","Choose a text policy"],["reject_intervening_text","Refuse if peer text is inside the range"],["preserve_intervening_text","Preserve peer text"]]){const option=d.createElement("option");option.value=value!;option.textContent=text!;option.disabled=value==="";policy.append(option);}policy.value="";
 let blocked=true;
 const rebase=button(d,"Rebase text suggestion",()=>{let message="";c.saving(()=>{
  const row=c.chosen(),choice=policy.value;if(!isPolicy(choice))throw Error("Choose how to handle peer text before rebasing");
  if(!row||!source.rebaseText||!source.canRevise?.(row.suggestion.id)||!c.canPropose())throw Error("Choose your own pending retained suggestion first");
  if(!c.options.allocate)throw Error("Text rebase requires a durable fresh-ID allocator");
  const revision=c.core.view().revision,prefix=c.options.allocate("suggestion-text-rebase");source.check();
  if(c.core.view().revision!==revision)throw Error("The source changed while allocating the text revision; the namespace stays consumed");
  c.dropPreview();const title=c.title(),result=source.rebaseText(row.suggestion.id,title.trim()?title:row.suggestion.title,c.now(),prefix,choice,revision);
  if(result.kind==="queued"){c.queued(result.revision.suggestion.id);message="Text revision saved locally. Await authenticated server supersession before reviewing or deciding the child.";}
  else{c.showResult(result);message=result.kind==="pending"?"Text rebase is waiting for original document history. Nothing was queued.":result.kind==="unsupported"?"This proposal cannot use automatic text rebase. Create an explicit manual revision; nothing was queued.":result.reason.kind==="intervening_text"?"Peer text is inside this replacement. Choose Preserve peer text or make a manual revision; nothing was queued.":"Original characters, formatting or structure changed. Review the conflict or make a manual revision; nothing was queued.";}
 },()=>message);});
 function update(disabled:boolean){blocked=disabled||!source.rebaseText;policy.disabled=blocked;rebase.disabled=blocked||!isPolicy(policy.value);}
 policy.onchange=()=>update(blocked);element.append(legend,label,rebase);update(true);
 return {element,update};
}
