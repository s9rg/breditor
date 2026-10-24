/** Fault injection must obey the real store's key model. Supplying a second
 * key to an inline-key store raises DataError BEFORE the intended mutation. */
export function putControlFixtureRecord(store,row,value){
 if(store.keyPath===null)store.put(value,row.key);else store.put(value);
}
