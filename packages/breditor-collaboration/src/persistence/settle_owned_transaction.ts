/** Settle a transaction owned by this caller, then release its terminal handlers.
 * The completion callback runs only after the actual commit; it may record
 * durable facts before checking current authority. Its original result or
 * refusal is preserved. Request callbacks, live database watches, records and
 * transaction-local validation remain the caller's responsibility.
 *
 * Ownership of oncomplete/onabort/onerror is exclusive. Clearing these fields
 * breaks references from finished transactions to large cloned recovery cuts,
 * including in IndexedDB implementations that retain finished transactions.
 * This neither deletes stored data nor caches a validation or permission. */
export function settleOwnedTransaction<T>(tx:IDBTransaction,complete:()=>T,failure:()=>unknown,resolve:(value:T)=>void,reject:(reason:unknown)=>void):void {
 let settled=false;
 const release=()=>{tx.oncomplete=null;tx.onabort=null;tx.onerror=null;};
 const refuse=(reason:unknown)=>{try{release();}catch{/* Preserve the original terminal failure. */}reject(reason);};
 tx.oncomplete=()=>{if(settled)return;settled=true;try{const value=complete();release();resolve(value);}catch(error){refuse(error);}};
 tx.onabort=()=>{if(settled)return;settled=true;let reason:unknown;try{reason=failure();}catch(error){reason=error;}refuse(reason);};
}
