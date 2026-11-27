/**
 * Declarative layout of a coordinator's standard toolbar (docs/TOOLBAR_LAYOUT.md).
 *
 * Presentation only: a layout arranges controls the coordinator already admitted. It never adds, removes,
 * rebinds or wraps a control, so every item keeps its widget, Rust-derived state, gating, command path and
 * Undo step. The whole layout is validated before the coordinator touches its host.
 */

/** Visual separator between neighbouring items (`"|"` in the string shorthand). */
export interface RichToolbarSeparator {readonly kind:"separator"}
/** Explicit row break (`"-"` in the string shorthand). Not combinable with `groupWhenFull`. */
export interface RichToolbarRowBreak {readonly kind:"break"}
/** Dropdown action group: one button that discloses admitted controls and shows their aggregated state. */
export interface RichToolbarGroup {readonly kind:"group";readonly id:string;readonly label:string;readonly items:readonly string[]}
/** A control id, `"|"`, `"-"`, or a typed separator/break/group object. */
export type RichToolbarLayoutEntry=string|RichToolbarSeparator|RichToolbarRowBreak|RichToolbarGroup;
export interface RichToolbarLayout {
 readonly items:readonly RichToolbarLayoutEntry[];
 /** Opt-in: trailing items that do not fit move into a "Show more items" button. Single row only. */
 readonly groupWhenFull?:boolean;
}
/** Maximum entries (controls, separators, breaks and groups) in one layout. */
export const RICH_TOOLBAR_LAYOUT_MAX_ENTRIES=128;
/** Maximum controls in one dropdown group. */
export const RICH_TOOLBAR_GROUP_MAX_ITEMS=32;

/** @internal Validated, frozen arrangement. Unlisted admitted controls follow the listed items. */
export type RichToolbarPlanItem=
 {readonly kind:"control";readonly id:string}|
 {readonly kind:"separator"}|
 {readonly kind:"group";readonly id:string;readonly label:string;readonly items:readonly string[]};
/** @internal */
export interface RichToolbarPlan {readonly rows:readonly (readonly RichToolbarPlanItem[])[];readonly groupWhenFull:boolean}

const GROUP_ID=/^[a-z][a-z0-9-]{0,63}$/u;
function ownData(value:object,allowed:readonly string[],what:string):Readonly<Record<string,unknown>>{
 if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new TypeError(`Expected a plain ${what} object`);
 const out:Record<string,unknown>={};
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=="string"||!allowed.includes(key))throw new TypeError(`Unknown ${what} field ${String(key)}`);
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!("value" in descriptor))throw new TypeError(`Expected a data field ${key} in the ${what}`);
  out[key]=descriptor.value;
 }
 return out;
}
function list(value:unknown,max:number,what:string):readonly unknown[]{
 if(!Array.isArray(value)||value.length===0||value.length>max)throw new TypeError(`Expected 1 to ${max} ${what}`);
 return Array.from({length:value.length},(_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,index);if(!descriptor||!("value" in descriptor))throw new TypeError(`Expected dense ${what}`);return descriptor.value as unknown;});
}

/**
 * Validates `layout` against the coordinator's admitted control ids (in admission order).
 * Throws `TypeError` for malformed shapes and `Error` for unknown or repeated controls; never mutates DOM.
 */
export function planRichToolbarLayout(layout:unknown,admitted:readonly string[]):RichToolbarPlan{
 if(typeof layout!=="object"||layout===null||Array.isArray(layout))throw new TypeError("Expected a toolbar layout object");
 const fields=ownData(layout,["items","groupWhenFull"],"toolbar layout");
 if(fields["groupWhenFull"]!==undefined&&typeof fields["groupWhenFull"]!=="boolean")throw new TypeError("Expected boolean groupWhenFull");
 const groupWhenFull=fields["groupWhenFull"]===true,entries=list(fields["items"],RICH_TOOLBAR_LAYOUT_MAX_ENTRIES,"toolbar layout items");
 const admittedSet=new Set(admitted),used=new Set<string>(),groups=new Set<string>();
 const control=(id:unknown):string=>{
  if(typeof id!=="string"||!id)throw new TypeError("Expected a nonempty toolbar control id");
  if(!admittedSet.has(id))throw Error(`Toolbar control ${id} is not admitted by this editor`);
  if(used.has(id))throw Error(`Toolbar control ${id} appears more than once in the toolbar layout`);
  used.add(id);return id;
 };
 const rows:RichToolbarPlanItem[][]=[[]];
 const separator=()=>{const row=rows[rows.length-1]!,last=row[row.length-1];if(!last||last.kind==="separator")throw new TypeError("A toolbar separator must follow an item");row.push(Object.freeze({kind:"separator"}));};
 const rowBreak=()=>{if(groupWhenFull)throw new TypeError("groupWhenFull cannot be combined with explicit row breaks");const row=rows[rows.length-1]!;if(!row.length)throw new TypeError("A toolbar row break must follow an item");if(row[row.length-1]!.kind==="separator")throw new TypeError("A toolbar row cannot end with a separator");rows.push([]);};
 for(const entry of entries){
  if(entry==="|"){separator();continue;}
  if(entry==="-"){rowBreak();continue;}
  if(typeof entry==="string"){rows[rows.length-1]!.push(Object.freeze({kind:"control",id:control(entry)}));continue;}
  if(typeof entry!=="object"||entry===null||Array.isArray(entry))throw new TypeError("Expected a toolbar layout entry");
  const kind=Object.getOwnPropertyDescriptor(entry,"kind")?.value;
  if(kind==="separator"){ownData(entry,["kind"],"toolbar separator");separator();continue;}
  if(kind==="break"){ownData(entry,["kind"],"toolbar row break");rowBreak();continue;}
  if(kind!=="group")throw new TypeError("Expected a toolbar layout entry kind separator, break or group");
  const group=ownData(entry,["kind","id","label","items"],"toolbar group"),id=group["id"],label=group["label"];
  if(typeof id!=="string"||!GROUP_ID.test(id))throw new TypeError("Expected a lowercase toolbar group id");
  if(groups.has(id)||admittedSet.has(id))throw Error(`Toolbar group id ${id} is not unique`);
  if(typeof label!=="string"||!label.trim()||label.length>256)throw new TypeError("Expected a nonempty bounded toolbar group label");
  groups.add(id);
  const items=Object.freeze(list(group["items"],RICH_TOOLBAR_GROUP_MAX_ITEMS,"toolbar group items").map(control));
  rows[rows.length-1]!.push(Object.freeze({kind:"group",id,label,items}));
 }
 const last=rows[rows.length-1]!;
 if(!last.length)throw new TypeError("A toolbar layout cannot end with a row break");
 if(last[last.length-1]!.kind==="separator")throw new TypeError("A toolbar row cannot end with a separator");
 const rest=admitted.filter(id=>!used.has(id));
 if(rest.length){last.push(Object.freeze({kind:"separator"}));for(const id of rest)last.push(Object.freeze({kind:"control",id:control(id)}));}
 return Object.freeze({rows:Object.freeze(rows.map(row=>Object.freeze(row))),groupWhenFull});
}
