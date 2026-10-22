/** Explicit new names and the exact original recovery plan, never a current authority grant. */
import type {IndependentOperationJournalIdentity} from './cut_intent.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {operationJournalFailure as fail} from './journal_failure.js';
interface Selection {readonly options:{readonly database:string;readonly destinations:Readonly<{source:string;uploads:string}>;readonly expected:{readonly sha256:string}};readonly record:{readonly plan:string};guard():void}
export function operationDatabaseName(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>200)throw fail();return value;}
export async function operationJournalIdentity(database:string,sourceDatabase:string,p:Selection):Promise<IndependentOperationJournalIdentity>{
 operationDatabaseName(database);operationDatabaseName(sourceDatabase);p.guard();
 if(new Set([database,sourceDatabase,p.options.database,...Object.values(p.options.destinations)]).size!==5)throw fail();
 const plan=JSON.stringify({format:'breditor/shared-independent-operation-plan',formatVersion:1,recovery:p.record.plan,journal:database,source:sourceDatabase});if(new TextEncoder().encode(plan).length>132*1024)throw fail();
 const operation=await segmentedDigest('breditor/independent-operation/1\0'+plan);p.guard();return{plan,operation,origin:p.options.expected.sha256,sourceDatabase};
}
