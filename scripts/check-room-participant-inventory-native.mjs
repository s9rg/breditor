/** Fresh actual native Host fixtures, original server restores and no exported raw credentials. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {homedir} from "node:os";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {fileEvidence,saveEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
const repository=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export function buildRoomParticipantInventoryFixtures({saveReport=true}={}){
 const cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??resolve(homedir(),".cargo/bin/cargo"),target=resolve(repository,"target/owned-history-relay-native"),env={...process.env,CARGO_TARGET_DIR:target};
 execFileSync(cargo,["build","--manifest-path","experiments/relay/Cargo.toml","--features","server","--locked","--offline","--release","--example","participant_inventory_fixture"],{cwd:repository,env,stdio:"inherit"});
 const directory=fs.mkdtempSync(resolve(repository,"target/native-participant-inventory-")),binary=resolve(target,`release/examples/participant_inventory_fixture${process.platform==="win32"?".exe":""}`),text=execFileSync(binary,[directory],{cwd:repository,env,encoding:"utf8",maxBuffer:1024*1024}),manifest=JSON.parse(text);
 assert.equal(manifest.format,"breditor/native-participant-inventory-fixtures");assert.equal(manifest.formatVersion,1);assert.equal(manifest.cases.length,10);
 const files=[];for(const item of manifest.cases){assert.equal(item.nativeOwnerAuthenticated,true);assert.equal(item.nativeRestoredRegistrationsVerified,true);assert.equal(item.nativeSelectedServerStateVerified,true);assert.equal(item.nativeOperationalReopensVerified,true);assert.equal(item.nativeContinuedServerStateVerified,true);assert.equal(item.rawCredentialsExported,false);const path=resolve(item.path);assert.equal(dirname(dirname(path)),directory);const fixture=JSON.parse(fs.readFileSync(path,"utf8"));assert.equal(fixture.format,"breditor/native-participant-inventory-fixture");assert.equal(fixture.clients.length,2);if(process.platform!=="win32"){assert.equal(fs.statSync(dirname(path)).mode&0o777,0o700);assert.equal(fs.statSync(path).mode&0o777,0o600);}for(const name of ["fixture.json","inventory.json","server.backup"])files.push(fileEvidence(repository,resolve(dirname(path),name).slice(repository.length+1)));}
 assert.throws(()=>execFileSync(binary,[directory],{cwd:repository,env,encoding:"utf8",stdio:"pipe"}),e=>e.status!==0&&String(e.stderr).includes("AlreadyExists"));
 for(const file of files)assert.deepEqual(fileEvidence(repository,file.path),file);
 const manifestPath=resolve(directory,"fixtures.json");fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
 const result={format:"breditor/native-participant-inventory-check",formatVersion:1,passed:true,source:sourceEvidence(repository),manifest:manifestPath,cases:10,originalNativeCompilersAndTransports:true,stoppedSourceRestoredHostFreshAuthentication:true,protectedOriginalRegistrationsVerified:true,selectedNativeServerStateVerified:true,operationalReopensVerified:true,continuedNativeServerStateVerified:true,rawCredentialsExported:false,occupiedDestinationRefusedWithoutOverwrite:true,files,scope:"Actual native Room, private owner-authenticated Host, complete server capture, original restore, protected registration verification, combined host-bound selected-cut checks and two operational reopens with a durable grant append. Current native continuation rechecks retain the original and require all current protected registrations. Original selected fixture archives stay unchanged. No HTTP inventory endpoint, client activation, provider reference closure, credential vault, browser/platform or generation bridge."};
 if(saveReport)saveEvidence(resolve(repository,"target/room-participant-inventory-native.json"),result);return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error("No arguments expected");console.log(JSON.stringify(buildRoomParticipantInventoryFixtures(),null,2));}
