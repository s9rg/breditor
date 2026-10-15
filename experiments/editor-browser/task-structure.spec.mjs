import {test,expect} from "@playwright/test";
async function ready(page){await page.goto("/structural.html");await expect(page.locator("#ready")).toHaveText("Ready");}
test("Enter exits a truly empty top-level task once and exact Undo restores its completion",async({page})=>{
 await ready(page);
 const before=await page.evaluate(()=>{
  const t=window.v2,e=t.editor,length=e.surface.querySelector('[data-rich-text="task-b-head"]').textContent.length;
  e.execute({kind:"setTaskChecked",data:{item:"task-b",checked:true}});
  e.execute({kind:"replaceTextRange",data:{selection:t.range("task-b-head",0,length),text:""}});e.focus();
  return {document:e.view().documentJson,depth:e.view().undoDepth};
 });
 await page.keyboard.press("Enter");
 await expect(page.locator('#editor > .breditor-rich-surface > [data-rich-text="task-b-head"]')).toHaveCount(1);
 await expect(page.locator('#editor [data-rich-block="tasks"] > [data-rich-task]')).toHaveCount(1);
 const result=await page.evaluate(()=>{const t=window.v2,e=t.editor,after=e.view().documentJson,depth=e.view().undoDepth,selection=e.view().selection;e.execute({kind:"undo"});const undo=e.view().documentJson;e.execute({kind:"redo"});return {depth,selection,undo,redo:e.view().documentJson===after,errors:t.errors};});
 expect(result).toMatchObject({depth:before.depth+1,selection:{kind:"text",focus:{block:"task-b-head",offset:"0"}},undo:before.document,redo:true,errors:[]});
});

test("native Tab and Shift Tab append and promote tasks with exact completion rich tails and reload",async({page})=>{
 await ready(page);
 const before=await page.evaluate(()=>{const t=window.v2,e=t.editor;e.execute({kind:"setSelection",selection:t.range("task-b-head",2)});e.focus();return {document:e.view().documentJson,depth:e.view().undoDepth};});
 await page.keyboard.press("Tab");
 await expect(page.locator('#editor [data-rich-block="nested-tasks"] > [data-rich-task]')).toHaveCount(2);
 await expect(page.locator('[data-task-check="task-a"]')).toBeChecked();await expect(page.locator('[data-task-check="task-b"]')).not.toBeChecked();
 const nested=await page.evaluate(()=>({document:window.v2.editor.view().documentJson,depth:window.v2.editor.view().undoDepth,selection:window.v2.editor.view().selection}));expect(nested.depth).toBe(before.depth+1);expect(nested.selection.focus).toMatchObject({block:"task-b-head",offset:"2"});
 await page.keyboard.press("Shift+Tab");
 expect(await page.evaluate(()=>window.v2.editor.view().documentJson)).toBe(before.document);
 const saved=await page.evaluate(()=>{const t=window.v2,e=t.editor;e.execute({kind:"undo"});t.save();return e.checkpointJson();});
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.v2.editor.checkpointJson())).toBe(saved);
 expect(await page.evaluate(()=>window.v2.editor.view().documentJson)).toBe(nested.document);
 await page.evaluate(()=>window.v2.editor.execute({kind:"redo"}));expect(await page.evaluate(()=>window.v2.editor.view().documentJson)).toBe(before.document);expect(await page.evaluate(()=>window.v2.errors)).toEqual([]);
});

test("the same toolbar indent outdent controls create a fresh task container without converting earlier rich flow",async({page})=>{
 await ready(page);
 await page.evaluate(()=>{const t=window.v2,e=t.editor;e.execute({kind:"unwrapTaskList",data:{list:"nested-tasks"}});e.execute({kind:"setSelection",selection:t.range("task-b-head",0)});e.focus();});
 const before=await page.evaluate(()=>window.v2.editor.view().documentJson);
 await page.locator('[data-rich-action="indent"]').click();
 const nested=await page.evaluate(()=>{const e=window.v2.editor,task=e.surface.querySelector('[data-rich-task="task-b"]'),list=task.parentElement,parent=list.parentElement.closest("[data-rich-task]");return {id:list.dataset.richBlock,parent:parent.dataset.richTask,previous:list.previousElementSibling.dataset.richText,quote:!!parent.querySelector('[data-rich-block="task-quote"]'),depth:e.view().undoDepth};});
 expect(nested).toMatchObject({parent:"task-a",previous:"task-child-head",quote:true});expect(nested.id).not.toBe("tasks");expect(nested.id).not.toBe("nested-tasks");
 await page.locator('[data-rich-action="outdent"]').click();expect(await page.evaluate(()=>window.v2.editor.view().documentJson)).toBe(before);expect(await page.evaluate(()=>window.v2.errors)).toEqual([]);
});

test("Enter on an empty task head with a rich tail splits rather than dropping its descendants",async({page})=>{
 await ready(page);
 const before=await page.evaluate(()=>{const t=window.v2,e=t.editor,length=e.surface.querySelector('[data-rich-text="task-a-head"]').textContent.length;e.execute({kind:"replaceTextRange",data:{selection:t.range("task-a-head",0,length),text:""}});e.focus();return {document:e.view().documentJson,depth:e.view().undoDepth};});
 await page.keyboard.press("Enter");await expect(page.locator('#editor [data-rich-block="tasks"] > [data-rich-task]')).toHaveCount(3);
 const result=await page.evaluate(()=>{const t=window.v2,e=t.editor,s=e.view().selection,head=e.surface.querySelector(`[data-rich-text="${s.focus.block}"]`),task=head.closest("[data-rich-task]"),after=e.view().documentJson,depth=e.view().undoDepth;e.execute({kind:"undo"});const undo=e.view().documentJson;e.execute({kind:"redo"});return {fresh:task.dataset.richTask!=="task-a",checked:task.querySelector("input").checked,quote:!!task.querySelector('[data-rich-block="task-quote"]'),nested:!!task.querySelector('[data-rich-block="nested-tasks"]'),depth,undo,redo:e.view().documentJson===after,errors:t.errors};});
 expect(result).toEqual({fresh:true,checked:false,quote:true,nested:true,depth:before.depth+1,undo:before.document,redo:true,errors:[]});
});

test("checkbox Tab code Tab and synthetic composing Tab never author task indentation",async({page})=>{
 await ready(page);
 const before=await page.evaluate(()=>{const t=window.v2,e=t.editor;e.execute({kind:"setSelection",selection:t.range("task-b-head",0)});e.focus();e.surface.querySelector('[data-task-check="task-a"]').focus();return {document:e.view().documentJson,depth:e.view().undoDepth};});
 await page.keyboard.press("Tab");expect(await page.evaluate(()=>({document:window.v2.editor.view().documentJson,depth:window.v2.editor.view().undoDepth}))).toEqual(before);
 const composing=await page.evaluate(()=>{const t=window.v2,e=t.editor;e.execute({kind:"setSelection",selection:t.range("task-b-head",0)});e.focus();const event=new KeyboardEvent("keydown",{key:"Tab",isComposing:true,bubbles:true,cancelable:true});e.surface.dispatchEvent(event);return {prevented:event.defaultPrevented,document:e.view().documentJson,depth:e.view().undoDepth};});expect(composing).toEqual({prevented:false,...before});
 const grid=await page.evaluate(()=>{const e=window.v2.editor,table=e.view().tables[0];e.execute({kind:"insertTableColumn",data:{table:table.id,before:null,column:{id:"nav-col",width:120},cells:table.rows.map(row=>({row,cell:{block:`nav-cell-${row}`,column:"nav-col",header:false,body:[{kind:"paragraph",block:`nav-p-${row}`,text:"Nav",formatsJson:"[]"}]}}))}});const cell=e.view().tables[0].cells[0].base;e.execute({kind:"setSelection",selection:{kind:"grid",anchor:cell,focus:cell}});e.surface.querySelector('[data-task-check="task-a"]').focus();return {selection:e.view().selection,document:e.view().documentJson,depth:e.view().undoDepth};});
 for(const key of ["ArrowRight","Backspace","Delete","Tab"]){await page.keyboard.press(key);expect(await page.evaluate(()=>{const e=window.v2.editor;return {selection:e.view().selection,document:e.view().documentJson,depth:e.view().undoDepth};})).toEqual(grid);}
 await page.locator('[data-task-check="task-a"]').click();await expect(page.locator('[data-task-check="task-a"]')).not.toBeChecked();await page.keyboard.press("Meta+z");await expect(page.locator('[data-task-check="task-a"]')).toBeChecked();expect(await page.evaluate(()=>window.v2.editor.view().documentJson)).toBe(grid.document);
 const code=await page.evaluate(()=>{const t=window.v2,e=t.editor;e.execute({kind:"insertBlocks",data:{position:{parent:{kind:"taskItem",block:"task-b"},before:null},blocks:[{kind:"codeBlock",block:"task-code",text:"\tcode",language:null}]}});e.execute({kind:"setSelection",selection:t.range("task-code",1)});e.focus();return {document:e.view().documentJson,depth:e.view().undoDepth};});
 await page.keyboard.press("Tab");expect(await page.evaluate(()=>({document:window.v2.editor.view().documentJson,depth:window.v2.editor.view().undoDepth}))).toEqual(code);expect(await page.evaluate(()=>window.v2.errors)).toEqual([]);
});

test("React task indentation retains one owner across rerender and exact restored future history",async({page})=>{
 await page.goto("/structural-react.html");await expect(page.locator("#ready")).toHaveText("Ready");
 const before=await page.evaluate(()=>{const t=window.v2React,e=t.ref.current.getEditor();t.original=e;e.execute({kind:"setSelection",selection:t.range("task-b-head",1)});e.focus();return e.view().documentJson;});await page.keyboard.press("Tab");
 const saved=await page.evaluate(()=>{window.v2React.save();return window.v2React.ref.current.checkpointJson();});await page.locator("#rerender").click();await expect(page.locator("#count")).toHaveText("1");expect(await page.evaluate(()=>({same:window.v2React.original===window.v2React.ref.current.getEditor(),checkpoint:window.v2React.ref.current.checkpointJson()}))).toEqual({same:true,checkpoint:saved});
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.v2React.ref.current.checkpointJson())).toBe(saved);await page.evaluate(()=>window.v2React.ref.current.focus());await page.keyboard.press("Shift+Tab");expect(await page.evaluate(()=>window.v2React.ref.current.getEditor().view().documentJson)).toBe(before);expect(await page.evaluate(()=>window.v2React.errors)).toEqual([]);
});
