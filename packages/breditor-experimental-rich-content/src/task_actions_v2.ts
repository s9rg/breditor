/** Task-only command preparation. Rust rechecks the complete action and publication guard. */
import type {ActionContext} from "./actions.js";
import type {RichCommand,RichSelectionPolicy} from "./core.js";
import {id,isProse,text,type ElementNode,type RichPresentationModel} from "./model.js";
interface TaskContext {container:ElementNode;items:ElementNode[];first:number;last:number}
/** Do not cross an ordinary-list item or mix unrelated nesting levels. */
export function taskContext(model:RichPresentationModel):TaskContext|undefined {
 const s=model.view.selection;if(s?.kind!=="text")return undefined;
 const itemOf=(block:string):ElementNode|undefined=>{let node=model.nodes.get(block);while(node){if(node.type==="breditor/task-item")return node;if(node.type==="breditor/list-item")return undefined;node=model.parents.get(id(node));}return undefined;};
 const a=itemOf(s.anchor.block),f=itemOf(s.focus.block);if(!a||!f)return undefined;
 const container=model.parents.get(id(a));if(container?.type!=="breditor/task-list"||model.parents.get(id(f))!==container)return undefined;
 const items=container.children.filter((n):n is ElementNode=>n.kind==="element"),first=items.indexOf(a),last=items.indexOf(f);
 return first<0||last<0?undefined:{container,items,first:Math.min(first,last),last:Math.max(first,last)};
}
export function indentTasks(c:ActionContext<RichSelectionPolicy>):RichCommand|null {
 const t=taskContext(c.model);if(!t||t.first===0)return null;
 const parent=t.items[t.first-1]!,last=parent.children.at(-1),existing=last?.kind==="element"&&last.type==="breditor/task-list";
 return {kind:"indentTaskItems",data:{container:id(t.container),first:id(t.items[t.first]!),last:id(t.items[t.last]!),nested:existing?null:c.allocate("tasks")}};
}
export function outdentTasks(c:ActionContext<RichSelectionPolicy>):RichCommand|null {
 const t=taskContext(c.model);return t?{kind:"outdentTaskItems",data:{container:id(t.container),first:id(t.items[t.first]!),last:id(t.items[t.last]!),tail:t.first>0&&t.last<t.items.length-1?c.allocate("tasks"):null}}:null;
}
/** A rich tail is not empty merely because its leading paragraph is empty. */
export function exitEmptyTask(c:ActionContext<RichSelectionPolicy>):RichCommand|null {
 const t=taskContext(c.model),s=c.model.view.selection;if(!t||s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset||t.first!==t.last)return null;
 const item=t.items[t.first]!,head=item.children[0];
 if(item.children.length!==1||head?.kind!=="element"||!isProse(head)||id(head)!==s.focus.block||text(head).length!==0)return null;
 return {kind:"exitTaskItem",data:{container:id(t.container),item:id(item),tail:t.first>0&&t.last<t.items.length-1?c.allocate("tasks"):null}};
}
/** Tab navigates checkbox controls normally; code has no implicit task-indent meaning. */
export function taskTab(c:ActionContext<RichSelectionPolicy>,backward:boolean):RichCommand|null {
 const s=c.model.view.selection;if(s?.kind!=="text")return null;
 const a=c.model.nodes.get(s.anchor.block),f=c.model.nodes.get(s.focus.block);if(!a||!f||!isProse(a)||!isProse(f))return null;
 return backward?outdentTasks(c):indentTasks(c);
}
