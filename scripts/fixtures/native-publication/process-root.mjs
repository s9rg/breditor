/** Exact separately built Native restart executable; bounded isolated output. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,realpathSync,readFileSync} from 'node:fs';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
export function nativeJointProcessRoot(root){
 root=realpathSync(root);const record=JSON.parse(readFileSync(join(root,'target/native-joint-process-native-build.json'),'utf8'));
 assert.equal(record.format,'breditor/native-joint-process-native-build');assert.equal(record.complete,true);assert.equal(record.exitCode,0);assert.equal(record.sourceUnchanged,true);
 const examples=join(root,'target/native-joint-process-native/debug/examples'),file=join(examples,'native_joint_process_recovery_functional'),pin=record.binaries.find(row=>basename(row.path)==='native_joint_process_recovery_functional');assert.ok(pin);
 const bytes=readFileSync(file);assert.equal(bytes.length,pin.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);
 const directory=mkdtempSync(join(root,'target/native-joint-process-fixture-'));mkdirSync(join(directory,'target/native-joint-process-native/debug'),{recursive:true});
 symlinkSync(examples,join(directory,'target/native-joint-process-native/debug/examples'),'dir');symlinkSync(realpathSync(join(root,'packages/breditor-collaboration/dist/runtime')),join(directory,'target/promoted-shared-web'),'dir');return directory;
}
