import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {readFileSync,writeFileSync,createReadStream} from "node:fs";
import {createHash} from "node:crypto";
import {pipeline} from "node:stream/promises";
// Avoid a second large Windows/VHD allocation on this nearly full host. A
// dedicated persistent, labelled volume holds the new compressed image archive;
// old rollback archives and database/broker dumps stay outside Docker privately.
const release=JSON.parse(readFileSync("docs/release-fases-7-9.json","utf8")),base=JSON.parse(readFileSync("docs/verification-release-archive-fases-4-6.json","utf8"));
assert.match(release.releaseId,/^fases-7-9-[0-9]{8}-[a-f0-9]{12}$/);
assert.ok(base.passed&&base.loadedArchiveVerified);
const archives=base.archives??[base],covered=new Set(archives.flatMap(item=>item.imageIds));
for(const item of archives){const hash=createHash("sha256");for await(const chunk of createReadStream(item.archive))hash.update(chunk);assert.equal(hash.digest("hex"),item.sha256);}
const baseline=release.baselines.find(item=>item.project==="web"),required=[...new Set([...release.images,...baseline.imageIds].map(item=>item.imageId))],ids=required.filter(id=>!covered.has(id));assert.ok(ids.length>0);
const run=args=>execFileSync("docker",args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
for(const id of required)assert.equal(run(["image","inspect","--format","{{.Id}}",id]),id);
const volume="departamental-certified-image-archives",name="release-archive-writer",file=release.releaseId+".images.tar.gz",image=release.images.find(item=>item.service==="servicio-catalogo").imageId;
run(["volume","create","--label","codex.release-archives=true",volume]);assert.equal(JSON.parse(run(["volume","inspect",volume]))[0].Labels["codex.release-archives"],"true");
run(["run","-d","--name",name,"--label","codex.archive-writer=true","--read-only","--network","none","--user","0:0","--mount",`type=volume,source=${volume},target=/archive`,"--entrypoint","sh",image,"-c","sleep infinity"]);
const completion=process=>new Promise((resolve,reject)=>{process.stderr.resume();process.on("error",reject);process.on("exit",code=>code===0?resolve():reject(Error("ARCHIVE_PIPE_FAILED")));});
let result;
try{
 const save=spawn("docker",["save",...ids],{windowsHide:true,stdio:["ignore","pipe","pipe"]}),writer=spawn("docker",["exec","-i",name,"sh","-c",`gzip -9 -c > /archive/${file}.incomplete && mv /archive/${file}.incomplete /archive/${file}`],{windowsHide:true,stdio:["pipe","ignore","pipe"]});
 await Promise.all([pipeline(save.stdout,writer.stdin),completion(save),completion(writer)]);
 const sha256=run(["exec",name,"sha256sum","/archive/"+file]).split(/\s+/)[0],bytes=Number(run(["exec",name,"stat","-c","%s","/archive/"+file]));
 const reader=spawn("docker",["exec",name,"cat","/archive/"+file],{windowsHide:true,stdio:["ignore","pipe","pipe"]}),load=spawn("docker",["load"],{windowsHide:true,stdio:["pipe","ignore","pipe"]});await Promise.all([pipeline(reader.stdout,load.stdin),completion(reader),completion(load)]);
 for(const id of required)assert.equal(run(["image","inspect","--format","{{.Id}}",id]),id);
 result={archive:`docker-volume:${volume}/${file}`,storage:"persistent labelled Docker volume",volume,file,sha256,bytes,imageIds:ids,loadedArchiveVerified:true};
}finally{const state=JSON.parse(run(["inspect",name]))[0];assert.equal(state.Config.Labels["codex.archive-writer"],"true");run(["rm","-f",name]);}
writeFileSync("docs/verification-release-archive-fases-7-9.json",JSON.stringify({completedAt:new Date().toISOString(),releaseId:release.releaseId,passed:true,incremental:true,archives:[...archives.map(item=>({...item,checksumReverified:true})),result],requiredImageIds:required,imageCount:required.length,loadedArchiveVerified:true,containsPrincipalRollbackAndCandidate:true,secretsExcluded:true,storageLimitation:"New image archive shares Docker's physical disk; database/broker checkpoints and old rollback image archives remain in the private Windows backup directory. External disaster-recovery storage is outside this university scope."},null,2)+"\n");console.log(`PASS ${ids.length} new exact images saved and reloaded from a private persistent archive; ${required.length} required images covered`);
