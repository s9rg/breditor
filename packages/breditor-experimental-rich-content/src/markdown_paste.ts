/**
 * Opt-in automatic Markdown paste for the local and shared DOM coordinators (docs/RICH_INTERCHANGE.md,
 * "Automatic Markdown paste"). The coordinator owns the immutable `markdownPaste` option, the one-shot
 * paste-as-plain-text escape (primary+Shift+V), the post-paste report and the optional built-in notice.
 * It never edits the document itself: conversion goes through the explicit interchange port and one native
 * paste, and "Undo to plain text" is the host's ordinary native Undo followed by one literal paste.
 */
import type {ClipboardInput,ClipboardPlainTextMode,RichClipboardInterchange} from "./clipboard_interchange.js";
import {markdownPasteDetectorV1,type MarkdownPasteSignal} from "./markdown_paste_detection.js";
import type {RichUiLocale} from "./ui_locale.js";

/** `literal` (the default) never guesses; `detect` runs `markdown-paste-detect-v1` on a text/plain-only paste. */
export type RichMarkdownPasteOption="literal"|"detect";
/** Frozen, content-free record of one accepted automatic conversion. */
export interface RichMarkdownPasteReport {
 readonly format:"breditor/markdown-paste-report";readonly formatVersion:1;
 readonly detector:typeof markdownPasteDetectorV1;
 /** Revision the paste was prepared from, and the revision the accepted paste published. */
 readonly sourceRevision:string;readonly revision:string;
 readonly score:number;readonly signals:readonly MarkdownPasteSignal[];
}
export interface RichMarkdownPasteEvent {
 readonly report:RichMarkdownPasteReport;
 /**
  * Replace the conversion with the literal clipboard text: one native Undo of the paste, then one literal paste
  * at the restored selection. Returns false, changing nothing, once used, after any later publication (local,
  * remote or policy), while the editor is busy, composing, read-only or disposed.
  */
 undoToPlainText():boolean;
}
/** Snapshot and validate the option at mount. Detection needs the explicit interchange port. */
export function requireMarkdownPaste(option:RichMarkdownPasteOption|undefined,interchange:RichClipboardInterchange|undefined,notice?:boolean):boolean {
 if(notice!==undefined&&typeof notice!=="boolean")throw new TypeError("Expected markdownPasteNotice to be a boolean");
 if(option===undefined||option==="literal")return false;
 if(option!=="detect")throw new TypeError("Expected markdownPaste literal or detect");
 if(!interchange)throw Error("markdownPaste detect requires the explicit clipboardInterchange port");
 return true;
}
/** Ctrl+Shift+V, or Command+Shift+V on Apple platforms. Alt/Option chords are left to the browser. */
export function isPastePlainChord(event:Pick<KeyboardEvent,"key"|"ctrlKey"|"metaKey"|"shiftKey"|"altKey">):boolean {
 return (event.ctrlKey||event.metaKey)&&event.shiftKey&&!event.altKey&&event.key.toLowerCase()==="v";
}
export interface MarkdownPasteHost {
 readonly ui:RichUiLocale;
 /** The coordinator's status line; the notice is placed right after it. */
 readonly anchor:HTMLElement;
 readonly notice:boolean;
 readonly onEvent:((event:RichMarkdownPasteEvent)=>void)|undefined;
 readonly report:(error:unknown)=>void;
 readonly signal:AbortSignal;
}
/** @internal One coordinator's paste mode, escape flag and notice. */
export class MarkdownPasteSession {
 readonly enabled:boolean;
 #host:MarkdownPasteHost;#literal=false;#notice:HTMLDivElement|undefined;#shown:string|undefined;
 constructor(enabled:boolean,host:MarkdownPasteHost){this.enabled=enabled;this.#host=host;}
 /** Arm the one-shot escape on primary+Shift+V; any other key disarms it. */
 keydown(event:KeyboardEvent):void {if(this.enabled)this.#literal=isPastePlainChord(event);}
 /**
  * Browsers that deliver no paste event for the chord (Chrome and Safari on macOS) fall back to an explicit
  * `navigator.clipboard.readText()`, which the browser may refuse; a refusal pastes nothing.
  */
 keyup(event:KeyboardEvent,paste:(text:string)=>void):void {
  if(!this.#literal||event.key.toLowerCase()!=="v")return;this.#literal=false;
  const clipboard=this.#host.anchor.ownerDocument.defaultView?.navigator.clipboard;
  if(typeof clipboard?.readText!=="function")return;
  void clipboard.readText().then(text=>{if(!this.#host.signal.aborted&&text)paste(text);},()=>{/* Refused clipboard read: nothing was pasted. */});
 }
 /** Consume the escape for this paste event. */
 mode():ClipboardPlainTextMode {const literal=this.#literal;this.#literal=false;return !this.enabled?"default":literal?"literal":"detect";}
 /** After the native paste was accepted. Builds the report, shows the notice and calls the host. */
 accepted(input:ClipboardInput,sourceRevision:string,revision:string,display:boolean,undo:(revision:string,plain:string)=>boolean):void {
  const detected=input.markdownPaste;if(!detected||this.#host.signal.aborted)return;
  const report:RichMarkdownPasteReport=Object.freeze({format:"breditor/markdown-paste-report",formatVersion:1,detector:detected.detection.detector,sourceRevision,revision,score:detected.detection.score,signals:detected.detection.signals});
  let used=false;
  const event:RichMarkdownPasteEvent=Object.freeze({report,undoToPlainText:()=>{
   if(used)return false;const applied=undo(revision,detected.plain);if(applied){used=true;this.#hide();}return applied;
  }});
  if(display&&this.#host.notice)this.#show(revision,event);
  try{this.#host.onEvent?.(event);}catch(error){this.#host.report(error);}
 }
 /** Any later publication retires the visible notice; its Undo would be stale. */
 sync(revision:string):void {if(this.#shown!==undefined&&this.#shown!==revision)this.#hide();}
 #show(revision:string,event:RichMarkdownPasteEvent):void {
  const ui=this.#host.ui,document=this.#host.anchor.ownerDocument;
  if(!this.#notice){
   const notice=document.createElement("div");notice.className="breditor-markdown-paste-notice";notice.setAttribute("role","status");notice.hidden=true;ui.applyChrome(notice);
   const text=document.createElement("span"),button=document.createElement("button");button.type="button";
   notice.append(text," ",button);this.#host.anchor.after(notice);this.#notice=notice;
   this.#host.signal.addEventListener("abort",()=>notice.remove(),{once:true});
  }
  const notice=this.#notice,text=notice.firstChild!,button=notice.querySelector("button")!;
  text.textContent=ui.text("markdownPasteNotice");button.textContent=ui.text("markdownPasteUndo");
  button.onclick=()=>{if(!event.undoToPlainText())this.#hide();};
  notice.hidden=false;this.#shown=revision;
 }
 #hide():void {if(this.#notice){this.#notice.hidden=true;const button=this.#notice.querySelector("button");if(button)button.onclick=null;}this.#shown=undefined;}
}
