/** Real portable input from four native cuts. The old editor releases its actual
 * writer leases before a new writable journal/source can be admitted. */
import assert from 'node:assert/strict';
import {prepareLocalPortableCase} from '../independent-local-operation/portable.mjs';
export const restoredLocalOptions=(value,backup,extra={})=>{
 const{database,create,...sourceFactory}=value.f.options.session;
 return{kind:'snapshot-v1',expected:backup.selection(),database:value.f.tag+'-restored-journal',sourceDatabase:value.f.tag+'-restored-native',sourceFactory,writerRecovery:'host-reacquired',checkAuthority(){},...extra};
};
export async function restoredLocalFixture(host,capture,extra={}){
 const value=await prepareLocalPortableCase(await host.fixture(extra),capture);try{
  const result=await value.capture();assert.equal(result.kind,'ready');const backup=result.backup,options=restoredLocalOptions(value,backup),file=backup.file();
  await value.source.discardAndClose();
  const nativeOptions=(overrides={})=>({...value.f.options.session,database:options.sourceDatabase,create(){throw Error('A restored-local source cannot create an empty editor');},...overrides});
  return{value,backup,options,file,nativeOptions,close:()=>value.close()};
 }catch(error){await value.close();throw error;}
}
