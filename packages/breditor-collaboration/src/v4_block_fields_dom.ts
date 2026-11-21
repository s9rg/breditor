/** Shared V4 block-field presentation in the live surface, matching the local V4 controller: bookmarks
 * and internal links render (`id="bm-<name>"`, `data-rich-internal-link`), internal links and section
 * summaries are inert while editing, and a browser-initiated `<details>` toggle reverts to document state. */
type BookmarkCore={supportsBookmarks?():boolean};
/** Render options for the shared surface: bookmark attributes only for V4 block-field owners. */
export function sharedV4RenderOptions<O extends object>(core:BookmarkCore,options:O):O&{bookmarks?:boolean}{return core.supportsBookmarks?.()===true?{...options,bookmarks:true}:options;}
export function mountSharedV4BlockFieldDom(surface:HTMLElement,core:BookmarkCore,model:()=>{readonly view:{readonly readOnly?:boolean};readonly nodes:ReadonlyMap<string,{readonly properties:Readonly<Record<string,unknown>>}>},signal:AbortSignal):void{
 if(core.supportsBookmarks?.()!==true)return;
 const editing=()=>model().view.readOnly!==true;
 const inert=(event:Event)=>{const target=event.target;if(editing()&&target instanceof Element&&(target.closest("a[data-rich-internal-link]")||target.closest("details[data-rich-details]>summary[data-rich-text]")))event.preventDefault();};
 for(const type of ["click","auxclick"])surface.addEventListener(type,inert,{capture:true,signal});
 surface.addEventListener("toggle",event=>{
  const details=event.target;if(!editing()||!(details instanceof HTMLDetailsElement)||details.dataset["richDetails"]===undefined)return;
  const open=model().nodes.get(details.dataset["richDetails"])?.properties["breditor/details-open"]===true;if(details.open!==open)details.open=open;
 },{capture:true,signal});
}
