/** Complete native text rebase controls. No default policy, inferred ranges or accepted edits. */
import {button} from "../review_panel/dom.js";
import {richUiError,type RichUiLocale} from "@breditor/experimental-rich-content/rendering";
import type {SharedSuggestionPanelCore,SharedSuggestionPanelEntry,SharedSuggestionPanelOptions} from "./types.js";
import type {SharedSuggestionTextRebasePolicy} from "../suggestion_types.js";
import type {SharedSuggestionTextRebaseQueued} from "../suggestion_revisions/types.js";
interface Context {
 core:SharedSuggestionPanelCore;options:SharedSuggestionPanelOptions;ui:RichUiLocale;
 chosen():SharedSuggestionPanelEntry|undefined;canPropose():boolean;title():string;now():string;
 saving(work:()=>void,message:()=>string):void;dropPreview():void;
 queued(id:string):void;showResult(result:SharedSuggestionTextRebaseQueued):void;
}
function isPolicy(value:string):value is SharedSuggestionTextRebasePolicy{return value==="reject_intervening_text"||value==="preserve_intervening_text";}
export function createTextRebaseControls(d:Document,c:Context){
 const source=c.options.source,ui=c.ui,element=d.createElement("fieldset"),legend=d.createElement("legend"),label=d.createElement("label"),policy=d.createElement("select");
 legend.textContent=ui.text("suggestTextLegend");label.append(d.createTextNode(ui.text("suggestTextPolicy")),policy);element.hidden=!source.rebaseText;
 for(const [value,text] of [["",ui.text("suggestTextChoose")],["reject_intervening_text",ui.text("suggestTextRefuse")],["preserve_intervening_text",ui.text("suggestTextPreserve")]]){const option=d.createElement("option");option.value=value!;option.textContent=text!;option.disabled=value==="";policy.append(option);}policy.value="";
 let blocked=true;
 const rebase=button(d,ui.text("suggestTextRebase"),()=>{let message="";c.saving(()=>{
  const row=c.chosen(),choice=policy.value;if(!isPolicy(choice))throw richUiError("suggestTextErrorPolicy");
  if(!row||!source.rebaseText||!source.canRevise?.(row.suggestion.id)||!c.canPropose())throw richUiError("suggestErrorOwn");
  if(!c.options.allocate)throw richUiError("suggestTextErrorAllocator");
  const revision=c.core.view().revision,prefix=c.options.allocate("suggestion-text-rebase");source.check();
  if(c.core.view().revision!==revision)throw richUiError("suggestTextErrorChanged");
  c.dropPreview();const title=c.title(),result=source.rebaseText(row.suggestion.id,title.trim()?title:row.suggestion.title,c.now(),prefix,choice,revision);
  if(result.kind==="queued"){c.queued(result.revision.suggestion.id);message=ui.text("suggestTextQueued");}
  else{c.showResult(result);message=ui.text(result.kind==="pending"?"suggestTextPending":result.kind==="unsupported"?"suggestTextUnsupported":result.reason.kind==="intervening_text"?"suggestTextIntervening":"suggestTextConflict");}
 },()=>message);});
 function update(disabled:boolean){blocked=disabled||!source.rebaseText;policy.disabled=blocked;rebase.disabled=blocked||!isPolicy(policy.value);}
 policy.onchange=()=>update(blocked);element.append(legend,label,rebase);update(true);
 return {element,update};
}
