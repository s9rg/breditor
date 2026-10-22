/** Inspect the entire local source before any open capable of autosave. No
 * relay companion is passed to either the native reader or its storage family. */
import {existingDatabase} from '../participant_recovery/journal.js';
import {readIndependentHistoryCut} from '../independent_history/database.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PreparedIndependentRecovery} from './prepare.js';
import {independentRecoveryFailure as fail} from './policy.js';
export async function inspectIndependentDestination<P extends SharedSelectionPolicy>(p:PreparedIndependentRecovery<P>):Promise<'missing'|'empty'|'exact'>{
 p.guard();const db=await existingDatabase(p.options.destinations.source);let changed=false;
 try{
  p.guard();if(!db)return'missing';db.onversionchange=()=>{changed=true;db.close();};if(db.version!==1||[...db.objectStoreNames].sort().join(',')!=='history_files,history_heads')throw fail('independent_recovery_diverged');
  const counts=await new Promise<number[]>((resolve,reject)=>{const tx=db.transaction(['history_files','history_heads'],'readonly'),out:number[]=[];let reason:unknown;tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(reason??fail());
   for(const[i,name]of ['history_files','history_heads'].entries()){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){reason=fail('independent_recovery_diverged');tx.abort();return;}s.count().onsuccess=e=>{try{p.guard();out[i]=(e.target as IDBRequest<number>).result;}catch(error){reason=error;tx.abort();}};}
  });p.guard();if(changed)throw fail('independent_recovery_diverged');if(counts[0]===0&&counts[1]===0)return'empty';if(counts[1]!==1||counts[0]!==p.cut.files.length)throw fail('independent_recovery_diverged');
  const id=p.options.expected.identity.source.native,current=await readIndependentHistoryCut(db,[id.room,id.writer]);p.guard();if(changed||!current||current.head!==p.cut.head||current.files.length!==p.cut.files.length)throw fail('independent_recovery_diverged');
  const byKey=new Map(current.files.map(file=>[JSON.stringify([file.lane,file.generation]),file]));for(const file of p.cut.files)if(JSON.stringify(byKey.get(JSON.stringify([file.lane,file.generation])))!==JSON.stringify(file))throw fail('independent_recovery_diverged');return'exact';
 }finally{db?.close();}
}
