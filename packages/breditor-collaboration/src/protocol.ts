/** Exact original protocol pairs; neither a schema name nor a version range selects a language. */
export type SharedProtocolBinding=
 |{abiVersion:1;modelVersion:11;journalVersion:12;richLanguageVersion?:never;blockLayoutVersion?:never}
 |{abiVersion:1;modelVersion:12;journalVersion:13;richLanguageVersion:2;blockLayoutVersion?:never}
 |{abiVersion:1;modelVersion:13;journalVersion:14;richLanguageVersion:3;blockLayoutVersion:1}
 |({abiVersion:1;modelVersion:14;journalVersion:15;richLanguageVersion:4;blockLayoutVersion:1}&{readonly [K in SharedV4SliceVersion]:1});
/** Explicit shared rich languages. 4 is the frozen V4 grammar with causal model 14 and journal 15. */
export type SharedRichLanguage=1|2|3|4;
/** Descriptor fields naming each frozen V4 slice; every V4 descriptor carries all of them as 1. */
export const sharedV4SliceVersions=Object.freeze(["listNumberingVersion","textLanguageVersion","imageLinkVersion","detailsVersion","mentionVersion","tableCaptionVersion","pageBreakVersion","bookmarkVersion"] as const);
export type SharedV4SliceVersion=typeof sharedV4SliceVersions[number];
/** Exact membership; never a range, so a future language is not mapped to an older one. */
export function isSharedRichLanguage(value:unknown):value is SharedRichLanguage{return value===1||value===2||value===3||value===4;}
/** Causal model selected by an explicit language. */
export function sharedModelVersion(language:SharedRichLanguage):11|12|13|14{return language===4?14:language===3?13:language===2?12:11;}
/** Original journal binding selected by an explicit language. */
export function sharedJournalVersion(language:SharedRichLanguage):12|13|14|15{return language===4?15:language===3?14:language===2?13:12;}
export function sharedProtocolLanguage(value:unknown):SharedRichLanguage|undefined {
 if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
 const d=value as Record<string,unknown>;
 if(d["abiVersion"]!==1)return undefined;
 const slices=sharedV4SliceVersions.map(name=>d[name]);
 const noSlices=slices.every(version=>version===undefined);
 if(d["modelVersion"]===11&&d["journalVersion"]===12&&d["richLanguageVersion"]===undefined&&d["blockLayoutVersion"]===undefined&&noSlices)return 1;
 if(d["modelVersion"]===12&&d["journalVersion"]===13&&d["richLanguageVersion"]===2&&d["blockLayoutVersion"]===undefined&&noSlices)return 2;
 if(d["modelVersion"]===13&&d["journalVersion"]===14&&d["richLanguageVersion"]===3&&d["blockLayoutVersion"]===1&&noSlices)return 3;
 if(d["modelVersion"]===14&&d["journalVersion"]===15&&d["richLanguageVersion"]===4&&d["blockLayoutVersion"]===1&&slices.every(version=>version===1))return 4;
 return undefined;
}
