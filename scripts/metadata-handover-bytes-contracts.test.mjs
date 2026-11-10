import test from 'node:test';
import assert from 'node:assert/strict';
import {SelectedLocalMetadataDelivery as Metadata} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {prepareHandoverPacketRecoveryInput} from '../packages/breditor-collaboration/dist/metadata_packet_retention/handover_input.js';
import * as api from '../packages/breditor-collaboration/dist/index.js';

test('a copied metadata receiver cannot inspect handover capture input',()=>{
 let read=0;
 const input=new Proxy({},{ownKeys(){read++;throw Error('Invalid receiver');}});
 assert.throws(()=>Metadata.prototype.captureReconciledServerPacketRecoveryAcrossHandover.call({},input));
 assert.equal(read,0);
});
test('hand-over packet capture requires real controls, readers and raster transport',()=>{
 let callbacks=0;
 const fake={identity(){callbacks++;},selection(){callbacks++;},file(){callbacks++;},read(){callbacks++;}};
 assert.throws(()=>prepareHandoverPacketRecoveryInput({host:fake,path:fake,transport:fake,server:fake,inventory:fake}));
 assert.equal(callbacks,0);
 assert.equal(api.prepareHandoverPacketRecoveryInput,undefined);
});
