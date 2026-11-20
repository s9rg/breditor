/** @internal React panel fallbacks: catalog text and chrome-only dir/lang for a start failure. */
import {defaultRichUi,resolveRichUi,type RichUiLocale,type RichUiOptions} from "@breditor/experimental-rich-content";
/** A failed or invalid catalog read falls back to English; the mount itself reports the real failure. */
export function panelLocale(read:()=>RichUiLocale|RichUiOptions|undefined):RichUiLocale{try{return resolveRichUi(read());}catch{return defaultRichUi;}}
export function chromeAttributes(ui:RichUiLocale):{dir?:"ltr"|"rtl";lang?:string}{return {...(ui.direction?{dir:ui.direction}:{}),...(ui.lang?{lang:ui.lang}:{})};}
