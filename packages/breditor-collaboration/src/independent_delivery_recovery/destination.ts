/** Inspect the entire dedicated source before opening anything capable of autosave. */
import {existingDatabase} from '../participant_recovery/journal.js';
import {readIndependentHistoryCut} from '../independent_history/database.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PreparedIndependentDeliveryRecovery} from './prepare.js';
import {independentDeliveryRecoveryFailure as fail} from './policy.js';
export async function inspectIndependentDeliveryDestination<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>):Promise<'missing'|'empty'|'exact'>{
 p.guard();const db=await existingDatabase(p.options.destinations.source);p.guard();if(!db)return'missing';let changed=false;db.onversionchange=()=>{changed=true;db.close();};
 try{if(db.version!==1||[...db.objectStoreNames].sort().join(',')!=='delivery_history_files,delivery_history_heads')throw fail('independent_delivery_recovery_diverged');
  const counts=await new Promise<number[]>((resolve,reject)=>{const tx=db.transaction(['delivery_history_files','delivery_history_heads'],'readonly'),out:number[]=[];let reason:unknown;tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(reason??fail());
   for(const[i,name]of ['delivery_history_files','delivery_history_heads'].entries()){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){reason=fail('independent_delivery_recovery_diverged');tx.abort();return;}s.count().onsuccess=e=>{out[i]=(e.target as IDBRequest<number>).result;};}
  });p.guard();if(changed)throw fail('independent_delivery_recovery_diverged');if(counts[0]===0&&counts[1]===0)return'empty';if(counts[1]!==1||counts[0]!==p.cut.files.length)throw fail('independent_delivery_recovery_diverged');
  const id=p.options.expected.identity.source.history.native,current=await readIndependentHistoryCut(db,[id.room,id.writer],p.companion);p.guard();if(changed||!current||current.head!==p.cut.head||current.files.length!==p.cut.files.length)throw fail('independent_delivery_recovery_diverged');
  const byKey=new Map(current.files.map(f=>[JSON.stringify([f.lane,f.generation]),f]));for(const file of p.cut.files)if(JSON.stringify(byKey.get(JSON.stringify([file.lane,file.generation])))!==JSON.stringify(file))throw fail('independent_delivery_recovery_diverged');return'exact';
 }finally{db.close();}
}
