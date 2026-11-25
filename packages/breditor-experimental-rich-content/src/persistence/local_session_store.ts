import {LocalCheckpointDatabase} from "./local_checkpoint_database.js";
function storedCheckpoint(value:unknown):string{
 if(typeof value!=="string")throw Error("Unknown stored local checkpoint value");
 return value;
}
/** Optional host persistence of exact rich checkpoints; not a shared sync acknowledgement. */
export class RichLocalSessionStore {
 #database:LocalCheckpointDatabase;
 readonly maxBytes:number;
 private constructor(database:LocalCheckpointDatabase){this.#database=database;this.maxBytes=database.maxBytes;}
 static async open(name:string,maxBytes=16*1024*1024):Promise<RichLocalSessionStore>{return new RichLocalSessionStore(await LocalCheckpointDatabase.open(name,maxBytes));}
 async load():Promise<string|null>{const rows=await this.#database.load("current");return rows.length?storedCheckpoint(rows[0]):null;}
 /** Capture the JSON before queueing. One completed transaction acknowledges the exact local bytes. */
 save(checkpointJson:string):Promise<void>{
  this.#database.assertLive();if(typeof checkpointJson!=="string")throw Error("Local checkpoint must be JSON text");
  return this.#database.write("current",checkpointJson,new TextEncoder().encode(checkpointJson).byteLength,value=>storedCheckpoint(value)!==checkpointJson);
 }
 /** Await the last scheduled write. This acknowledges no server or asset upload. */
 flush():Promise<void>{return this.#database.flush();}
 /** A caller should await flush before closing when it requires the last local write. */
 close():void{this.#database.close();}
}
