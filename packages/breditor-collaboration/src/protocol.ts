/** Exact original protocol pairs; neither a schema name nor a version range selects a language. */
export type SharedProtocolBinding=
 |{abiVersion:1;modelVersion:11;journalVersion:12;richLanguageVersion?:never}
 |{abiVersion:1;modelVersion:12;journalVersion:13;richLanguageVersion:2};
export function sharedProtocolLanguage(value:unknown):1|2|undefined {
 if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
 const d=value as Record<string,unknown>;
 if(d["abiVersion"]!==1)return undefined;
 if(d["modelVersion"]===11&&d["journalVersion"]===12&&d["richLanguageVersion"]===undefined)return 1;
 if(d["modelVersion"]===12&&d["journalVersion"]===13&&d["richLanguageVersion"]===2)return 2;
 return undefined;
}
