/** Separate named DOM intents. Opaque results are never detached through JSON or added to execute. */
import type {RichCoreEditor,RichSelectionPolicy,RichSearchResults,RichSearchReplacement,RichCommandOutcome} from "./core.js";
export type RichSearchIntent=
 |{kind:"select";results:RichSearchResults;index:string}
 |{kind:"replaceOne";results:RichSearchResults;index:string;replacement:RichSearchReplacement}
 |{kind:"replaceAll";results:RichSearchResults;replacement:RichSearchReplacement};
export function publishRichSearchIntent<P extends RichSelectionPolicy>(core:RichCoreEditor<P>,intent:RichSearchIntent,revision:string):RichCommandOutcome {
 if(core.supportsSearch?.()!==true||!core.selectSearchMatch||!core.replaceSearchOne||!core.replaceSearchAll)throw Error("Use complete matching native search capabilities");
 if(intent.kind==="select")return core.selectSearchMatch(intent.results,intent.index,revision);
 if(intent.kind==="replaceOne")return core.replaceSearchOne(intent.results,intent.index,intent.replacement,revision);
 return core.replaceSearchAll(intent.results,intent.replacement,revision);
}
