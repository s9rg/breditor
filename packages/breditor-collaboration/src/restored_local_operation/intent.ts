/** New restored-local intent. One acknowledged and one pending cut; no rollback. */
import {generationFields} from '../generation_source/identity.js';
import type {RestoredLocalIdentity} from './head.js';
import {restoredLocalFailure as fail} from './failure.js';
export interface RestoredLocalCutIntent{readonly format:'breditor/shared-restored-local-operation-cut-intent';readonly formatVersion:1;readonly plan:string;readonly operation:string;readonly sequence:string;readonly current:string|null;readonly pending:string|null}
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function readRestoredLocalIntent(raw:unknown,id:RestoredLocalIdentity):RestoredLocalCutIntent{
 if(!generationFields(raw,'format,formatVersion,plan,operation,sequence,current,pending'))throw fail();const r=raw as unknown as RestoredLocalCutIntent;
 if(r.format!=='breditor/shared-restored-local-operation-cut-intent'||r.formatVersion!==1||r.plan!==id.plan||r.operation!==id.operation||typeof r.sequence!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(r.sequence)||BigInt(r.sequence)>0xffffffffffffffffn||r.current!==null&&!digest(r.current)||r.pending!==null&&!digest(r.pending)||r.pending!==null&&r.pending===r.current)throw fail();const sequence=BigInt(r.sequence);if(r.pending===null&&(sequence%2n!==0n||(r.current===null)!==(sequence===0n))||r.pending!==null&&(sequence%2n!==1n||(r.current===null)!==(sequence===1n)))throw fail();return{format:r.format,formatVersion:1,plan:r.plan,operation:r.operation,sequence:r.sequence,current:r.current,pending:r.pending};
}
export const initialRestoredLocalIntent=(id:RestoredLocalIdentity):RestoredLocalCutIntent=>readRestoredLocalIntent({format:'breditor/shared-restored-local-operation-cut-intent',formatVersion:1,plan:id.plan,operation:id.operation,sequence:'0',current:null,pending:null},id);
export function checkRestoredLocalTransition(before:RestoredLocalCutIntent,next:RestoredLocalCutIntent,id:RestoredLocalIdentity):void{readRestoredLocalIntent(before,id);readRestoredLocalIntent(next,id);const prepare=before.pending===null&&next.current===before.current&&next.pending!==null,acknowledge=before.pending!==null&&next.current===before.pending&&next.pending===null;if(BigInt(next.sequence)!==BigInt(before.sequence)+1n||!prepare&&!acknowledge)throw fail();}
