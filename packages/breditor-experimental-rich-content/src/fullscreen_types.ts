/** Browser presentation only. No document/command/journal capability is implied. */
export interface RichFullscreenHostState {readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean}
export interface RichFullscreenHost {
 readonly surface:HTMLElement;
 readonly fullscreenRoot:HTMLElement;
 fullscreenState():RichFullscreenHostState;
 subscribeFullscreen(listener:()=>void):()=>void;
 /** Restore the current native selection only at this exact unchanged publication. */
 focusFullscreen(revision:string):void;
}
export interface RichFullscreenOptions {target?:HTMLElement;navigationUI?:"auto"|"show"|"hide";onError?:(error:unknown)=>void}
export interface RichFullscreenState extends RichFullscreenHostState {
 readonly supported:boolean;readonly active:boolean;readonly foreign:boolean;
 readonly phase:"idle"|"entering"|"active"|"exiting"|"retiring"|"disposed";
 readonly retiring:boolean;readonly disposed:boolean;readonly error:string|null;
}
/** Explicit native lifetime. Controls/React borrow this controller, never its editor. */
export interface RichFullscreenController {
 readonly target:HTMLElement;readonly surface:HTMLElement;
 state():RichFullscreenState;subscribe(listener:()=>void):()=>void;
 enter(revision?:string):Promise<void>;exit():Promise<void>;toggle(revision?:string):Promise<void>;
 /** Await before replacing the controller; failed cleanup retains ownership and can be retried. */
 dispose():Promise<void>;
}
