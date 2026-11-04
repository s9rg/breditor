/** Test-only source data laws. Retirement may checkpoint the two original
 * review/metadata journals once. All other original bytes remain exact; after
 * retirement, even those journals are immutable. No snapshot grants ownership. */
import assert from 'node:assert/strict';
import {databaseByteSnapshot} from '../native-actor-custody/storage_bytes.mjs';
function current(snapshot){
 assert.equal(snapshot.version,1);assert.equal(snapshot.stores.kind,'array');assert.equal(snapshot.stores.length,1);
 const store=snapshot.stores.entries[0][1],fields=new Map(store.entries),keys=fields.get('keys'),values=fields.get('values');assert.equal(fields.get('name').value,'state');assert.deepEqual(keys.entries.map(row=>row[1].value),['before','current']);assert.equal(values.entries.length,2);const node=values.entries[1][1];assert.equal(node.kind,'string');return node;
}
/** Permit exactly one canonical revision-only checkpoint. The immutable
 * before row, current facts, schema and every other value must match bytewise. */
export function assertJournalCheckpointOnly(before,after){
 if(JSON.stringify(before)===JSON.stringify(after))return{revisionDelta:0};
 const oldNode=current(before),copy=structuredClone(after),newNode=current(copy),old=JSON.parse(oldNode.value),next=JSON.parse(newNode.value);assert.equal(JSON.stringify(old),oldNode.value);assert.equal(JSON.stringify(next),newNode.value);assert.ok(Number.isSafeInteger(old.revision));assert.equal(next.revision,old.revision+1);
 const {revision:oldRevision,...oldFacts}=old,{revision:nextRevision,...nextFacts}=next;assert.deepEqual(nextFacts,oldFacts,'Retirement may not alter source history, packets, relay receipts or metadata records');newNode.value=oldNode.value;assert.deepEqual(copy,before,'Retirement may not alter schema, before row or unrelated stored values');return{revisionDelta:1,beforeRevision:oldRevision,afterRevision:nextRevision};
}
/** Derive original namespaces from the actual joint descriptor, excluding
 * mutable execution/publication outcome journals and newly created targets. */
export function originalJointSourceBytes(all,plan){const names=[...new Set([...plan.sourceNamespaces,plan.origin.selection.prepared.database,plan.origin.reviewDatabase,plan.origin.metadataDatabase])].sort();for(const name of names)assert.ok(all.has(name),'Original source namespace must exist: '+name);assert.equal(names.includes(plan.database),false);return new Map(names.map(name=>[name,all.get(name)]));}
export async function assertOriginalSourceRetirement(before,plan){const names=new Set([plan.origin.reviewDatabase,plan.origin.metadataDatabase]),after=new Map(),checkpoints=[];for(const[name,old]of before){const next=await databaseByteSnapshot(name);after.set(name,next);if(names.has(name))checkpoints.push({database:name,...assertJournalCheckpointOnly(old,next)});else assert.deepEqual(next,old,name);}assert.equal(checkpoints.length,2);return{after,checkpoints};}
