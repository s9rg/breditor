/** Real retained public bytes with a synthetic resolution/current-report wrapper.
 * Exercises graph/storage laws, never Native admission or activation permission. */
import {createHash} from 'node:crypto';
import {readPendingSourceReplayFixture} from '../local-metadata/pending-source-replay.mjs';
import {composeReconciledServerPacketRecovery} from '../../../packages/breditor-collaboration/dist/reconciled_server_packet_recovery/compose.js';
import {selection} from './transport.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function captureFixture(samples={}){
 const original=readPendingSourceReplayFixture().bundle,previous=original.packets.containment.reconciliation,control=previous.legacy.native.control.current;
 const file=new Blob(['{}'],{type:'application/vnd.breditor.server-packet-source-resolution+json'}),resolution={file,bytes:file.size,sha256:sha('{}')};
 const recovery={kind:'pending',bundle:{format:'breditor/selected-local-resolved-server-packet-recovery-bundle',formatVersion:1,scope:'literal-original-recovery-plus-verified-native-source-and-raster-resolution',original,resolution,assets:original.assets}};
 const reconciliation={format:'breditor/selected-local-server-packet-reconciliation-read',formatVersion:1,scope:'current-held-native-all-metadata-complete-server-source-and-provider',kind:'pending',original:previous,sources:{format:'breditor/current-server-packet-reference-read',formatVersion:1,scope:'held-histories-local-packets-source-versions-and-complete-server-native',parent:{references:{bytes:original.packets.references.references.bytes,sha256:original.packets.references.references.sha256},nativeResponseSha256:original.dependencies.sha256},native:{selection:control},local:{samples}},currentProvider:null,pending:[{kind:'sources'}]};
 return{capture:composeReconciledServerPacketRecovery(recovery,reconciliation),activation:selection(control.source)};
}
