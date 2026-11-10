import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,unlinkSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {prepareActivationRetentionFixture as prepare} from './fixtures/activation-retention/prepare.mjs';
function root(){const path=mkdtempSync('/private/tmp/breditor-retention-corpus-');mkdirSync(join(path,'scripts/fixtures/activation-retention'),{recursive:true});copyFileSync(new URL('./fixtures/activation-retention/actual-intent.json.gz',import.meta.url),join(path,'scripts/fixtures/activation-retention/actual-intent.json.gz'));return path;}
test('a clean checkout reproduces every pinned corpus byte and resumes only missing fixture files',()=>{
 const path=root(),directory=prepare(path),before=readFileSync(join(directory,'graph.json'));unlinkSync(join(directory,'graph.json'));assert.equal(prepare(path),directory);assert.deepEqual(readFileSync(join(directory,'graph.json')),before);assert.equal(prepare(path),directory);
});
test('fixture preparation refuses changed files and unexpected entries without replacing either',()=>{
 const path=root(),directory=prepare(path);writeFileSync(join(directory,'graph.json'),'preserve-me');assert.throws(()=>prepare(path));assert.equal(readFileSync(join(directory,'graph.json'),'utf8'),'preserve-me');
 const other=root(),retained=prepare(other);writeFileSync(join(retained,'foreign'),'preserve-extra');assert.throws(()=>prepare(other));assert.equal(readFileSync(join(retained,'foreign'),'utf8'),'preserve-extra');
});
test('fixture preparation refuses a symlinked destination without writing into it',()=>{
 const path=root(),outside=mkdtempSync('/private/tmp/breditor-retention-corpus-outside-');mkdirSync(join(path,'target'));symlinkSync(outside,join(path,'target/activation-retainer-actual-input'),'dir');assert.throws(()=>prepare(path));assert.throws(()=>readFileSync(join(outside,'index.json')));
});
