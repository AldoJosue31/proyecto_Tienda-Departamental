import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
const project=process.argv.includes("--business")?"web":"departamental-five-phases",recover=process.argv.includes("--recover-valid");
const run=(args,input)=>execFileSync("docker",args,{input,encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();
if(project==="web"&&recover){const release=JSON.parse(readFileSync("docs/release-fases-7-9.json","utf8"));for(const image of release.images){const state=JSON.parse(run(["inspect",`web-${image.service}-1`]))[0];assert.equal(state.Image,image.imageId);assert.ok(state.State.Running);}}
const domains=[
 ["servicio-logistica","shipments/shipments.consumer","ShipmentsConsumer","logistics.order-events.v1"],
 ["servicio-clientes","crm/crm.consumer","CrmConsumer","crm.order-projections.v1"],
 ["servicio-clientes","crm/campaign-delivery.consumer","CampaignDeliveryConsumer","crm.campaign-delivery-status.v1"],
 ["servicio-notificaciones","notifications/notification.consumer","NotificationConsumer","notification.coupon-emails.v1"],
];
const checks=[];
for(const [service,module,constructor,queue] of domains){const state=JSON.parse(run(["inspect",`${project}-${service}-1`]))[0];assert.equal(state.Config.Labels["com.docker.compose.project"],project);
 const script=`const {connect}=require('amqplib'); const Consumer=require('./dist/${module}').${constructor};(async()=>{const consumer=new Consumer({}, {environment:'test'});const connection=await connect(process.env.RABBITMQ_URL);connection.on('error',()=>{});const channel=await connection.createConfirmChannel();const queue=${JSON.stringify(queue)},dlq=queue+'.dlq',initial=await channel.checkQueue(dlq);if(initial.consumerCount||initial.messageCount>10000)throw Error('UNBOUNDED_DLQ');let valid=0,invalid=0,replayed=0;for(let i=0;i<initial.messageCount;i++){const message=await channel.get(dlq,{noAck:false});if(!message)throw Error('QUEUE_CHANGED');try{consumer.event(JSON.parse(message.content.toString()));}catch{invalid++;continue;}valid++;if(${recover}){channel.sendToQueue(queue,message.content,{...message.properties,persistent:true,headers:{...message.properties.headers,'x-projection-attempt':0,'x-controlled-replay':true}});await channel.waitForConfirms();channel.ack(message);replayed++;}}await channel.close();const observer=await connection.createChannel();const final=await observer.checkQueue(dlq);await observer.close();await connection.close();console.log(JSON.stringify({queue:dlq,initial:initial.messageCount,valid,invalid,replayed,retained:final.messageCount,confirmedBeforeAck:true,invalidPayloadsRetained:true,passed:final.messageCount===initial.messageCount-replayed}));})().catch(()=>{console.error('DOMAIN_DLQ_AUDIT_FAILED');process.exitCode=1;});`;
 const result=JSON.parse(run(["exec","-i",`${project}-${service}-1`,"node"],script));checks.push(result);assert.ok(result.passed);console.log("PASS domain DLQ "+queue+` valid ${result.valid}, invalid retained ${result.invalid}, replayed ${result.replayed}`);
}
writeFileSync(`docs/verification-domain-dlq-${project}.json`,JSON.stringify({completedAt:new Date().toISOString(),project,passed:checks.every(check=>check.passed),recoveryEnabled:recover,checks,secretsAndPayloadsExcluded:true},null,2)+"\n");
