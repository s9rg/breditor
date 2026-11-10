/** Storage-only lineage declarations around a real retained capture. These
 * synthetic controls are never opened and cannot authorize a Native request. */
import {createHash} from 'node:crypto';
import {handoverDeliveryPathSelection} from '../../../packages/breditor-collaboration/dist/generation_delivery_path_control/handover.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function handoverCaptureData(capture,activation){
 const native=capture.reconciliation.sources.native.selection,source=native.source;
 const delivery={format:'breditor/server-log-generation-delivery-recovery-control',formatVersion:1,instance:sha('storage-only-delivery'),continuation:{format:'breditor/server-log-generation-delivery-continuation',formatVersion:1,previous:source.origin,current:source},current:native};
 const path={format:'breditor/server-log-generation-delivery-path',formatVersion:1,ancestors:[source.origin],current:source};
 const current={format:'breditor/server-log-generation-delivery-path-recovery-control',formatVersion:1,instance:sha('storage-only-path'),path,current:delivery};
 const handover=handoverDeliveryPathSelection({format:'breditor/server-log-generation-handover-delivery-path-recovery-control',formatVersion:1,path:{format:'breditor/server-log-generation-handover-delivery-path',formatVersion:1,seal:{...activation.previous,generation:'1',owner:sha('storage-only-seal')},earlier:[source.origin],successor:path},current});
 return Object.freeze({format:'breditor/handover-reconciled-server-packet-recovery',formatVersion:1,handover,capture});
}
