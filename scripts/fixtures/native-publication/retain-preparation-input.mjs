/** Test-only complete DATA retained before the first preparation reader. Disk
 * bytes flatten the runtime Blob's construction, so this is not by itself a
 * reproduction of a physical short read or an owner/activation capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export async function retainJointPreparationInput(directory,current,stage='before-preparation'){
 assert.ok(['before-preparation','after-version-materialization'].includes(stage));
 const selection=structuredClone(current.selection),file=current.file;
 assert.equal(selection.format,'breditor/selected-room-current-selection');assert.equal(selection.formatVersion,1);
 assert.ok(file instanceof Blob);assert.equal(file.size,selection.bytes);assert.ok(file.size>0&&file.size<=128*1024*1024);assert.match(selection.sha256,/^[a-f0-9]{64}$/);
 const bytes=Buffer.from(await file.arrayBuffer());assert.equal(bytes.length,file.size,'Retained preparation input read must be complete');
 const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,selection.sha256,'Retained preparation input must match its original complete cut');
 const prefix='joint-selected-original-'+stage,archive=prefix+'.archive';writeFileSync(join(directory,archive),bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(join(directory,archive)),bytes);
 const record={format:'breditor/test-joint-preparation-input',formatVersion:1,stage,selection,archive,bytes:bytes.length,sha256,mime:file.type,readBackVerified:true,scope:'Complete selected original archive before preparation; DATA only. Filesystem copy flattens physical Blob construction.',physicalBlobConstructionRetained:false,ownerOrServingAuthority:false};
 const metadata=Buffer.from(JSON.stringify(record,null,2)+'\n');writeFileSync(join(directory,prefix+'.json'),metadata,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(join(directory,prefix+'.json')),metadata);
 console.log('JOINT_PREPARATION_INPUT_RETAINED '+JSON.stringify(record));return record;
}
