/** Pure DATA association laws; these do not stand in for actual Native capture. */
import test from 'node:test';import assert from 'node:assert/strict';
import {composeReconciledServerPacketRecovery as compose} from '../packages/breditor-collaboration/dist/reconciled_server_packet_recovery/compose.js';
const sha=n=>String(n).repeat(64),pin=n=>({bytes:n,sha256:sha(n)});
function fixture(bytes='retained',current='checked'){
 const server={id:'server'},inventory={id:'inventory'},selection={source:{server,participants:inventory}};
 const original={assets:{references:{references:pin(1)}},legacy:{native:{control:{current:structuredClone(selection)}}},pending:[{kind:'references'}]};
 const recovery={kind:bytes,bundle:{original:{packets:{references:{references:pin(1)},containment:{reconciliation:original},packets:{manifest:pin(2)}},dependencies:pin(3),server:{identity:server},inventory:{identity:inventory},assets:{kind:'pending',missing:[{kind:'native-source'}]}},resolution:pin(4),assets:bytes==='retained'?{kind:'retained',files:{}}:{kind:'pending',missing:[{kind:'bytes',asset:'one'}]}}};
 const reconciliation={kind:current,original,sources:{parent:{references:pin(1),nativeResponseSha256:sha(3)},native:{selection:structuredClone(selection)}},pending:current==='checked'?[]:[{kind:'original',requirement:{kind:'head',requirement:{relation:'local-ahead'}}}]};
 return {recovery,reconciliation};
}
for(const bytes of ['retained','pending'])for(const current of ['checked','pending'])test('keeps separate byte/current outcomes '+bytes+'/'+current,()=>{
 const {recovery,reconciliation}=fixture(bytes,current),result=compose(recovery,reconciliation);assert.equal(result.recovery,recovery);assert.equal(result.reconciliation,reconciliation);assert.equal(result.recovery.kind,bytes);assert.equal(result.reconciliation.kind,current);assert.equal(result.recovery.bundle.original.assets.kind,'pending');assert.deepEqual(result.reconciliation.original.pending,[{kind:'references'}]);assert.deepEqual(result.binding,{references:pin(1),packets:pin(2),dependencies:pin(3),resolution:pin(4)});assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.binding));assert.ok(Object.isFrozen(result.binding.references));assert.equal('activate'in result,false);assert.equal('ready'in result,false);assert.equal('acknowledge'in result,false);
});
for(const [name,change]of [
 ['different reference cut',f=>f.reconciliation.sources.parent.references=pin(9)],
 ['different original reference cut',f=>f.reconciliation.original.assets.references.references=pin(9)],
 ['different complete Native dependency response',f=>f.reconciliation.sources.parent.nativeResponseSha256=sha(9)],
 ['different original metadata/read facts',f=>{f.reconciliation.original=structuredClone(f.reconciliation.original);f.reconciliation.original.pending=[{kind:'provider'}];}],
 ['different Native server cut',f=>f.reconciliation.sources.native.selection.source.server={id:'other'}],
 ['different complete participant inventory',f=>f.reconciliation.sources.native.selection.source.participants={id:'other'}],
 ['different original control selection',f=>f.reconciliation.original.legacy.native.control.current={source:{server:{id:'other'},participants:{id:'inventory'}}}],
])test('refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>compose(f.recovery,f.reconciliation));});
