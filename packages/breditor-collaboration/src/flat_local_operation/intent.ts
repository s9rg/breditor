/** Actual prepare/native-save/acknowledge data for this distinct family. */
import {generationFields} from '../generation_source/identity.js';
import type {FlatLocalIdentity} from './head.js';import {flatLocalFailure as fail} from './failure.js';
export interface FlatLocalCutIntent{readonly format:'breditor/shared-flat-local-input-intent';readonly formatVersion:1;readonly plan:string;readonly operation:string;readonly sequence:string;readonly current:string|null;readonly pending:string|null}
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function readFlatLocalIntent(raw:unknown,id:FlatLocalIdentity):FlatLocalCutIntent{
 if(!generationFields(raw,'format,formatVersion,plan,operation,sequence,current,pending'))throw fail();const r=raw;
 if(r['format']!=='breditor/shared-flat-local-input-intent'||r['formatVersion']!==1||r['plan']!==id.plan||r['operation']!==id.operation||typeof r['sequence']!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(r['sequence'])||BigInt(r['sequence'])>0xffffffffffffffffn||r['current']!==null&&!hash(r['current'])||r['pending']!==null&&!hash(r['pending'])||r['pending']!==null&&r['pending']===r['current'])throw fail();const sequence=BigInt(r['sequence']);
 if(r['pending']===null&&(sequence%2n!==0n||(r['current']===null)!==(sequence===0n))||r['pending']!==null&&(sequence%2n!==1n||(r['current']===null)!==(sequence===1n)))throw fail();return{format:r['format'],formatVersion:1,plan:id.plan,operation:id.operation,sequence:r['sequence'],current:r['current'],pending:r['pending']};
}
export const initialFlatLocalIntent=(id:FlatLocalIdentity):FlatLocalCutIntent=>readFlatLocalIntent({format:'breditor/shared-flat-local-input-intent',formatVersion:1,plan:id.plan,operation:id.operation,sequence:'0',current:null,pending:null},id);
export function checkFlatLocalTransition(before:FlatLocalCutIntent,next:FlatLocalCutIntent,id:FlatLocalIdentity):void{readFlatLocalIntent(before,id);readFlatLocalIntent(next,id);const prepare=before.pending===null&&next.current===before.current&&next.pending!==null,acknowledge=before.pending!==null&&next.current===before.pending&&next.pending===null;if(BigInt(next.sequence)!==BigInt(before.sequence)+1n||!prepare&&!acknowledge)throw fail();}
