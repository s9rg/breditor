/**
 * Read-only keyboard shortcut registry of a rich DOM coordinator (docs/EDITOR_SHELL.md). It describes the chords the
 * coordinator and its mounted opt-in presentations already own; it never installs a listener, routes a command or
 * changes what a key does. The help dialog renders exactly this list.
 */
import type {RichUiLocale} from "./ui_locale.js";
/** One physical chord. `primary` is Ctrl, or Command on Apple platforms (the coordinators accept either). */
export interface RichShortcutChord {readonly key:string;readonly primary?:true;readonly alt?:true;readonly shift?:true}
export type RichShortcutGroup="history"|"formatting"|"blocks"|"navigation"|"commands"|"interface";
export interface RichShortcutEntry {
 /** Stable identity: `control:<id>` for admitted toolbar controls, a built-in name, or `ui:<name>` for presentations. */
 readonly id:string;readonly group:RichShortcutGroup;
 /** Localized at registration from the editor's chrome catalog (or the control's catalog label). */
 readonly label:string;
 /** Alternative chords for the same action, in display order. */
 readonly keys:readonly RichShortcutChord[];
}
export const richShortcutGroups:readonly RichShortcutGroup[]=Object.freeze(["history","formatting","blocks","navigation","commands","interface"]);
const inlineControls=new Set(["bold","italic","underline","strike","code","subscript","superscript","link","unlink","clear-inline"]);
const chord=(key:string,mods:{primary?:boolean;alt?:boolean;shift?:boolean}={}):RichShortcutChord=>Object.freeze({key,...(mods.primary?{primary:true as const}:{}),...(mods.alt?{alt:true as const}:{}),...(mods.shift?{shift:true as const}:{})});
const signature=(c:RichShortcutChord)=>`${c.primary?"p":""}${c.alt?"a":""}${c.shift?"s":""}:${c.key}`;
/** Parse a toolbar control's existing `shortcut` (`"b"`, `"shift+x"`, `"enter"`): the primary modifier is implied. */
export function richControlShortcutChord(shortcut:string):RichShortcutChord|undefined{
 const match=/^(shift\+)?([a-z0-9]|enter)$/.exec(shortcut);if(!match)return undefined;
 const key=match[2]==="enter"?"Enter":match[2]!.toUpperCase();return chord(key,{primary:true,shift:!!match[1]});
}
/** Facts a coordinator already uses in its own keydown routing. */
export interface RichCoordinatorShortcutFacts {
 readonly ui:RichUiLocale;
 readonly controls:readonly {readonly id:string;readonly label:string;readonly shortcut?:string|undefined}[];
 readonly structural:boolean;readonly selectionFormatting:boolean;readonly flowNavigation:boolean;readonly blockLayout:boolean;
}
/**
 * The chords a coordinator's keydown handler owns, in its own precedence order: admitted control shortcuts first
 * (they win over the built-in Bold/Undo/Redo fallbacks), then the built-ins its capabilities enable.
 */
export function richCoordinatorShortcuts(facts:RichCoordinatorShortcutFacts):readonly RichShortcutEntry[]{
 const ui=facts.ui,taken=new Set<string>(),entries:RichShortcutEntry[]=[];
 const add=(id:string,group:RichShortcutGroup,label:string,keys:readonly RichShortcutChord[])=>{
  const free=keys.filter(key=>!taken.has(signature(key)));if(!free.length)return;
  for(const key of free)taken.add(signature(key));entries.push(Object.freeze({id,group,label,keys:Object.freeze(free)}));
 };
 for(const control of facts.controls){
  const key=control.shortcut===undefined?undefined:richControlShortcutChord(control.shortcut);if(!key)continue;
  add(`control:${control.id}`,inlineControls.has(control.id)?"formatting":"commands",ui.control(control as {id:string;label:string}).label,[key]);
 }
 add("undo","history",ui.text("shortcutUndo"),[chord("Z",{primary:true})]);
 add("redo","history",ui.text("shortcutRedo"),[chord("Y",{primary:true}),chord("Z",{primary:true,shift:true})]);
 add("bold","formatting",ui.text("shortcutBold"),[chord("B",{primary:true})]);
 if(facts.structural&&facts.selectionFormatting){
  add("italic","formatting",ui.text("shortcutItalic"),[chord("I",{primary:true})]);
  add("underline","formatting",ui.text("shortcutUnderline"),[chord("U",{primary:true})]);
  add("strike","formatting",ui.text("shortcutStrike"),[chord("X",{primary:true,shift:true})]);
 }
 add("select-all","navigation",ui.text("shortcutSelectAll"),[chord("A",{primary:true})]);
 add("hard-break","blocks",ui.text("shortcutHardBreak"),[chord("Enter",{shift:true})]);
 if(facts.structural)add("exit-code","blocks",ui.text("shortcutExitCode"),[chord("Enter",{primary:true})]);
 if(facts.blockLayout){
  add("align-left","blocks",ui.text("shortcutAlignLeft"),[chord("L",{primary:true,shift:true})]);
  add("align-center","blocks",ui.text("shortcutAlignCenter"),[chord("E",{primary:true,shift:true})]);
  add("align-right","blocks",ui.text("shortcutAlignRight"),[chord("R",{primary:true,shift:true})]);
  add("align-justify","blocks",ui.text("shortcutAlignJustify"),[chord("J",{primary:true,shift:true})]);
 }
 if(facts.structural&&facts.flowNavigation){
  add("flow-before","navigation",ui.text("shortcutFlowBefore"),[chord("PageUp",{alt:true})]);
  add("flow-after","navigation",ui.text("shortcutFlowAfter"),[chord("PageDown",{alt:true})]);
 }
 return Object.freeze(entries);
}

// ---- Presentation registrations (opt-in widgets announce the chords they install) ----
const presentations=new WeakMap<HTMLElement,Map<string,{entry:RichShortcutEntry;count:number}>>();
/** @internal An opt-in presentation records a chord it listens for on `surface`; the returned function releases it. */
export function registerRichPresentationShortcut(surface:HTMLElement,entry:RichShortcutEntry):()=>void{
 const map=presentations.get(surface)??new Map<string,{entry:RichShortcutEntry;count:number}>();presentations.set(surface,map);
 const frozen=Object.freeze({...entry,keys:Object.freeze(entry.keys.map(key=>chord(key.key,key)))}),held=map.get(entry.id);
 if(held)held.count++;else map.set(entry.id,{entry:frozen,count:1});
 let released=false;
 return ()=>{if(released)return;released=true;const current=map.get(entry.id);if(current&&--current.count<=0)map.delete(entry.id);};
}
/** Every chord currently active for one editor: the coordinator's own list followed by mounted presentations. */
export function richActiveShortcuts(host:{readonly surface:HTMLElement;contextShortcuts?():readonly RichShortcutEntry[]}):readonly RichShortcutEntry[]{
 const own=host.contextShortcuts?.()??[],seen=new Set(own.map(entry=>entry.id));
 const extra=[...(presentations.get(host.surface)?.values()??[])].map(item=>item.entry).filter(entry=>!seen.has(entry.id));
 return Object.freeze([...own,...extra]);
}

// ---- Shell chords (menu bar focus, help) ----
/** `Alt+0`…`Alt+9` or `Alt+F1`…`Alt+F12`, optionally `Alt+Shift+…`. Alt+F10 (toolbars) is reserved. */
export function parseRichShellShortcut(value:unknown,what:string):RichShortcutChord{
 const match=typeof value==="string"?/^Alt\+(Shift\+)?([0-9]|F(?:[1-9]|1[0-2]))$/.exec(value):null;
 if(!match)throw new TypeError(`Expected ${what} to be Alt+<digit> or Alt+F1…F12 (optionally Alt+Shift+…)`);
 if(match[2]==="F10")throw new TypeError(`${what} cannot use Alt+F10, which focuses the floating toolbars`);
 return chord(match[2]!,{alt:true,shift:!!match[1]});
}
export function matchesRichShellShortcut(event:KeyboardEvent,key:RichShortcutChord):boolean{
 if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey!==!!key.shift||event.isComposing)return false;
 // Digits use the physical code: Option+0 on macOS produces "º" as `key`.
 return /^[0-9]$/.test(key.key)?event.code===`Digit${key.key}`:event.key===key.key;
}

// ---- Display ----
export type RichShortcutPlatform="apple"|"other";
export function detectRichShortcutPlatform(realm:unknown):RichShortcutPlatform{
 let platform="";try{const n=(realm as {navigator?:{platform?:string;userAgentData?:{platform?:string}}}|null|undefined)?.navigator;platform=String(n?.userAgentData?.platform??n?.platform??"");}catch{/* Presentation only. */}
 return /mac|iphone|ipad|ipod/i.test(platform)?"apple":"other";
}
const symbols:Readonly<Record<string,string>>={ArrowUp:"↑",ArrowDown:"↓",ArrowLeft:"←",ArrowRight:"→",PageUp:"Page Up",PageDown:"Page Down",Escape:"Esc",ContextMenu:"Menu"};
const spoken:Readonly<Record<string,string>>={ArrowUp:"Up Arrow",ArrowDown:"Down Arrow",ArrowLeft:"Left Arrow",ArrowRight:"Right Arrow",PageUp:"Page Up",PageDown:"Page Down",Escape:"Escape",ContextMenu:"Menu"};
/** Visible text (`⌘⇧Z` or `Ctrl+Shift+Z`) and a spelled-out accessible name (`Command+Shift+Z`). */
export function formatRichShortcut(key:RichShortcutChord,platform:RichShortcutPlatform,ui:RichUiLocale):{readonly text:string;readonly label:string}{
 const names:string[]=[];
 if(platform==="apple"){
  if(key.alt)names.push(ui.text("keyOption"));if(key.shift)names.push(ui.text("keyShift"));if(key.primary)names.push(ui.text("keyCommand"));
  return Object.freeze({text:`${key.alt?"⌥":""}${key.shift?"⇧":""}${key.primary?"⌘":""}${symbols[key.key]??key.key}`,label:[...names,spoken[key.key]??key.key].join("+")});
 }
 if(key.primary)names.push(ui.text("keyControl"));if(key.alt)names.push(ui.text("keyAlt"));if(key.shift)names.push(ui.text("keyShift"));
 return Object.freeze({text:[...names,symbols[key.key]??key.key].join("+"),label:[...names,spoken[key.key]??key.key].join("+")});
}
