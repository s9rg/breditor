/** Read-only task gesture preparation; native guarded actions own all admission and history. */
import {id,isProse,text,taskContext,isStructuralRichLanguage} from "@breditor/experimental-rich-content/rendering";
import type {ActionContext} from "./actions.js";
import type {SharedCommand} from "./types.js";
export function indentSharedTasks(c:ActionContext):SharedCommand|undefined {
 const t=taskContext(c.model);if(!t||t.first===0)return;
 const last=t.items[t.first-1]!.children.at(-1),existing=last?.kind==="element"&&last.type==="breditor/task-list";
 return {kind:"indent_task_items",data:{container:id(t.container),first:id(t.items[t.first]!),last:id(t.items[t.last]!),new_nested:existing?null:c.allocate("tasks")}};
}
export function outdentSharedTasks(c:ActionContext):SharedCommand|undefined {
 const t=taskContext(c.model);return t?{kind:"outdent_task_items",data:{container:id(t.container),first:id(t.items[t.first]!),last:id(t.items[t.last]!),fresh_tail:t.first>0&&t.last<t.items.length-1?c.allocate("tasks"):null}}:undefined;
}
export function exitEmptySharedTask(c:ActionContext):SharedCommand|undefined {
 const t=taskContext(c.model),s=c.model.view.selection;if(!t||s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset||t.first!==t.last)return;
 const item=t.items[t.first]!,head=item.children[0];
 if(item.children.length!==1||head?.kind!=="element"||!isProse(head)||id(head)!==s.focus.block||text(head).length!==0)return;
 return {kind:"exit_task_item",data:{container:id(t.container),item:id(item),fresh_tail:t.first>0&&t.last<t.items.length-1?c.allocate("tasks"):null}};
}
export function sharedTaskTab(c:ActionContext,backward:boolean):SharedCommand|undefined {
 const s=c.model.view.selection;if(!isStructuralRichLanguage(c.core.richLanguageVersion())||s?.kind!=="text")return;
 const a=c.model.nodes.get(s.anchor.block),f=c.model.nodes.get(s.focus.block);if(!a||!f||!isProse(a)||!isProse(f))return;
 return backward?outdentSharedTasks(c):indentSharedTasks(c);
}
