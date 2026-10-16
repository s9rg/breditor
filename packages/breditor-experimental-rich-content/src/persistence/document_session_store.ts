import type {RichHistoryPolicy} from "../core.js";
import {LocalCheckpointDatabase} from "./local_checkpoint_database.js";
export interface RichDocumentSessionStoreOptions {richLanguage:1|2|3;history?:RichHistoryPolicy;maxBytes?:number}
const documentKey="current:document-v1";
/** Explicit document-family storage. The original current-string key is never overwritten. */
export class RichDocumentSessionStore {
 #database:LocalCheckpointDatabase;readonly #language:1|2|3;readonly #history:RichHistoryPolicy;
 readonly maxBytes:number;
 private constructor(database:LocalCheckpointDatabase,language:1|2|3,history:RichHistoryPolicy){this.#database=database;this.#language=language;this.#history=history;this.maxBytes=database.maxBytes;}
 static async open(name:string,options:RichDocumentSessionStoreOptions):Promise<RichDocumentSessionStore>{
  if(!options||![1,2,3].includes(options.richLanguage)||(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1"))throw Error("Expected explicit local document language/history policy");
  const language=options.richLanguage,history=options.history??"explicit",maxBytes=options.maxBytes??16*1024*1024;
  return new RichDocumentSessionStore(await LocalCheckpointDatabase.open(name,maxBytes),language,history);
 }
 historyPolicy():RichHistoryPolicy{this.#database.assertLive();return this.#history;}
 richLanguageVersion():1|2|3{this.#database.assertLive();return this.#language;}
 #check(checkpointJson:string):number{
  if(typeof checkpointJson!=="string")throw Error("Local document checkpoint must be JSON text");
  const bytes=new TextEncoder().encode(checkpointJson).byteLength;if(bytes>this.maxBytes)throw Error("Local checkpoint exceeds its byte budget");
  const value:unknown=JSON.parse(checkpointJson);if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Expected a local document checkpoint object");
  const header=value as {format?:unknown;formatVersion?:unknown;checkpoint?:{format?:unknown;formatVersion?:unknown}};
  if(header.format!==(this.#history==="typing-v1"?"breditor/rich-document-typing-session":"breditor/rich-document-session")||header.formatVersion!==1||this.#history==="typing-v1"&&(!header.checkpoint||header.checkpoint.format!=="breditor/rich-document-session"||header.checkpoint.formatVersion!==1))throw Error("Local document checkpoint does not match its declared selection/history family");
  // Header checks choose storage identity; the matching native profile proves schema and replay.
  return bytes;
 }
 async load():Promise<string|null>{
  const value=await this.#database.load(documentKey);if(value===undefined)return null;
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Unknown stored local document record");
  const record=value as Record<string,unknown>;
  if(Object.keys(record).sort().join(",")!=="checkpointJson,format,formatVersion,history,richLanguage"||record["format"]!=="breditor/local-document-checkpoint-record"||record["formatVersion"]!==1||record["history"]!==this.#history||record["richLanguage"]!==this.#language||typeof record["checkpointJson"]!=="string")throw Error("Stored local document record does not match its explicit language/history family");
  this.#check(record["checkpointJson"]);return record["checkpointJson"];
 }
 /** Pure optional read for explicit old-family migration; never a fallback from a bad new record. */
 async loadLegacy():Promise<string|null>{
  const value=await this.#database.load("current");if(value===undefined||value===null)return null;
  if(typeof value!=="string")throw Error("Unknown legacy local checkpoint value");
  if(new TextEncoder().encode(value).byteLength>this.maxBytes)throw Error("Local checkpoint exceeds its byte budget");return value;
 }
 /** One completed transaction writes only the separate document key, retaining old recovery bytes. */
 save(checkpointJson:string):Promise<void>{
  this.#database.assertLive();const bytes=this.#check(checkpointJson);
  return this.#database.write(documentKey,{format:"breditor/local-document-checkpoint-record",formatVersion:1,history:this.#history,richLanguage:this.#language,checkpointJson},bytes);
 }
 flush():Promise<void>{return this.#database.flush();}
 close():void{this.#database.close();}
}
