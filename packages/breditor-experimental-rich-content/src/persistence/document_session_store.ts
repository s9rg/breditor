import type {RichHistoryPolicy} from "../core.js";
import {LocalCheckpointDatabase} from "./local_checkpoint_database.js";
/** Rich languages 1–3 keep record V1. Frozen rich V4 additionally binds the exact schema
 * fingerprint of the matching native profile (`profile.descriptor().schemaFingerprint`). */
export type RichDocumentSessionStoreOptions=
 |{richLanguage:1|2|3;history?:RichHistoryPolicy;maxBytes?:number;schemaFingerprint?:never}
 |{richLanguage:4;schemaFingerprint:string;history?:RichHistoryPolicy;maxBytes?:number};
const documentKey="current:document-v1",recordFormat="breditor/local-document-checkpoint-record";
const fingerprintPattern=/^sha256:[0-9a-f]{64}$/;
/** Record V1 (languages 1–3) and record V2 (frozen V4 with its schema fingerprint). */
const recordKeys={1:"checkpointJson,format,formatVersion,history,richLanguage",2:"checkpointJson,format,formatVersion,history,richLanguage,schemaFingerprint"} as const;
/** Explicit document-family storage. The original current-string key is never overwritten. */
export class RichDocumentSessionStore {
 #database:LocalCheckpointDatabase;readonly #language:1|2|3|4;readonly #history:RichHistoryPolicy;readonly #fingerprint:string|null;
 readonly maxBytes:number;
 private constructor(database:LocalCheckpointDatabase,language:1|2|3|4,history:RichHistoryPolicy,fingerprint:string|null){this.#database=database;this.#language=language;this.#history=history;this.#fingerprint=fingerprint;this.maxBytes=database.maxBytes;}
 static async open(name:string,options:RichDocumentSessionStoreOptions):Promise<RichDocumentSessionStore>{
  if(!options||![1,2,3,4].includes(options.richLanguage)||(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1"))throw Error("Expected explicit local document language/history policy");
  // V4 is frozen and persistable only bound to one exact fingerprint; V1–V3 records stay unchanged.
  const fingerprint=options.richLanguage===4?options.schemaFingerprint:undefined;
  if(options.richLanguage===4&&(typeof fingerprint!=="string"||!fingerprintPattern.test(fingerprint)))throw Error("Rich language 4 storage requires the exact native schema fingerprint");
  if(options.richLanguage!==4&&"schemaFingerprint" in options&&options.schemaFingerprint!==undefined)throw Error("Only rich language 4 storage binds a schema fingerprint");
  const language=options.richLanguage,history=options.history??"explicit",maxBytes=options.maxBytes??16*1024*1024;
  return new RichDocumentSessionStore(await LocalCheckpointDatabase.open(name,maxBytes),language,history,fingerprint??null);
 }
 historyPolicy():RichHistoryPolicy{this.#database.assertLive();return this.#history;}
 richLanguageVersion():1|2|3|4{this.#database.assertLive();return this.#language;}
 /** The exact bound V4 schema fingerprint, or null for languages 1–3. */
 schemaFingerprint():string|null{this.#database.assertLive();return this.#fingerprint;}
 #check(checkpointJson:string):number{
  if(typeof checkpointJson!=="string")throw Error("Local document checkpoint must be JSON text");
  const bytes=new TextEncoder().encode(checkpointJson).byteLength;if(bytes>this.maxBytes)throw Error("Local checkpoint exceeds its byte budget");
  this.#checkFamily(checkpointJson);
  return bytes;
 }
 #checkFamily(checkpointJson:string):void{
  const value:unknown=JSON.parse(checkpointJson);if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Expected a local document checkpoint object");
  const header=value as {format?:unknown;formatVersion?:unknown;baseDocument?:{schemaFingerprint?:unknown};checkpoint?:{format?:unknown;formatVersion?:unknown;baseDocument?:{schemaFingerprint?:unknown}}};
  if(header.format!==(this.#history==="typing-v1"?"breditor/rich-document-typing-session":"breditor/rich-document-session")||header.formatVersion!==1||this.#history==="typing-v1"&&(!header.checkpoint||header.checkpoint.format!=="breditor/rich-document-session"||header.checkpoint.formatVersion!==1))throw Error("Local document checkpoint does not match its declared selection/history family");
  // A V4 checkpoint must name the bound fingerprint in its embedded base document; native
  // restore still proves the complete schema and exact history replay.
  if(this.#fingerprint!==null){const base=this.#history==="typing-v1"?header.checkpoint?.baseDocument:header.baseDocument;if(!base||typeof base!=="object"||base.schemaFingerprint!==this.#fingerprint)throw Error("Local document checkpoint does not match the bound rich language 4 schema fingerprint");}
  // Header checks choose storage identity; the matching native profile proves schema and replay.
 }
 #storedCheckpoint(value:unknown):string{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Unknown stored local document record");
  const record=value as Record<string,unknown>,version=this.#fingerprint===null?1:2;
  if(Object.keys(record).sort().join(",")!==recordKeys[version]||record["format"]!==recordFormat||record["formatVersion"]!==version||record["history"]!==this.#history||record["richLanguage"]!==this.#language||version===2&&record["schemaFingerprint"]!==this.#fingerprint||typeof record["checkpointJson"]!=="string")throw Error("Stored local document record does not match its explicit language/history family");
  return record["checkpointJson"];
 }
 async load():Promise<string|null>{
  const rows=await this.#database.load(documentKey);if(!rows.length)return null;
  const checkpointJson=this.#storedCheckpoint(rows[0]);this.#check(checkpointJson);return checkpointJson;
 }
 /** Pure optional read for explicit old-family migration; never a fallback from a bad new record. */
 async loadLegacy():Promise<string|null>{
  const rows=await this.#database.load("current");if(!rows.length)return null;const value=rows[0];
  if(typeof value!=="string")throw Error("Unknown legacy local checkpoint value");
  if(new TextEncoder().encode(value).byteLength>this.maxBytes)throw Error("Local checkpoint exceeds its byte budget");return value;
 }
 /** One completed transaction writes only the separate document key, retaining old recovery bytes. */
 save(checkpointJson:string):Promise<void>{
  this.#database.assertLive();const bytes=this.#check(checkpointJson);
  const record=this.#fingerprint===null
   ?{format:recordFormat,formatVersion:1,history:this.#history,richLanguage:this.#language,checkpointJson}
   :{format:recordFormat,formatVersion:2,history:this.#history,richLanguage:this.#language,schemaFingerprint:this.#fingerprint,checkpointJson};
  return this.#database.write(documentKey,record,bytes,value=>this.#checkFamily(this.#storedCheckpoint(value)));
 }
 flush():Promise<void>{return this.#database.flush();}
 close():void{this.#database.close();}
}
