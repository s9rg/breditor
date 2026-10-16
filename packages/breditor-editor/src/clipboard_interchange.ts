import {requireClipboardInterchange,type RichClipboardInterchange} from "@breditor/experimental-rich-content/rendering";
export type ClipboardInterchangeFactory<Core>=(core:Core)=>RichClipboardInterchange;
/** Bind the optional adapter to this actual native owner before any host DOM mutation. */
export function clipboardInterchangeOptions<Core extends {supportsClipboardInterchange?():boolean}>(factory:ClipboardInterchangeFactory<Core>|undefined,core:Core):{clipboardInterchange?:RichClipboardInterchange} {
 if(factory===undefined)return{};
 if(typeof factory!=="function")throw new TypeError("Expected a clipboard interchange factory");
 const value=factory(core);if(!value)throw new TypeError("Clipboard interchange factory must return an adapter");
 return{clipboardInterchange:requireClipboardInterchange(value,core)!};
}
