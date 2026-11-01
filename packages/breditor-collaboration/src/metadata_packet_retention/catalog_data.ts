/** Re-admit complete recorded catalog DATA. This never registers live host
 * provenance or authenticates a recorded controller/permission object. */
import {collectOriginalMetadataData} from '../server_metadata_read/collect_data.js';
import type {SelectedServerMetadataCatalog,OriginalMetadataStartQuery} from '../server_metadata_read/contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {fail,same} from './policy.js';
export async function admitRecordedMetadataCatalog(input:unknown,expected:SharedServerLogGenerationRecoveryControlSelection,document:string,check:()=>void){
 const r=fields(input,['format','formatVersion','selection','pages','terminal']);
 if(r['format']!=='breditor/selected-server-original-metadata-catalog'||r['formatVersion']!==1||!same(generationControlSelection(r['selection']),expected)||!Array.isArray(r['pages'])||r['pages'].length<1||r['pages'].length>33)throw fail();
 const value=input as SelectedServerMetadataCatalog<SharedServerLogGenerationRecoveryControlSelection>,first=value.pages[0]!.metadata;
 const query=Object.fromEntries((['versions','suggestions','revisions'] as const).map(name=>[name,{kind:first[name].kind==='disabled'?'disabled':'start'}])) as unknown as OriginalMetadataStartQuery;
 let position=0;const result=await collectOriginalMetadataData('server-log-generation-recovery',expected,document,query,async()=>{check();const page=value.pages[position++];if(!page)throw fail();return page;},async()=>check());
 if(position!==value.pages.length||!same(result.catalog,value))throw fail();check();return result.index;
}
