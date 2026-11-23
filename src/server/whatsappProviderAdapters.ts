import crypto from 'node:crypto';
import type {
  NormalizedWhatsAppEvent, WhatsAppMediaReference, WhatsAppMessageStatus,
  WhatsAppProvider, WhatsAppProviderAdapter, WhatsAppProviderCredentials,
  WhatsAppProviderTemplate, WhatsAppProviderValidation, WhatsAppSender,
  WhatsAppSendResult, WhatsAppWebhookRequest,
} from './whatsappProviderTypes.js';

export class ProviderApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message); this.name = 'ProviderApiError'; this.statusCode = statusCode;
  }
}
const META_GRAPH = (v?: string) => 'https://graph.facebook.com/' + String(v || process.env.META_GRAPH_API_VERSION || 'v23.0').replace(/^\/+|\/+$/g, '');
const clean = (v: unknown) => String(v ?? '').trim();
const digits = (v: unknown) => clean(v).replace(/^whatsapp:/i, '').replace(/\D/g, '');
const e164 = (v: unknown) => {
  const d = digits(v);
  if (!/^[1-9]\d{7,14}$/.test(d)) throw new ProviderApiError(400, 'Sender or recipient must be a valid international phone number.');
  return '+' + d;
};
const now = () => new Date().toISOString();
const status = (v: unknown): WhatsAppMessageStatus => {
  const s = clean(v).toLowerCase();
  if (['read','seen'].includes(s)) return 'READ';
  if (['delivered','delivery'].includes(s)) return 'DELIVERED';
  if (['sent','queued','submitted'].includes(s)) return 'SENT';
  if (['failed','undelivered','rejected','error'].includes(s)) return 'FAILED';
  return 'ACCEPTED';
};
const headersObject = (headers: WhatsAppWebhookRequest['headers']) =>
  Object.fromEntries(Object.entries(headers || {}).map(([k,v]) => [k.toLowerCase(), Array.isArray(v) ? String(v[0] || '') : String(v || '')]));
const rawText = (request: WhatsAppWebhookRequest) => Buffer.isBuffer(request.rawBody) ? request.rawBody.toString('utf8') : typeof request.rawBody === 'string' ? request.rawBody : '';
const constantTimeString = (a: string,b: string) => {
  const aa=Buffer.from(a), bb=Buffer.from(b);
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
};
async function requestJson(url: string, init: RequestInit = {}): Promise<any> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(20000) }); }
  catch (error: any) { throw new ProviderApiError(502, error?.message || 'Provider request failed.'); }
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const msg = data?.error?.message || data?.message || data?.result?.message || response.statusText || 'Provider rejected the request.';
    throw new ProviderApiError(response.status, String(msg).slice(0, 500));
  }
  return data;
}
function metaCapabilities() {
  return { textMessages:true, templates:true, media:true, interactiveMessages:true, inboundWebhooks:true, deliveryUpdates:true, readUpdates:true, templateSync:true, automaticWebhookSetup:false, historicalSync:false };
}
function twilioCapabilities() {
  return { textMessages:true, templates:true, media:true, interactiveMessages:false, inboundWebhooks:true, deliveryUpdates:true, readUpdates:true, templateSync:true, automaticWebhookSetup:false, historicalSync:false };
}
function watiCapabilities() {
  return { textMessages:true, templates:true, media:true, interactiveMessages:false, inboundWebhooks:true, deliveryUpdates:true, readUpdates:true, templateSync:true, automaticWebhookSetup:true, historicalSync:false };
}
function metaBody(raw: string, phone: string, type: string, text?: string, media?: WhatsAppMediaReference[]) {
  const base: any = { messaging_product:'whatsapp', recipient_type:'individual', to:digits(phone) };
  if (type === 'template') return base;
  if (media?.length) {
    const m=media[0]; const kind=(m.mimeType || '').split('/')[0];
    const category=kind==='image'?'image':kind==='video'?'video':kind==='audio'?'audio':'document';
    base.type=category; base[category]={ ...(m.providerMediaId?{id:m.providerMediaId}:{link:m.url}), ...(category==='document'&&m.fileName?{filename:m.fileName}:{}), ...(m.caption?{caption:m.caption}:{}) };
  } else { base.type='text'; base.text={ preview_url:false, body:text || raw }; }
  return base;
}
async function postMeta(credentials: WhatsAppProviderCredentials, sender: WhatsAppSender, payload: any) {
  const token=clean(credentials.accessToken || credentials.systemUserAccessToken);
  if(!token) throw new ProviderApiError(400,'Meta access token is missing.');
  const data=await requestJson(META_GRAPH(credentials.graphVersion)+'/'+encodeURIComponent(sender.providerSenderId)+'/messages',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),
  });
  const id=clean(data?.messages?.[0]?.id || data?.message_id || data?.id);
  if(!id) throw new ProviderApiError(502,'Meta accepted no message identifier.');
  return { providerMessageId:id,status:'ACCEPTED' as const,acceptedAt:now(),providerStatus:'accepted' };
}
async function validateMeta(c: WhatsAppProviderCredentials): Promise<WhatsAppProviderValidation> {
  const token=clean(c.accessToken || c.systemUserAccessToken), waba=clean(c.wabaId || c.businessAccountId), phoneId=clean(c.phoneNumberId);
  if(!token) throw new ProviderApiError(400,'Enter the Meta System User access token.');
  if(!waba && !phoneId) throw new ProviderApiError(400,'Enter the WhatsApp Business Account ID or Phone Number ID.');
  const graph=META_GRAPH(c.graphVersion);
  const auth={Authorization:'Bearer '+token};
  let accountId=waba, accountName='Meta WhatsApp Business';
  if(waba){
    const account=await requestJson(graph+'/'+encodeURIComponent(waba)+'?fields=id,name',{headers:auth});
    accountId=clean(account.id || waba); accountName=clean(account.name || accountName);
  }
  let senderRows:any[]=[];
  if(waba){
    const rows=await requestJson(graph+'/'+encodeURIComponent(waba)+'/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=100',{headers:auth});
    senderRows=Array.isArray(rows.data)?rows.data:[];
  }
  if(phoneId && !senderRows.some(x=>String(x.id)===phoneId)){
    const row=await requestJson(graph+'/'+encodeURIComponent(phoneId)+'?fields=id,display_phone_number,verified_name,quality_rating',{headers:auth});
    senderRows.push(row);
  }
  const senders: WhatsAppSender[]=senderRows.map(row=>({
    providerSenderId:clean(row.id), phoneNumber:e164(row.display_phone_number),
    providerAccountId:accountId, displayName:clean(row.verified_name), verifiedName:clean(row.verified_name),
  })).filter(x=>x.providerSenderId);
  return {valid:true,providerAccountId:accountId,accountName,senders,capabilities:metaCapabilities(),validatedAt:now(),
    warnings: senders.length ? [] : ['No WhatsApp sender numbers were returned for this account.']};
}
async function sendMetaTemplate(c:WhatsAppProviderCredentials,input:any) {
  const variables:Record<string,string> = input.variables || {};
  const fallbackValues = Object.values(variables);
  const components: any[] = [];
  for (const component of (Array.isArray(input.template.components) ? input.template.components : [])) {
    const type = clean(component?.type).toUpperCase();
    if (type !== 'BODY' && type !== 'HEADER') continue;
    const textValue = clean(component?.text);
    const placeholders = [...textValue.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match:any) => String(match[1]).trim());
    if (!placeholders.length) continue;
    const parameters = placeholders.map((name, index) => ({
      type: 'text',
      text: String(variables[name] ?? fallbackValues[index] ?? ''),
    }));
    components.push({ type: type.toLowerCase(), parameters });
  }
  if (!components.some((component) => component.type === 'body') && fallbackValues.length) {
    components.push({ type: 'body', parameters: fallbackValues.map((value) => ({ type: 'text', text: String(value) })) });
  }
  return postMeta(c,input.sender,{messaging_product:'whatsapp',to:digits(input.recipientPhone),type:'template',
    template:{name:input.template.name,language:{code:input.template.language},...(components.length?{components}:{})}});
}
const metaAdapter: WhatsAppProviderAdapter = {
 provider:'META',capabilities:metaCapabilities(),validateCredentials:validateMeta,
 sendText:(c,i)=>postMeta(c,i.sender,{messaging_product:'whatsapp',to:digits(i.recipientPhone),type:'text',text:{preview_url:false,body:i.text}}),
 sendTemplate:sendMetaTemplate,
 sendMedia:(c,i)=>postMeta(c,i.sender,metaBody('',i.recipientPhone,'media',undefined,[i.media])),
 async listTemplates(c,sender){
   const token=clean(c.accessToken || c.systemUserAccessToken), account=clean(c.messagingAccountId || c.wabaId || c.businessAccountId);
   if(!token || !account) throw new ProviderApiError(400,'Meta WABA ID and access token are required to sync templates.');
   const data=await requestJson(META_GRAPH(c.graphVersion)+'/'+encodeURIComponent(account)+'/message_templates?fields=id,name,language,status,category,components&limit=250',{headers:{Authorization:'Bearer '+token}});
   return (Array.isArray(data.data)?data.data:[]).map((t:any)=>({providerTemplateId:clean(t.id),name:clean(t.name),language:clean(t.language)||'en_US',category:clean(t.category),status:clean(t.status).toUpperCase(),components:Array.isArray(t.components)?t.components:[],updatedAt:t.updated_time}));
 },
 async verifyWebhook(req,c){
   const secret=clean(c.appSecret || process.env.META_APP_SECRET), signature=headersObject(req.headers)['x-hub-signature-256'], raw=rawText(req);
   if(!secret || !signature || !raw) return false;
   const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
   return constantTimeString(signature,expected);
 },
 async normalizeWebhook(req,connectionId){
   const body:any=req.body || {}; const out:NormalizedWhatsAppEvent[]=[];
   for(const entry of Array.isArray(body.entry)?body.entry:[]) for(const change of Array.isArray(entry.changes)?entry.changes:[]){
     const value=change.value || {}, metadata=value.metadata || {}, businessPhone=clean(metadata.display_phone_number);
     for(const m of Array.isArray(value.messages)?value.messages:[]){
       const type=clean(m.type), txt=m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
       const media:WhatsAppMediaReference[]=[];
       const mediaPart=m[type];
       if(mediaPart && mediaPart.id) media.push({providerMediaId:clean(mediaPart.id),mimeType:clean(mediaPart.mime_type),fileName:clean(mediaPart.filename),caption:clean(mediaPart.caption)});
       out.push({kind:'INBOUND_MESSAGE',provider:'META',connectionId,providerMessageId:clean(m.id),senderPhone:e164(m.from),businessPhone:e164(businessPhone || metadata.phone_number_id),messageType:type,text:clean(txt),media,senderName:clean(value.contacts?.[0]?.profile?.name),timestamp:m.timestamp?new Date(Number(m.timestamp)*1000).toISOString():now()});
     }
     for(const s of Array.isArray(value.statuses)?value.statuses:[]){
       out.push({kind:'MESSAGE_STATUS',provider:'META',connectionId,providerMessageId:clean(s.id),status:status(s.status),timestamp:s.timestamp?new Date(Number(s.timestamp)*1000).toISOString():now(),errorCode:clean(s.errors?.[0]?.code),errorMessage:clean(s.errors?.[0]?.message)});
     }
   }
   return out.filter(e=>e.providerMessageId);
 },
};

function twilioAuth(c:WhatsAppProviderCredentials) {
 const sid=clean(c.accountSid || c.accountSID), token=clean(c.authToken);
 if(!sid || !token) throw new ProviderApiError(400,'Twilio Account SID and Auth Token are required.');
 return {sid,token,header:'Basic '+Buffer.from(sid+':'+token).toString('base64')};
}
async function validateTwilio(c:WhatsAppProviderCredentials):Promise<WhatsAppProviderValidation>{
 const {sid,header}=twilioAuth(c);
 const data=await requestJson('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'.json',{headers:{Authorization:header}});
 const phone=e164(c.senderNumber), senderSid=clean(c.senderSid);
 return {valid:true,providerAccountId:sid,accountName:clean(data.friendly_name)||'Twilio account',
  senders:[{providerSenderId:senderSid || phone,phoneNumber:phone,providerAccountId:sid,displayName:'Twilio WhatsApp sender'}],
  capabilities:twilioCapabilities(),validatedAt:now(),warnings:['Configure both inbound webhook and status callback on the WhatsApp-enabled Twilio sender.']};
}
async function sendTwilio(c:WhatsAppProviderCredentials,i:any):Promise<WhatsAppSendResult>{
 const {sid,header}=twilioAuth(c), from=e164(c.sender.phoneNumber), to=e164(i.recipientPhone);
 const form=new URLSearchParams({To:'whatsapp:'+to});
 if(c.messagingServiceSid) form.set('MessagingServiceSid',clean(c.messagingServiceSid));
 else form.set('From','whatsapp:'+from);
 if(i.text) form.set('Body',String(i.text));
 if(i.media?.url) form.set('MediaUrl',String(i.media.url));
 if(i.template?.contentSid || c.contentSid) form.set('ContentSid',String(i.template?.contentSid || c.contentSid));
 if(i.template && i.variables) form.set('ContentVariables',JSON.stringify(i.variables));
 if(c.statusCallbackUrl) form.set('StatusCallback',clean(c.statusCallbackUrl));
 const data=await requestJson('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'/Messages.json',{method:'POST',headers:{Authorization:header,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
 const id=clean(data.sid); if(!id) throw new ProviderApiError(502,'Twilio returned no message SID.');
 return {providerMessageId:id,status:status(data.status),acceptedAt:now(),providerStatus:clean(data.status)};
}
function verifyTwilio(req:WhatsAppWebhookRequest,c:WhatsAppProviderCredentials):boolean{
 const token=clean(c.authToken),signature=headersObject(req.headers)['x-twilio-signature'],rawBody= req.body as any;
 if(!token || !signature || !rawBody || typeof rawBody!=='object') return false;
 let value=String(req.url);
 for(const key of Object.keys(rawBody).sort()) value+=key+String(rawBody[key] ?? '');
 const expected=crypto.createHmac('sha1',token).update(value).digest('base64');
 return constantTimeString(signature,expected);
}
const twilioAdapter:WhatsAppProviderAdapter={
 provider:'TWILIO',capabilities:twilioCapabilities(),validateCredentials:validateTwilio,
 sendText:(c,i)=>sendTwilio(c,{...i,text:i.text}),
 sendMedia:(c,i)=>sendTwilio(c,{...i,media:i.media}),
 async sendTemplate(c,i){
   if(!i.template.providerTemplateId) throw new ProviderApiError(422,'This Twilio template has no Content SID.');
   return sendTwilio(c,{...i,template:{...i.template,contentSid:i.template.providerTemplateId}});
 },
 async listTemplates(c){
   const {header}=twilioAuth(c);
   const authHeaders={Authorization:header};
   const resources:any[]=[];
   let nextUrl:string|undefined='https://content.twilio.com/v1/ContentAndApprovals?PageSize=100';
   // Twilio returns a cursor URL in meta.next_page_url. Bound the sync to 5 pages per request.
   for(let page=0;nextUrl && page<5;page++){
     const data=await requestJson(nextUrl,{headers:authHeaders});
     const pageRows=Array.isArray(data.contents)?data.contents:[];
     resources.push(...pageRows);
     nextUrl=clean(data?.meta?.next_page_url)||undefined;
     if(nextUrl && !nextUrl.startsWith('https://content.twilio.com/')) {
       throw new ProviderApiError(502,'Twilio returned an unexpected pagination URL.');
     }
   }
   return resources.map((x:any)=>{
     const approval=x.approvals?.whatsapp || x.approvals?.WhatsApp || x.whatsapp || x.approval_requests?.whatsapp || {};
     const rawStatus=clean(approval.status || x.whatsapp_status || x.approval_status || x.status);
     const normalizedStatus=rawStatus.toUpperCase()==='APPROVED'?'APPROVED':rawStatus.toUpperCase();
     const contentTypes=x.types || x.content?.types || {};
     const preferred=contentTypes['twilio/text'] || contentTypes['twilio/quick-reply'] || Object.values(contentTypes).find((v:any)=>typeof v?.body==='string') || {};
     const body=clean((preferred as any).body);
     const placeholders=[...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match:any)=>String(match[1]).trim());
     const declaredVariables=Object.keys(x.variables || {});
     const parameterNames=placeholders.length?placeholders:declaredVariables;
     const components=body?[{type:'BODY',text:body}]:[];
     return {
       providerTemplateId:clean(x.sid || x.content_sid || x.contentSid),
       name:clean(x.friendly_name || x.friendlyName || x.name) || clean(x.sid),
       language:clean(x.language)||'en',
       status:normalizedStatus,
       components,
       customParams:parameterNames.map((name:string)=>({name})),
       updatedAt:x.date_updated || x.dateUpdated,
     };
   }).filter((template:any)=>template.providerTemplateId && template.name);
 },
 verifyWebhook:async(req,c)=>verifyTwilio(req,c),
 async normalizeWebhook(req,connectionId){
   const b:any=req.body||{}, out:NormalizedWhatsAppEvent[]=[];
   const id=clean(b.MessageSid || b.SmsMessageSid || b.messageSid || b.messageId);
   const to=clean(b.To || b.to), from=clean(b.From || b.from);
   if(b.MessageStatus || b.SmsStatus || b.message_status){
     out.push({kind:'MESSAGE_STATUS',provider:'TWILIO',connectionId,providerMessageId:id,status:status(b.MessageStatus||b.SmsStatus||b.message_status),timestamp:now(),errorCode:clean(b.ErrorCode),errorMessage:clean(b.ErrorMessage)});
   } else if(id && from && to){
     out.push({kind:'INBOUND_MESSAGE',provider:'TWILIO',connectionId,providerMessageId:id,senderPhone:e164(from),businessPhone:e164(to),messageType:b.NumMedia && Number(b.NumMedia)>0?'media':'text',text:clean(b.Body),media:Number(b.NumMedia)>0?[{url:clean(b.MediaUrl0),mimeType:clean(b.MediaContentType0)}]:[],timestamp:now(),providerConversationId:clean(b.ConversationSid)||undefined});
   }
   return out;
 },
};

const watiBase=(c:WhatsAppProviderCredentials)=>{
 const raw=clean(c.apiEndpoint);
 try { const parsed=new URL(raw); if(parsed.protocol!=='https:') throw new Error('HTTPS required'); return parsed.origin; }
 catch { throw new ProviderApiError(400,'Enter the WATI HTTPS API host only, for example https://live-mt-server.wati.io.'); }
};
const watiToken=(c:WhatsAppProviderCredentials)=>clean(c.accessToken);
const watiHeaders=(c:WhatsAppProviderCredentials)=>({Authorization:'Bearer '+watiToken(c),'Content-Type':'application/json',Accept:'application/json'});
const watiRows=(data:any):any[]=>{
 const candidates=[data?.data?.items,data?.data?.channels,data?.data?.messageTemplates,data?.data?.templates,data?.items,data?.channels,data?.messageTemplates,data?.templates,data?.result?.items,data?.result?.channels,data?.result?.messageTemplates,data?.result?.templates,data?.result,data?.data];
 return candidates.find(Array.isArray) || [];
};
const watiTimestamp=(value:any)=>{
 const raw=clean(value); if(!raw) return now();
 const n=Number(raw); if(Number.isFinite(n)) return new Date(n<1e12?n*1000:n).toISOString();
 const parsed=new Date(raw); return Number.isNaN(parsed.getTime())?now():parsed.toISOString();
};
async function validateWati(c:WhatsAppProviderCredentials):Promise<WhatsAppProviderValidation>{
 const base=watiBase(c),token=watiToken(c),tenant=clean(c.tenantId);
 if(!token) throw new ProviderApiError(400,'WATI API token is required.');
 if(!tenant) throw new ProviderApiError(400,'Enter the WATI workspace tenant ID. It is required for webhook subscription setup.');
 const data=await requestJson(base+'/api/ext/v3/channels?page_number=1&page_size=100',{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 if(data?.success===false) throw new ProviderApiError(401,clean(data.error||data.message)||'WATI rejected the API token.');
 const rows=watiRows(data);
 const senders:WhatsAppSender[]=[];
 for(const row of rows){
   const phoneValue=row.phoneNumber||row.phone_number||row.channelPhoneNumber||row.channel_phone_number||row.number||row.phone||row?.channel?.phoneNumber;
   if(!phoneValue) continue;
   try{
     const phone=e164(phoneValue);
     const name=clean(row.channelName||row.channel_name||row.name||row.displayName);
     senders.push({providerSenderId:phone,phoneNumber:phone,providerAccountId:tenant,displayName:name||'WATI WhatsApp sender'});
   }catch{/* Ignore non-phone channel records. */}
 }
 const configuredPhone=clean(c.senderNumber);
 if(configuredPhone){
   const phone=e164(configuredPhone);
   if(!senders.some(x=>x.phoneNumber===phone)) senders.push({providerSenderId:phone,phoneNumber:phone,providerAccountId:tenant,displayName:'Configured WATI default channel'});
 }
 if(!senders.length) throw new ProviderApiError(422,'WATI authenticated successfully, but no WhatsApp channel was returned. Enter the connected WATI sender number and validate again.');
 return {valid:true,providerAccountId:tenant,accountName:clean(data?.workspaceName||data?.accountName)||'WATI workspace',senders,capabilities:watiCapabilities(),validatedAt:now(),warnings:['WATI V3 channel and template APIs are used. Webhook creation needs the webhook scope and WATI tenant ID.']};
}
async function watiCall(c:WhatsAppProviderCredentials,path:string,body?:any,method='POST'){
 return requestJson(watiBase(c)+path,{method,headers:watiHeaders(c),...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
function watiMessageId(data:any, fallback?:string){
 return clean(data?.whatsappMessageId||data?.whatsapp_message_id||data?.messageId||data?.message_id||data?.localMessageId||data?.local_message_id||data?.data?.whatsappMessageId||data?.data?.messageId||data?.data?.id||data?.id||fallback);
}
function checkWatiBusinessResult(data:any){
 if(data?.success===false || data?.ok===false){
   throw new ProviderApiError(422,clean(data?.error||data?.message||data?.info)||'WATI rejected the message request.');
 }
 const recipients=Array.isArray(data?.recipients)?data.recipients:Array.isArray(data?.data?.recipients)?data.data.recipients:[];
 if(recipients.some((x:any)=>x?.success===false || x?.error || x?.errors?.length)){
   const failed=recipients.find((x:any)=>x?.success===false||x?.error||x?.errors?.length);
   throw new ProviderApiError(422,clean(failed?.error||failed?.message||failed?.errors?.[0]?.message)||'WATI rejected this recipient.');
 }
}
function watiTarget(sender:WhatsAppSender,recipient:string){
 return digits(sender.phoneNumber)+':'+digits(recipient);
}
async function sendWatiText(c:WhatsAppProviderCredentials,i:any):Promise<WhatsAppSendResult>{
 const localId=clean(i.clientMessageId)||'wati_'+crypto.randomUUID();
 const data=await watiCall(c,'/api/ext/v3/conversations/messages/text',{target:watiTarget(i.sender,i.recipientPhone),text:String(i.text||''),is_bot:i.senderType!=='AGENT'});
 checkWatiBusinessResult(data);
 return {providerMessageId:watiMessageId(data,localId),status:'ACCEPTED',acceptedAt:now(),providerStatus:clean(data?.status||'accepted')};
}
async function sendWatiMedia(c:WhatsAppProviderCredentials,i:any):Promise<WhatsAppSendResult>{
 const url=clean(i.media?.url);
 if(!url) throw new ProviderApiError(422,'WATI V3 media sending requires a public file URL.');
 const localId=clean(i.clientMessageId)||'wati_'+crypto.randomUUID();
 const data=await watiCall(c,'/api/ext/v3/conversations/messages/fileViaUrl',{
   target:watiTarget(i.sender,i.recipientPhone),file_url:url,caption:clean(i.media?.caption)||undefined,is_bot:i.senderType!=='AGENT',
 });
 checkWatiBusinessResult(data);
 return {providerMessageId:watiMessageId(data,localId),status:'ACCEPTED',acceptedAt:now(),providerStatus:clean(data?.status||'accepted')};
}
function watiCustomParams(template:WhatsAppProviderTemplate,variables:Record<string,string>){
 const definitions=(template.customParams||[]).map((item:any)=>typeof item==='string'?{name:item}:item);
 const names=definitions.map((item:any)=>clean(item?.name||item?.paramName||item?.param_name||item?.key||item?.placeholder)).filter(Boolean);
 if(names.length){
   const missing=names.filter((name:string)=>variables[name]===undefined);
   if(missing.length) throw new ProviderApiError(422,'Map every WATI template parameter before sending: '+missing.join(', '));
   return names.map((name:string)=>({name,value:String(variables[name])}));
 }
 return Object.entries(variables||{}).map(([name,value])=>({name,value:String(value)}));
}
async function sendWatiTemplate(c:WhatsAppProviderCredentials,i:any):Promise<WhatsAppSendResult>{
 const localId=clean(i.clientMessageId)||'wati_'+crypto.randomUUID();
 const parameters=watiCustomParams(i.template,i.variables||{});
 const data=await watiCall(c,'/api/ext/v3/messageTemplates/send',{
   template_name:i.template.name,
   broadcast_name:'Amaavigo '+i.template.name,
   channel:i.sender.phoneNumber,
   recipients:[{target:digits(i.recipientPhone),local_message_id:localId,...(parameters.length?{custom_params:parameters}:{})}],
 });
 checkWatiBusinessResult(data);
 const recipientRows=Array.isArray(data?.recipients)?data.recipients:Array.isArray(data?.data?.recipients)?data.data.recipients:[];
 const matchingRecipient=recipientRows.find((row:any)=>digits(row?.target||row?.phone_number||row?.whatsappNumber||'')===digits(i.recipientPhone));
 const id=watiMessageId(matchingRecipient||{},localId);
 return {providerMessageId:id,status:'ACCEPTED',acceptedAt:now(),providerStatus:clean(data?.status||'accepted')};
}
async function listWatiTemplates(c:WhatsAppProviderCredentials,sender:WhatsAppSender):Promise<WhatsAppProviderTemplate[]>{
 const queryString=new URLSearchParams({page_number:'1',page_size:'100',channel:sender.phoneNumber}).toString();
 const data=await requestJson(watiBase(c)+'/api/ext/v3/messageTemplates?'+queryString,{headers:{Authorization:'Bearer '+watiToken(c),Accept:'application/json'}});
 if(data?.success===false) throw new ProviderApiError(422,clean(data?.error||data?.message)||'WATI template query failed.');
 return watiRows(data).map((item:any)=>({
   providerTemplateId:clean(item.id||item.template_id||item.name||item.elementName),
   name:clean(item.name||item.template_name||item.elementName),
   language:clean(item.language||item.language_code)||'en',
   category:clean(item.category),
   status:clean(item.status||item.approval_status||item.templateStatus).toUpperCase(),
   components:Array.isArray(item.components)?item.components:[],
   customParams:Array.isArray(item.custom_params)?item.custom_params:Array.isArray(item.customParams)?item.customParams:Array.isArray(item.parameters)?item.parameters:[],
   updatedAt:item.updated_at||item.updatedAt,
 })).filter((item:WhatsAppProviderTemplate)=>item.providerTemplateId&&item.name);
}
async function registerWatiWebhook(c:WhatsAppProviderCredentials,callbackUrl:string){
 const tenant=clean(c.tenantId),base=watiBase(c),token=watiToken(c);
 if(!tenant) throw new ProviderApiError(400,'WATI tenant ID is required to create the webhook.');
 const eventsData=await requestJson(base+'/api/ext/v3/webhooks/event-types',{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 const rawEvents = [
   eventsData?.event_types, eventsData?.eventTypes,
   eventsData?.data?.event_types, eventsData?.data?.eventTypes,
   eventsData?.result?.event_types, eventsData?.result?.eventTypes,
   eventsData?.data, eventsData?.result, eventsData,
 ].find(Array.isArray) || [];
 const available=rawEvents.map((item:any)=>typeof item==='string'?item:clean(item?.eventType||item?.name||item?.event_type)).filter(Boolean);
 const desired=new Set(['message','message_bsuid','sentMessageSENT_v2','sentMessageDELIVERED_v2','sentMessageREAD_v2','sessionMessageFailed','templateMessageFailed']);
 const eventTypes=available.filter((name:string)=>desired.has(name));
 if(!eventTypes.length) throw new ProviderApiError(422,'WATI returned no supported inbound or delivery webhook event types for this workspace. Configure them manually in WATI Webhooks.');
 const data=await requestJson(base+'/'+encodeURIComponent(tenant)+'/api/v2/webhookEndpoints',{
   method:'POST',headers:watiHeaders(c),
   body:JSON.stringify([{phoneNumber:digits(c.senderNumber),url:callbackUrl,status:1,eventTypes}]),
 });
 if(data?.ok===false || data?.success===false) throw new ProviderApiError(422,clean(data?.info||data?.error||data?.message)||'WATI webhook subscription could not be created.');
 const subscriptionId=clean(data?.webhookId||data?.webhook_id||data?.id||data?.data?.webhookId||data?.data?.id||data?.result?.id);
 if(!subscriptionId) throw new ProviderApiError(502,'WATI did not return a webhook subscription ID. Check WATI Webhooks before retrying.');
 return {subscriptionId,status:'ACTIVE' as const};
}
async function deleteWatiWebhook(c:WhatsAppProviderCredentials,subscriptionId:string):Promise<void>{
 const id=encodeURIComponent(subscriptionId);
 await requestJson(watiBase(c)+'/api/ext/v3/webhooks/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+watiToken(c),Accept:'application/json'}});
}
function watiStatusEvent(root:any,eventType:string){
 const et=eventType.toLowerCase();
 if(et.includes('read')) return true;
 if(et.includes('deliver')) return true;
 if(et.includes('fail') || et.includes('undeliver')) return true;
 return root?.owner===true && /sent|accepted|queued/i.test(clean(root?.statusString||root?.status));
}
const watiAdapter:WhatsAppProviderAdapter={
 provider:'WATI',capabilities:watiCapabilities(),validateCredentials:validateWati,
 sendText:(c,i)=>sendWatiText(c,i),sendMedia:(c,i)=>sendWatiMedia(c,i),sendTemplate:(c,i)=>sendWatiTemplate(c,i),
 listTemplates:listWatiTemplates,
 async verifyWebhook(req,c){
   const secret=clean(c.webhookSecret); if(!secret) return true;
   const h=headersObject(req.headers);
   const presented=clean(h['x-webhook-secret']||h['x-wati-signature']||h.authorization).replace(/^Bearer\s+/i,'');
   return constantTimeString(presented,secret);
 },
 async normalizeWebhook(req,connectionId){
   const b:any=req.body||{},root=b.eventData||b.data||b.payload||b;
   const eventType=clean(root.eventType||b.eventType);
   const messageId=clean(root.whatsappMessageId||root.whatsapp_message_id||root.id||root.messageId);
   const statusId=clean(root.localMessageId||root.local_message_id||root.whatsappMessageId||root.id);
   const state=clean(root.statusString||root.status||root.state||eventType);
   const out:NormalizedWhatsAppEvent[]=[];
   if(watiStatusEvent(root,eventType) || (/sent|deliver|read|failed|undeliver|queued/i.test(state)&&root.owner===true)){
     const id=statusId;
     if(id) out.push({kind:'MESSAGE_STATUS',provider:'WATI',connectionId,providerMessageId:id,status:status(state),timestamp:watiTimestamp(root.timestamp||root.created),errorCode:clean(root.failedCode||root.errorCode),errorMessage:clean(root.failedDetail||root.error||root.message)});
     return out;
   }
   if(root.owner===true) return out;
   const sender=clean(root.waId||root.senderPhoneNumber||root.from||root.whatsappNumber);
   const id=messageId;
   if(!id||!sender) return out; // BSUID-only payloads need a phone fallback supported by the CRM contact model.
   const type=clean(root.type||root.messageType||'text').toLowerCase();
   const mediaUrl=clean(root.sourceUrl||root.mediaUrl||root.url||root.data?.url||root.data?.mediaUrl);
   const media:WhatsAppMediaReference[] = mediaUrl||type!=='text'?[
     {url:mediaUrl||undefined,mimeType:clean(root.data?.mimeType||root.mimeType),fileName:clean(root.data?.fileName||root.fileName),caption:clean(root.caption)},
   ]:[];
   const text=clean(root.text||root.textBody||root.messageText||root.body||root.buttonReply?.text||root.interactiveButtonReply?.text||root.listReply?.title||'');
   out.push({kind:'INBOUND_MESSAGE',provider:'WATI',connectionId,providerMessageId:id,providerConversationId:clean(root.conversationId)||undefined,senderPhone:e164(sender),businessPhone:e164(root.channelPhoneNumber||root.businessPhone||root.tenantPhoneNumber||c.senderNumber),messageType:type,text,media,senderName:clean(root.senderName||root.contactName),timestamp:watiTimestamp(root.timestamp||root.created)});
   return out;
 },
 async registerWebhook(c,callbackUrl){
   const registered=await registerWatiWebhook(c,callbackUrl);
   return registered;
 },
 async deleteWebhook(c,subscriptionId){await deleteWatiWebhook(c,subscriptionId);},
};
export function registerBuiltInWhatsAppProviderAdapters(register:(adapter:WhatsAppProviderAdapter)=>void):void{
 register(metaAdapter); register(twilioAdapter); register(watiAdapter);
}
