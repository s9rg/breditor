/** Check TAP totals and report bounded failure locations without copying diagnostics. */
import assert from "node:assert/strict";
import {closeSync,fstatSync,openSync,readFileSync,readSync,statSync} from "node:fs";

const maximumLogBytes=16*1024*1024;
const failureTailBytes=256*1024;
const maximumFailures=20;

export function verifyNativeContractLog(path,assertions){
 const stat=statSync(path);
 assert.ok(stat.isFile()&&stat.size<=maximumLogBytes,"Native contract log exceeds its size bound");
 const output=readFileSync(path,"utf8");
 for(const [counter,expected] of [["tests",assertions],["pass",assertions],["fail",0],["skipped",0],["cancelled",0]]){
  assert.ok(new RegExp(`^# ${counter} ${expected}$`,"m").test(output),`Unexpected Native contract ${counter} total`);
 }
}

function readFailureTail(path){
 const fd=openSync(path,"r");
 try{
  const stat=fstatSync(fd);
  if(!stat.isFile())throw Error("Expected a Native contract log file");
  const offset=Math.max(0,stat.size-failureTailBytes),buffer=Buffer.alloc(stat.size-offset);
  const bytesRead=readSync(fd,buffer,0,buffer.length,offset);
  const lines=buffer.toString("utf8",0,bytesRead).split(/\r?\n/u);
  if(offset)lines.shift();
  return {truncated:offset>0,lines};
 }finally{closeSync(fd);}
}

export function summarizeNativeContractFailure(path,testFiles){
 let tail;
 try{tail=readFailureTail(path);}catch{return {available:false};}
 const files=new Set(testFiles),failures=[];
 let current,omitted=0;
 for(const line of tail.lines){
  const result=/^(not ok|ok) ([1-9][0-9]{0,7})(?: - |$)/u.exec(line);
  if(result){
   current=undefined;
   if(result[1]==="not ok"){
    if(failures.length===maximumFailures)omitted++;
    else{current={test:Number(result[2])};failures.push(current);}
   }
   continue;
  }
  if(!current||current.file)continue;
  const location=/^  location: '[^'\r\n]*\/([a-z0-9_.-]+\.test\.mjs):([0-9]{1,8}):([0-9]{1,8})'$/u.exec(line);
  if(!location)continue;
  const file=location[1].replace(/^bundled-/u,"");
  if(files.has(file))Object.assign(current,{file,line:Number(location[2]),column:Number(location[3])});
 }
 return {available:true,truncated:tail.truncated,failures,omitted};
}

export function reportNativeContractFailure(name,path,testFiles){
 console.error("NATIVE_CONTRACT_FAILURE "+JSON.stringify({name,...summarizeNativeContractFailure(path,testFiles)}));
}
