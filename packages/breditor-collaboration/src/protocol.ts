/** Exact original protocol pairs; neither a schema name nor a version range selects a language. */
export type SharedProtocolBinding=
 |{abiVersion:1;modelVersion:11;journalVersion:12;richLanguageVersion?:never;blockLayoutVersion?:never}
 |{abiVersion:1;modelVersion:12;journalVersion:13;richLanguageVersion:2;blockLayoutVersion?:never}
 |{abiVersion:1;modelVersion:13;journalVersion:14;richLanguageVersion:3;blockLayoutVersion:1};
export function sharedProtocolLanguage(value:unknown):1|2|3|undefined {
 if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
 const d=value as Record<string,unknown>;
 if(d["abiVersion"]!==1)return undefined;
 if(d["modelVersion"]===11&&d["journalVersion"]===12&&d["richLanguageVersion"]===undefined&&d["blockLayoutVersion"]===undefined)return 1;
 if(d["modelVersion"]===12&&d["journalVersion"]===13&&d["richLanguageVersion"]===2&&d["blockLayoutVersion"]===undefined)return 2;
 if(d["modelVersion"]===13&&d["journalVersion"]===14&&d["richLanguageVersion"]===3&&d["blockLayoutVersion"]===1)return 3;
 return undefined;
}
