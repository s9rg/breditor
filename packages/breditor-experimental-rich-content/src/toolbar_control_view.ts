/** Shared DOM widgets only. Commands and authoritative state stay with their owner. */
export interface RichToolbarField {
 readonly id:string;readonly label:string;readonly type:"text"|"number"|"select";
 readonly options?:readonly {readonly value:string;readonly label:string}[];
 readonly min?:number;readonly max?:number;readonly maxLength?:number;readonly placeholder?:string;
 /** Optional field dependency; disabled values are retained as draft but never block form validation. */
 readonly enabledWhen?:Readonly<{field:string;value:string}>;
}
export interface RichToolbarReading {
 readonly kind:"unavailable"|"unset"|"uniform"|"mixed";
 readonly values?:Readonly<Record<string,string>>;
 readonly pressed?:boolean|"mixed";
}
export interface RichControlPresentation<C> {
 readonly id:string;readonly label:string;readonly type?:"text"|"number";
 readonly fields?:readonly RichToolbarField[];readonly shortcut?:string;
 readonly mixedHint?:string;
 readonly read?:(context:C)=>RichToolbarReading;readonly value?:(context:C)=>string;
}
export interface RichControlView<C> {
 readonly button:HTMLButtonElement;readonly control:RichControlPresentation<C>;
 refresh(context:C,enabled:boolean,stamp:string):void;
 activate():void;
}
/** Scoped to coordinator toolbar widgets, never document content. */
export const toolbarControlStyles=`:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control{display:inline-flex;gap:4px;align-items:end}:is([data-breditor-rich],[data-breditor-shared]) details.breditor-inline-control{display:block;border:1px solid #a5b9af;border-radius:4px;padding:5px 8px;background:white}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control summary{cursor:pointer;font-size:13px}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control[open]>:not(summary){margin-top:6px}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control select{padding:5px;max-width:180px}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control small{display:block;max-width:210px}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control small[hidden]{display:none}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control [aria-pressed=true]{background:#cde9dd}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control [aria-pressed=mixed]{border-style:dashed}:is([data-breditor-rich],[data-breditor-shared]) .breditor-inline-control[data-stale]{outline:2px dashed #aa6b20}`;
export function mountToolbarControl<C>(toolbar:HTMLElement,control:RichControlPresentation<C>,hooks:{
 prefix:"rich"|"shared";signal:AbortSignal;sync:()=>void;stamp:()=>string;
 run:(value:string|undefined,fields:Readonly<Record<string,string>>)=>void;
 attempt:(work:()=>void)=>void;focus:()=>void;
}):RichControlView<C>{
 const d=toolbar.ownerDocument,button=d.createElement("button"),fields=new Map<string,HTMLInputElement|HTMLSelectElement>();
 const panel=control.fields?d.createElement("details"):undefined,container=panel??d.createElement("span");
 container.dataset[`${hooks.prefix}Control`]=control.id;container.className="breditor-inline-control";
 let summary:HTMLElement|undefined;
 if(panel){summary=d.createElement("summary");summary.textContent=control.label;summary.setAttribute("aria-label",`${control.label} formatting`);panel.append(summary);}
 const definitions:readonly RichToolbarField[]=control.fields??(control.type?[{id:"value",label:control.label,type:control.type}]:[]);
 if(definitions.length>8)throw Error("Too many toolbar fields");
 for(const field of definitions)if(field.enabledWhen&&!definitions.some(other=>other.id===field.enabledWhen!.field))throw Error("Unknown toolbar field dependency");
 for(const field of definitions){
  if(fields.has(field.id))throw Error("Duplicate toolbar field");
  const label=d.createElement("label");label.textContent=field.label;
  const input=field.type==="select"?d.createElement("select"):d.createElement("input");
  if(input instanceof HTMLInputElement){input.type=field.type;input.placeholder=field.placeholder??"";if(field.min!==undefined)input.min=String(field.min);if(field.max!==undefined)input.max=String(field.max);if(field.maxLength!==undefined)input.maxLength=field.maxLength;}
  else{const blank=d.createElement("option");blank.value="";blank.textContent="Choose…";input.append(blank);for(const option of field.options??[]){const node=d.createElement("option");node.value=option.value;node.textContent=option.label;input.append(node);}}
  input.dataset[`${hooks.prefix}Field`]=control.fields?`${control.id}-${field.id}`:control.id;input.setAttribute("aria-label",field.label);label.append(input);container.append(label);fields.set(field.id,input);
 }
 button.type="button";button.textContent=definitions.length?`Apply ${control.label}`:control.label;button.dataset[`${hooks.prefix}Action`]=control.id;container.append(button);
 const help=d.createElement("small");help.hidden=true;help.textContent=control.mixedHint??"Mixed values: applying replaces this complete format.";if(panel)container.append(help);
 toolbar.append(container);
 let lastStamp="",draft:string|undefined,enabled=false,lastContext:C,lastReading:RichToolbarReading|undefined;
 const write=()=>{
  container.dataset["state"]=lastReading?.kind??"unset";help.hidden=lastReading?.kind!=="mixed";
  if(lastReading?.pressed!==undefined)button.setAttribute("aria-pressed",String(lastReading.pressed));else button.removeAttribute("aria-pressed");
  for(const [id,input]of fields){if(draft===undefined){input.value=enabled?(lastReading?.values?.[id]??(id==="value"?control.value?.(lastContext)??"":"")):"";if(input instanceof HTMLInputElement)input.placeholder=lastReading?.kind==="mixed"?"Mixed":definitions.find(field=>field.id===id)?.placeholder??"";else if(input.options[0])input.options[0].textContent=lastReading?.kind==="mixed"?"Mixed — choose…":"Choose…";}}
  for(const [id,input]of fields){const dependency=definitions.find(field=>field.id===id)?.enabledWhen;input.disabled=!enabled||dependency!==undefined&&fields.get(dependency.field)?.value!==dependency.value;}
  button.disabled=!enabled;if(summary){summary.setAttribute("aria-disabled",String(!enabled));summary.tabIndex=enabled?0:-1;}
  container.toggleAttribute("data-stale",draft!==undefined&&draft!==lastStamp);
 };
 const submit=()=>hooks.attempt(()=>{
  if(!enabled)return;
  if(draft!==undefined&&draft!==hooks.stamp())throw Error("Formatting form is stale. Press Escape and reopen it.");
  for(const input of fields.values())if(!input.checkValidity()){input.reportValidity();return;}
  const values=Object.freeze(Object.fromEntries([...fields].map(([id,input])=>[id,input.value])));
  hooks.run(fields.get("value")?.value,values);draft=undefined;write();if(panel)panel.open=false;if(!hooks.signal.aborted)hooks.focus();
 });
 container.addEventListener("pointerdown",event=>hooks.attempt(()=>{if(!definitions.length)event.preventDefault();hooks.sync();}),{signal:hooks.signal});
 summary?.addEventListener("click",event=>{if(!enabled)event.preventDefault();},{signal:hooks.signal});
 button.addEventListener("click",submit,{signal:hooks.signal});
 for(const input of fields.values()){
  const dirty=()=>{draft??=lastStamp;write();};input.addEventListener("input",dirty,{signal:hooks.signal});input.addEventListener("change",dirty,{signal:hooks.signal});
 }
 container.addEventListener("keydown",event=>{
  if(event.isComposing)return;
  if(event.key==="Escape"){event.preventDefault();draft=undefined;write();if(panel)panel.open=false;hooks.focus();}
  else if(event.key==="Enter"&&fields.size&&event.target!==summary&&event.target!==button){event.preventDefault();submit();}
 },{signal:hooks.signal});
 return {control,button,refresh(context,nextEnabled,stamp){lastContext=context;lastStamp=stamp;enabled=nextEnabled;lastReading=control.read?.(context);write();},activate(){if(!enabled)return;if(panel){panel.open=true;fields.values().next().value?.focus();}else submit();}};
}
