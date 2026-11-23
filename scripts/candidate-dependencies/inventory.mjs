/** Inspect a selected Cargo graph without equating package metadata with legal approval. */
import {createHash} from "node:crypto";
import {lstatSync,readFileSync,readdirSync,realpathSync} from "node:fs";
import {dirname,isAbsolute,join,relative} from "node:path";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const compare=(a,b)=>a<b?-1:a>b?1:0;
const utf8=new TextDecoder("utf-8",{fatal:true});
const registry="registry+https://github.com/rust-lang/crates.io-index";
const noticeName=/^(?:licen[cs]e|copying|copyright|notice|authors)(?:[._-].*)?$/i;
function requireValue(condition,message){if(!condition)throw Error(message);}
function within(root,path){const part=relative(root,path);return !isAbsolute(part)&&part.split(/[\\/]/)[0]!=="..";}

/** Keep every non-dev edge, including build and target conditions, in sorted output. */
export function selectedCargoGraph(metadata,rootName,{firstPartyPaths,vendoredPaths}={}){
 requireValue(Array.isArray(metadata.packages)&&Array.isArray(metadata.resolve?.nodes),"Missing Cargo resolve graph");
 requireValue(metadata.packages.length<=4096,"Cargo graph exceeds package budget");
 const packages=new Map(metadata.packages.map(p=>[p.id,p])),nodes=new Map(metadata.resolve.nodes.map(n=>[n.id,n]));
 requireValue(packages.size===metadata.packages.length&&nodes.size===metadata.resolve.nodes.length,"Duplicate Cargo graph identity");
 const roots=metadata.packages.filter(p=>p.name===rootName&&p.source===null);requireValue(roots.length===1,"Ambiguous first-party Cargo root");
 const selected=new Set(),edges=[];
 function visit(id){
  if(selected.has(id))return;
  const item=packages.get(id),node=nodes.get(id);requireValue(item&&node,"Missing reachable Cargo package or node");selected.add(id);
  for(const dep of node.deps){
   requireValue(Array.isArray(dep.dep_kinds),"Missing dependency kind");
   for(const kind of dep.dep_kinds){
    requireValue([null,"build","dev"].includes(kind.kind),"Unknown Cargo dependency kind");
    if(kind.kind==="dev")continue;
    requireValue(kind.target===null||typeof kind.target==="string","Invalid target condition");
    edges.push({from:id,to:dep.pkg,kind:kind.kind??"normal",target:kind.target});visit(dep.pkg);
   }
  }
 }
 visit(roots[0].id);
 const sources=new Map(),identities=new Set();
 const rows=[...selected].map(id=>{
  const p=packages.get(id);requireValue(typeof p.name==="string"&&/^[a-zA-Z0-9_-]+$/.test(p.name)&&typeof p.version==="string"&&/^[0-9A-Za-z.+-]+$/.test(p.version),"Invalid Cargo package identity");
  const key=`${p.name}@${p.version}`;requireValue(!identities.has(key),"Ambiguous name/version source identity");identities.add(key);
  requireValue(typeof p.license==="string"&&p.license.length>0&&p.license.length<=1024,"Missing or oversized license metadata");
  const directory=realpathSync(dirname(p.manifest_path));let source;
  if(p.source===null){
   const first=firstPartyPaths?.[p.name],vendor=vendoredPaths?.[p.name];requireValue(Boolean(first)!==Boolean(vendor),"Unclassified local source");
   requireValue(directory===realpathSync(first??vendor),"Local Cargo dependency escaped its selected source");source=first?"first-party":"vendored";
  }else{requireValue(p.source===registry,"Unreviewed non-registry dependency source");source="crates.io";}
  const manifest=lstatSync(p.manifest_path);requireValue(manifest.isFile()&&manifest.size<=1024*1024&&dirname(realpathSync(p.manifest_path))===directory,"Unsupported source manifest");
  sources.set(id,{key,directory,source});return {key,name:p.name,version:p.version,source,license:p.license,sourceManifestSha256:sha256(readFileSync(p.manifest_path))};
 }).sort((a,b)=>compare(a.key,b.key));
 const uniqueEdges=new Map();for(const edge of edges){const normalized={from:sources.get(edge.from).key,to:sources.get(edge.to).key,kind:edge.kind,target:edge.target};uniqueEdges.set(JSON.stringify(normalized),normalized);}
 return {root:sources.get(roots[0].id).key,packages:rows,edges:[...uniqueEdges.values()].sort((a,b)=>compare(JSON.stringify(a),JSON.stringify(b))),sources};
}

/** Read exact upstream notice bytes. Missing files are an explicit audit gap. */
export function packageNotices(directory,{maxFiles=32768,maxNoticeBytes=1024*1024}={}){
 const root=realpathSync(directory),notices=[];let files=0,bytes=0;
 function walk(parent){for(const entry of readdirSync(parent,{withFileTypes:true}).sort((a,b)=>compare(a.name,b.name))){
  if(entry.name===".git"||entry.name==="target")continue;
  const path=join(parent,entry.name),stat=lstatSync(path);requireValue(++files<=maxFiles,"Source inventory exceeds file budget");
  requireValue(!stat.isSymbolicLink()&&within(root,realpathSync(path)),"Unsupported source symlink");
  if(stat.isDirectory()){walk(path);continue;}
  requireValue(stat.isFile(),"Unsupported source file type");
  if(!noticeName.test(entry.name))continue;
  requireValue(stat.size>0&&stat.size<=maxNoticeBytes&&bytes+stat.size<=8*1024*1024,"Notice byte budget exceeded");
  const contents=readFileSync(path);utf8.decode(contents);bytes+=contents.length;
  notices.push({path:relative(root,path).split("\\").join("/"),bytes:contents.length,sha256:sha256(contents),text:contents.toString("utf8")});
 }}
 walk(root);return notices;
}

/** Identify all shipped source files for a separately verified upstream release tag. */
export function registryReleaseSource(directory){
 const root=realpathSync(directory),generated=new Set([".cargo-ok",".cargo-checksum.json",".cargo_vcs_info.json","Cargo.lock","Cargo.toml"]);
 const files=[];let totalBytes=0,entries=0;
 function walk(parent){
  for(const entry of readdirSync(parent,{withFileTypes:true}).sort((a,b)=>compare(a.name,b.name))){
   requireValue(++entries<=4096,"Tagged release source exceeds file budget");
   const path=join(parent,entry.name),stat=lstatSync(path),name=relative(root,path).replaceAll("\\","/");
   requireValue(!stat.isSymbolicLink()&&within(root,realpathSync(path)),"Unsupported tagged release source symlink");
   if(stat.isDirectory()){walk(path);continue;}
   requireValue(stat.isFile(),"Unsupported tagged release source file");
   if(generated.has(name))continue;
   totalBytes+=stat.size;
   requireValue(totalBytes<=16*1024*1024,"Tagged release source exceeds byte budget");
   files.push([name,sha256(readFileSync(path))]);
  }
 }
 walk(root);
 requireValue(files.some(([name])=>name==="Cargo.toml.orig"),"Tagged release source lacks its original Cargo manifest");
 return {files:files.length,sha256:sha256(JSON.stringify(files))};
}

/** Describe the exact crates.io source available to recipients of MPL-covered binaries. */
function mplSourceArchives(packages,cargoLock){
 const covered=packages.filter(p=>p.source!=="first-party"&&/(?:^|[\s(])MPL-2\.0\+?(?=$|[\s)])/.test(p.license));
 if(!covered.length)return [];
 requireValue(typeof cargoLock==="string","MPL source archive lookup requires the selected Cargo.lock");
 const records=cargoLock.split(/^\[\[package\]\]\r?$/m).slice(1);
 return covered.map(p=>{
  requireValue(p.source==="crates.io",`MPL-covered vendored source needs its own source availability record: ${p.key}`);
  const entries=records.filter(record=>{
   const lines=record.split(/\r?\n/);
   return lines.includes(`name = "${p.name}"`)&&lines.includes(`version = "${p.version}"`)&&lines.includes(`source = "${registry}"`);
  });
  requireValue(entries.length===1,`Missing or ambiguous locked MPL source archive: ${p.key}`);
  const checksum=entries[0].match(/^checksum = "([a-f0-9]{64})"\r?$/m)?.[1];
  requireValue(checksum,`Missing locked MPL source checksum: ${p.key}`);
  return {package:p.key,url:`https://static.crates.io/crates/${p.name}/${p.name}-${p.version}.crate`,sha256:checksum};
 });
}

/** No timestamps or machine-specific paths enter the reproducible inventory digest. */
export function candidateDependencyInventory(metadata,rootName,options){
 const graph=selectedCargoGraph(metadata,rootName,options),byKey=new Map([...graph.sources.values()].map(value=>[value.key,value])),noticeTexts=[],gaps=[];
 const supplements=options?.upstreamNotices??[];requireValue(Array.isArray(supplements)&&supplements.length<=64,"Upstream notice inventory budget");
 const pinned=new Map(supplements.map(value=>[value.key,value]));requireValue(pinned.size===supplements.length,"Duplicate upstream notice owner");
 const packages=graph.packages.map(p=>{
  if(p.source==="first-party")return p;
  const source=byKey.get(p.key),raw=packageNotices(source.directory,options),supplement=pinned.get(p.key);
  if(supplement){
   requireValue(p.source==="crates.io"&&raw.length===0&&p.license===supplement.license,"Upstream notice supplement source or license drift");
   requireValue(typeof supplement.text==="string"&&supplement.text.length>0&&supplement.text.length<=1024*1024&&utf8.decode(Buffer.from(supplement.text))===supplement.text&&sha256(supplement.text)===supplement.sha256,"Upstream notice text hash drift");
   const release=supplement.release;
   const noticeRevision=release?.revision??supplement.revision;
   const url=new URL(supplement.url);requireValue(url.origin==="https://raw.githubusercontent.com"&&!url.username&&!url.password&&!url.search&&!url.hash&&/^[a-f0-9]{40}$/.test(noticeRevision)&&url.pathname.includes(`/${noticeRevision}/`)&&url.pathname.endsWith("/LICENSE"),"Upstream notice needs an immutable source URL");
   if(release!==undefined){
    const actual=registryReleaseSource(source.directory);
    requireValue(release?.tag===`v${p.version}`&&actual.files===release.sourceFiles&&actual.sha256===release.sourceSha256,"Tagged upstream notice differs from packaged source bytes");
   }
   const file=join(source.directory,".cargo_vcs_info.json"),stat=lstatSync(file);requireValue(stat.isFile()&&stat.size<=65536,"Unsupported upstream source revision evidence");
   const vcs=JSON.parse(readFileSync(file,"utf8"));requireValue(vcs.git?.sha1===supplement.revision&&vcs.git.dirty!==true&&vcs.path_in_vcs===supplement.pathInVcs,"Upstream notice differs from packaged source revision");
   raw.push({path:"upstream/LICENSE",bytes:Buffer.byteLength(supplement.text),sha256:supplement.sha256,text:supplement.text,origin:{url:supplement.url,revision:noticeRevision,pathInVcs:supplement.pathInVcs,
    ...(release?{packageRevision:supplement.revision,releaseTag:release.tag,sourceSha256:release.sourceSha256}:{}),
   }});
  }
  const notices=raw.map(({text,...notice})=>{noticeTexts.push({package:p.key,...notice,text});return notice;});
  if(!notices.length)gaps.push({package:p.key,reason:"no-notice-text-in-cargo-source"});
  return {...p,notices};
 });
 const sourceArchives=mplSourceArchives(packages,options?.cargoLock);
 const body={format:"breditor/candidate-dependency-inventory",formatVersion:1,root:graph.root,packages,edges:graph.edges,gaps,...(sourceArchives.length?{mplSourceArchives:sourceArchives}:{}),crateSourceVerification:"not-performed",licenseReview:"not-approved",publicationApproved:false};
 return {inventory:{...body,sha256:sha256(JSON.stringify(body))},noticeTexts};
}
