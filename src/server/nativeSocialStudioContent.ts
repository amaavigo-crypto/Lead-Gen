import crypto from 'node:crypto';
import { db, getDoc, getDocs, setDoc, deleteDoc } from './adminFirestore.js';
import { tenantRepo } from './tenantRepo.js';
import { decryptSecret, encryptSecret } from './cryptoUtils.js';
import type { TenantContext } from '../types/tenant.js';

type Provider = 'instagram'|'facebook'|'youtube'|'x'|'linkedin'|'reddit';
type Channel = { id:string; identifier:Provider; name:string; accountId:string; organizationId?:string; [key:string]:any };
type Media = { id:string; name?:string; mimeType?:string; dataUrl?:string; base64?:string; url?:string; path?:string; [key:string]:any };
const META = process.env.META_GRAPH_API_VERSION || 'v27.0';
const LI_VERSION = process.env.LINKEDIN_VERSION || '202611';
const REDDIT_AGENT = process.env.REDDIT_APP_USER_AGENT || 'web:com.amaavigo.socialstudio:v1.0 (Amaavigo Social Studio)';
const REDDIT_APPROVED = process.env.REDDIT_DATA_API_APPROVED === 'true';
const iso = () => new Date().toISOString();
const hash = (s:string) => crypto.createHash('sha256').update(s).digest('hex').slice(0,40);

function send(res:any,status:number,value:any){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));}
function params(req:any){return new URL(req.url||'/','https://localhost').searchParams;}
function errText(body:any,fallback:string){return String(body?.error?.message||body?.error_description||body?.message||body?.error||fallback).slice(0,500);}
async function requestJson(url:string|URL,init?:RequestInit):Promise<any>{
 const response=await fetch(url,init); const raw=await response.text(); let body:any={};
 try{body=raw?JSON.parse(raw):{};}catch{body={message:raw.slice(0,300)};}
 if(!response.ok||body?.error) throw new Error(errText(body,'Provider request failed')+' (HTTP '+response.status+')');
 return body;
}
function decrypt(payload:any){return decryptSecret(payload as any);}
async function token(ctx:TenantContext,provider:Provider,id?:string):Promise<{access:string;bundle:any;channel:Channel|null}>{
 const repo=tenantRepo(ctx);
 if(provider==='instagram'){
  const s=await getDoc(repo.secretDoc('instagram_access_token'));
  const i=await getDoc(repo.integrationDoc('instagram'));
  const c=i.exists()?(i.data() as any).connection:null;
  if(!s.exists()||c?.status!=='connected') throw new Error('Instagram is not connected to this workspace.');
  return {access:decrypt(s.data()),bundle:{accessToken:decrypt(s.data())},channel:{id:'instagram',identifier:'instagram',name:c.username||'Instagram',accountId:String(c.accountId)}};
 }
 const s=await getDoc(repo.secretDoc('social_studio_'+provider+'_oauth'));
 const i=await getDoc(repo.integrationDoc('social_studio_'+provider));
 if(!s.exists()||!i.exists()||(i.data() as any).status!=='connected') throw new Error(provider+' is not connected to this workspace.');
 let bundle=JSON.parse(decrypt(s.data()));
 const meta=i.data() as any;
 const channel=await resolveChannel(ctx,provider,id||String(meta.accountId||provider));
 if(bundle.expiresAt&&Date.parse(bundle.expiresAt)<Date.now()+120000) {
  bundle=await refresh(provider,bundle);
  await setDoc(repo.secretDoc('social_studio_'+provider+'_oauth'),{...encryptSecret(JSON.stringify(bundle)),name:'social_studio_'+provider+'_oauth',updatedAt:iso(),createdAt:iso()},{merge:false});
 }
 return {access:String(bundle.accessToken),bundle,channel};
}
async function refresh(provider:Provider,b:any):Promise<any>{
 if(!b.refreshToken) throw new Error(provider+' authorization expired. Reconnect this channel.');
 const ids:any={youtube:['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET'],x:['X_CLIENT_ID','X_CLIENT_SECRET'],linkedin:['LINKEDIN_CLIENT_ID','LINKEDIN_CLIENT_SECRET'],reddit:['REDDIT_CLIENT_ID','REDDIT_CLIENT_SECRET']};
 if(!ids[provider]) throw new Error(provider+' requires reconnection.');
 if(provider==='reddit'&&!REDDIT_APPROVED) throw new Error('Reddit API is disabled pending commercial approval.');
 const [idName,secretName]=ids[provider],clientId=String(process.env[idName]||''),secret=String(process.env[secretName]||'');
 const form=new URLSearchParams({grant_type:'refresh_token',refresh_token:String(b.refreshToken)});
 const headers:any={'Content-Type':'application/x-www-form-urlencoded'};
 let endpoint='';
 if(provider==='youtube'){endpoint='https://oauth2.googleapis.com/token';form.set('client_id',clientId);form.set('client_secret',secret);}
 if(provider==='x'){endpoint='https://api.x.com/2/oauth2/token';form.set('client_id',clientId);if(secret)headers.Authorization='Basic '+Buffer.from(clientId+':'+secret).toString('base64');}
 if(provider==='linkedin'){endpoint='https://www.linkedin.com/oauth/v2/accessToken';form.set('client_id',clientId);form.set('client_secret',secret);}
 if(provider==='reddit'){endpoint='https://www.reddit.com/api/v1/access_token';headers.Authorization='Basic '+Buffer.from(clientId+':'+secret).toString('base64');headers['User-Agent']=REDDIT_AGENT;}
 const fresh=await requestJson(endpoint,{method:'POST',headers,body:form.toString()});
 return {...b,accessToken:String(fresh.access_token||b.accessToken),refreshToken:fresh.refresh_token?String(fresh.refresh_token):b.refreshToken,expiresAt:Number(fresh.expires_in)>0?new Date(Date.now()+Number(fresh.expires_in)*1000).toISOString():null,scope:String(fresh.scope||b.scope||'')};
}
async function resolveChannel(ctx:TenantContext,p:Provider,id:string):Promise<Channel|null>{
 const repo=tenantRepo(ctx);
 if(p==='instagram'){const s=await getDoc(repo.integrationDoc('instagram'));const c=s.exists()?(s.data() as any).connection:null;return c?.status==='connected'?{id:'instagram',identifier:p,name:c.username||'Instagram',accountId:String(c.accountId)}:null;}
 const s=await getDoc(repo.integrationDoc('social_studio_'+p));if(!s.exists())return null;const v=s.data() as any;if(v.status!=='connected')return null;
 if(p==='facebook'){const page=(v.pages||[]).find((x:any)=>String(x.id)===id);if(page)return{id:String(page.id),identifier:p,name:String(page.name||'Facebook Page'),accountId:String(page.id),tasks:page.tasks||[]};}
 if(p==='linkedin'){const org=(v.organizations||[]).find((x:any)=>String(x.id)===id);if(org)return{id:String(org.id),identifier:p,name:String(org.name||'LinkedIn Page'),accountId:String(v.accountId),organizationId:String(org.id)};}
 if(id===String(v.accountId||p)||id===p)return{id:String(v.accountId||p),identifier:p,name:String(v.displayName||p),accountId:String(v.accountId||''),...v};
 return null;
}
async function channels(ctx:TenantContext):Promise<Channel[]>{
 const repo=tenantRepo(ctx),out:Channel[]=[];
 const ig=await getDoc(repo.integrationDoc('instagram')).catch(()=>null),ic=ig?.exists()?(ig.data() as any).connection:null;
 if(ic?.status==='connected')out.push({id:'instagram',identifier:'instagram',name:ic.username||'Instagram',accountId:String(ic.accountId)});
 for(const p of ['facebook','youtube','x','linkedin','reddit'] as Provider[]){
  const s=await getDoc(repo.integrationDoc('social_studio_'+p)).catch(()=>null);if(!s?.exists())continue;const v=s.data() as any;if(v.status!=='connected')continue;
  if(p==='facebook'&&(v.pages||[]).length){for(const x of v.pages)out.push({id:String(x.id),identifier:p,name:String(x.name||'Facebook Page'),accountId:String(x.id),tasks:x.tasks||[]});}
  else if(p==='linkedin'){out.push({id:String(v.accountId),identifier:p,name:String(v.displayName||'LinkedIn member'),accountId:String(v.accountId)});for(const x of v.organizations||[])out.push({id:String(x.id),identifier:p,name:String(x.name||'LinkedIn Page'),accountId:String(v.accountId),organizationId:String(x.id)});}
  else out.push({id:String(v.accountId||p),identifier:p,name:String(v.displayName||p),accountId:String(v.accountId||''),username:String(v.username||''),picture:String(v.avatar||'')});
 }
 return out;
}
async function mediaFor(ctx:TenantContext,ids:string[]):Promise<Media[]>{
 const out:Media[]=[];for(const id of Array.from(new Set(ids)).slice(0,10)){const s=await getDoc(tenantRepo(ctx).doc('social_studio_media',id));if(!s.exists())throw new Error('A selected media asset is missing.');out.push({id,...s.data() as any});}return out;
}
function bytes(m:Media):{buffer:Buffer;type:string;name:string}|null{
 const s=String(m.dataUrl||m.path||'');const match=s.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
 if(match)return{buffer:Buffer.from(match[2],'base64'),type:String(m.mimeType||match[1]),name:String(m.name||'upload')};
 if(m.base64)return{buffer:Buffer.from(m.base64,'base64'),type:String(m.mimeType||'application/octet-stream'),name:String(m.name||'upload')};
 return null;
}
function publicUrl(m:Media):string{
 const s=String(m.url||m.publicUrl||m.downloadUrl||m.storageUrl||m.path||'');
 if(!/^https:\/\//i.test(s))throw new Error('This channel requires a publicly reachable HTTPS media URL. Store this asset at a public CDN/asset URL and retry.');
 const u=new URL(s);if(['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)||u.hostname.endsWith('.local'))throw new Error('Private media URLs cannot be sent to a social platform.');
 return u.toString();
}
async function publishInstagram(ctx:TenantContext,text:string,m:Media[],settings:any){
 const t=await token(ctx,'instagram');if(!m.length)throw new Error('Instagram publishing requires an image or video; text-only posts are not supported.');
 const url=publicUrl(m[0]),video=String(m[0].mimeType||'').startsWith('video/'),base='https://graph.instagram.com/'+(process.env.META_GRAPH_API_VERSION||'v23.0')+'/'+t.channel!.accountId;
 const body:any={caption:text,access_token:t.access};if(video){body.media_type=settings?.post_type==='story'?'STORIES':'REELS';body.video_url=url;}else{body.image_url=url;if(settings?.post_type==='story')body.media_type='STORIES';}
 const c=await requestJson(base+'/media',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString()});
 if(video){for(let i=0;i<8;i++){const s=await requestJson(base+'/'+c.id+'?fields=status_code&access_token='+encodeURIComponent(t.access));if(s.status_code==='FINISHED')break;if(s.status_code==='ERROR')throw new Error('Instagram could not process this video asset.');await new Promise(r=>setTimeout(r,2500));}}
 const p=await requestJson(base+'/media_publish',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({creation_id:String(c.id),access_token:t.access}).toString()});
 return{id:String(p.id||c.id),url:'https://www.instagram.com/p/'+String(p.id||c.id)+'/'};
}
async function publishFacebook(ctx:TenantContext,ch:Channel,text:string,m:Media[]){
 const t=await token(ctx,'facebook',ch.id),pageToken=String(t.bundle.identity?.pageTokens?.[ch.id]||t.access),page=ch.accountId;
 if(m.length){const b=bytes(m[0]);if(b){const form=new FormData();form.append('message',text);form.append('source',new Blob([b.buffer],{type:b.type}),b.name);const p=await requestJson('https://graph.facebook.com/'+META+'/'+page+'/photos?access_token='+encodeURIComponent(pageToken),{method:'POST',body:form});return{id:String(p.post_id||p.id),url:'https://www.facebook.com/'+String(p.post_id||p.id)};}
 const p=await requestJson('https://graph.facebook.com/'+META+'/'+page+'/photos',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({url:publicUrl(m[0]),caption:text,access_token:pageToken}).toString()});return{id:String(p.post_id||p.id),url:'https://www.facebook.com/'+String(p.post_id||p.id)};}
 const p=await requestJson('https://graph.facebook.com/'+META+'/'+page+'/feed',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({message:text,access_token:pageToken}).toString()});return{id:String(p.id),url:'https://www.facebook.com/'+String(p.id)};
}
async function publishYouTube(ctx:TenantContext,text:string,m:Media[],settings:any){
 if(!m.length)throw new Error('YouTube publishing requires a video asset.');
 const t=await token(ctx,'youtube');let b=bytes(m[0]);
 if(!b){const r=await fetch(publicUrl(m[0]));if(!r.ok)throw new Error('Could not download the YouTube video asset.');b={buffer:Buffer.from(await r.arrayBuffer()),type:String(m[0].mimeType||r.headers.get('content-type')||'video/mp4'),name:String(m[0].name||'video.mp4')};}
 const title=String(settings?.title||text.split('\n')[0]||'New video').slice(0,100),privacy=['public','unlisted','private'].includes(settings?.privacyStatus)?settings.privacyStatus:'private';
 const init=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:'Bearer '+t.access,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':b.type,'X-Upload-Content-Length':String(b.buffer.length)},body:JSON.stringify({snippet:{title,description:String(settings?.description||text).slice(0,5000)},status:{privacyStatus:privacy,selfDeclaredMadeForKids:false}})});
 if(!init.ok)throw new Error('YouTube upload initialization failed (HTTP '+init.status+'). Check API quota, app verification and channel permissions.');
 const location=init.headers.get('location');if(!location)throw new Error('YouTube did not return a resumable upload URL.');
 const up=await fetch(location,{method:'PUT',headers:{'Content-Type':b.type,'Content-Length':String(b.buffer.length)},body:b.buffer as any});const result:any=await up.json().catch(()=>({}));
 if(!up.ok)throw new Error(errText(result,'YouTube video upload failed'));
 const id=String(result.id||'');return{id,url:'https://www.youtube.com/watch?v='+id};
}
async function publishX(ctx:TenantContext,text:string,m:Media[]){
 const t=await token(ctx,'x'),mediaIds:string[]=[];
 for(const asset of m.slice(0,4)){const b=bytes(asset);if(!b)throw new Error('X media posting requires uploaded image/video bytes in the Social Studio media library.');
 const f=new FormData();f.append('media',new Blob([b.buffer],{type:b.type}),b.name);f.append('media_category',b.type.startsWith('video/')?'tweet_video':'tweet_image');
 const up=await requestJson('https://api.x.com/2/media/upload',{method:'POST',headers:{Authorization:'Bearer '+t.access},body:f});if(up.data?.id)mediaIds.push(String(up.data.id));}
 const body:any={text};if(mediaIds.length)body.media={media_ids:mediaIds};
 const p=await requestJson('https://api.x.com/2/tweets',{method:'POST',headers:{Authorization:'Bearer '+t.access,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const id=String(p.data?.id||'');return{id,url:id?'https://x.com/i/web/status/'+id:''};
}
async function publishLinkedIn(ctx:TenantContext,ch:Channel,text:string,m:Media[]){
 const t=await token(ctx,'linkedin',ch.id),author=ch.organizationId?'urn:li:organization:'+ch.organizationId:'urn:li:person:'+String(t.bundle.identity?.accountId||ch.accountId);
 const body:any={author,commentary:text,visibility:'PUBLIC',distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]},lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false};
 if(m.length){const b=bytes(m[0]);if(!b)throw new Error('LinkedIn image posting requires uploaded media bytes.');
 const init=await requestJson('https://api.linkedin.com/rest/images?action=initializeUpload',{method:'POST',headers:{Authorization:'Bearer '+t.access,'Content-Type':'application/json','LinkedIn-Version':LI_VERSION,'X-Restli-Protocol-Version':'2.0.0'},body:JSON.stringify({initializeUploadRequest:{owner:author}})});
 const u=init.value?.uploadUrl,urn=init.value?.image;if(!u||!urn)throw new Error('LinkedIn did not return an image upload URL.');
 const uploaded=await fetch(u,{method:'PUT',headers:{Authorization:'Bearer '+t.access,'Content-Type':b.type},body:b.buffer as any});if(!uploaded.ok)throw new Error('LinkedIn image upload failed (HTTP '+uploaded.status+').');
 body.content={media:{title:{text:m[0].name||'Image'},id:urn}};}
 const p=await requestJson('https://api.linkedin.com/rest/posts',{method:'POST',headers:{Authorization:'Bearer '+t.access,'Content-Type':'application/json','LinkedIn-Version':LI_VERSION,'X-Restli-Protocol-Version':'2.0.0'},body:JSON.stringify(body)});
 const id=String(p.id||'');return{id,url:id?'https://www.linkedin.com/feed/update/'+encodeURIComponent(id)+'/':''};
}
async function publishReddit(ctx:TenantContext,text:string,m:Media[],settings:any){
 if(!REDDIT_APPROVED)throw new Error('Reddit publishing is disabled until Amaavigo receives Reddit commercial Data API approval.');
 const t=await token(ctx,'reddit'),sr=String(settings?.subreddit||'').replace(/^r\//,'').trim(),title=String(settings?.title||text.split('\n')[0]||'').slice(0,300);
 if(!sr||!title)throw new Error('Reddit requires a subreddit and post title. Add both in the Reddit publishing settings.');
 const f=new URLSearchParams({sr,kind:'self',title,text,api_type:'json',resubmit:'true'});if(m.length){f.set('kind','link');f.set('url',publicUrl(m[0]));}
 const p=await requestJson('https://oauth.reddit.com/api/submit',{method:'POST',headers:{Authorization:'Bearer '+t.access,'Content-Type':'application/x-www-form-urlencoded','User-Agent':REDDIT_AGENT},body:f.toString()});
 const d=p.json?.data||{},id=String(d.name||d.id||'');return{id,url:String(d.url||(d.id?'https://www.reddit.com/comments/'+d.id+'/':''))};
}
async function publish(ctx:TenantContext,ch:Channel,text:string,m:Media,settings:any):Promise<any>{
 switch(ch.identifier){case'instagram':return publishInstagram(ctx,text,m,settings);case'facebook':return publishFacebook(ctx,ch,text,m);case'youtube':return publishYouTube(ctx,text,m,settings);case'x':return publishX(ctx,text,m);case'linkedin':return publishLinkedIn(ctx,ch,text,m);case'reddit':return publishReddit(ctx,text,m,settings);}
 throw new Error('Unsupported social provider.');
}
async function publishDestinations(ctx:TenantContext,record:any){
 const media=await mediaFor(ctx,record.mediaIds||[]),all=await channels(ctx),out:any[]=[];
 for(const id of record.integrationIds||[]){const ch=all.find(x=>x.id===id||x.accountId===id);if(!ch){out.push({id,state:'failed',error:'Selected channel is no longer connected.'});continue;}
 try{const setting=record.providerSettings?.[id]||record.providerSettings?.[ch.identifier]||{};const p=await publish(ctx,ch,String(record.content||''),media,setting);out.push({id,state:'published',platformPostId:p.id,releaseURL:p.url,integration:{id:ch.id,name:ch.name,providerIdentifier:ch.identifier,profile:ch.name},value:[{content:record.content||'',image:media.map(m=>({id:m.id,path:m.url||m.path||''}))}]});}
 catch(e:any){out.push({id,state:'failed',error:String(e?.message||'Publishing failed').slice(0,500),integration:{id:ch.id,name:ch.name,providerIdentifier:ch.identifier,profile:ch.name}});}}
 return out;
}
function mayPublish(ctx:TenantContext){const a=Array.isArray((ctx as any).allowedModules)?(ctx as any).allowedModules:[];return Boolean(ctx.isPlatformAdmin||ctx.role==='admin'||a.includes('social-studio-publish')||a.includes('social_studio_publish'));}
async function submitPost(req:any,res:any,ctx:TenantContext){
 const b=req.body||{},type=String(b.type||'now');if(!['draft','now','schedule'].includes(type))return send(res,400,{success:false,error:'Post type must be draft, now or schedule.'});
 if(type!=='draft'&&!mayPublish(ctx))return send(res,403,{success:false,error:'Your workspace role does not have social publishing permission.'});
 const ids=Array.from(new Set((Array.isArray(b.integrationIds)?b.integrationIds:[]).map((v:any)=>String(v||'').trim()).filter(Boolean))).slice(0,6),mediaIds=Array.from(new Set((Array.isArray(b.mediaIds)?b.mediaIds:[]).map((v:any)=>String(v||'').trim()).filter(Boolean))).slice(0,10),text=String(b.content||'').trim();
 if(!ids.length)return send(res,400,{success:false,error:'Select at least one connected social account.'});if(!text&&!mediaIds.length)return send(res,400,{success:false,error:'Add post text or media.'});
 const date=new Date(String(b.date||''));if(type==='schedule'&&(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()))return send(res,400,{success:false,error:'Choose a valid future schedule date.'});
 const requestId=String(b.requestId||crypto.randomUUID()).slice(0,200),id=hash(ctx.tenantId+':'+requestId),ref=tenantRepo(ctx).doc('social_studio_posts',id),old=await getDoc(ref);if(old.exists())return send(res,200,{success:true,post:old.data(),duplicate:true});
 const record:any={id,requestId,type,content:text,mediaIds,integrationIds:ids,providerSettings:b.providerSettings||{},state:type==='draft'?'draft':type==='schedule'?'scheduled':'publishing',publishDate:type==='schedule'?date.toISOString():iso(),createdAt:iso(),updatedAt:iso(),attempts:0,posts:[]};
 if(type!=='now'){await setDoc(ref,record,{merge:false});return send(res,200,{success:true,post:record});}
 const outcomes=await publishDestinations(ctx,record);record.posts=outcomes;record.attempts=1;record.state=outcomes.some(x=>x.state==='published')?(outcomes.every(x=>x.state==='published')?'published':'partial'):'failed';record.publishedAt=outcomes.some(x=>x.state==='published')?iso():null;await setDoc(ref,record,{merge:false});
 if(record.state==='failed')return send(res,502,{success:false,error:outcomes.map(x=>x.error).filter(Boolean).join(' · ')||'No platform accepted the post.',post:record});
 return send(res,200,{success:true,post:record,posts:outcomes});
}
export async function runSocialStudioPublishWorkerCycle(ctx:TenantContext,limit=5):Promise<number>{
 const docs=await getDocs(tenantRepo(ctx).collection('social_studio_posts')),now=Date.now(),due=docs.docs.map(d=>({id:d.id,...d.data() as any})).filter(p=>p.state==='scheduled'&&Date.parse(String(p.publishDate||''))<=now).sort((a,b)=>Date.parse(a.publishDate)-Date.parse(b.publishDate)).slice(0,limit);
 let count=0;for(const post of due){const ref=tenantRepo(ctx).doc('social_studio_posts',post.id),s=await getDoc(ref);if(!s.exists()||(s.data() as any).state!=='scheduled')continue;await setDoc(ref,{state:'publishing',attempts:Number(post.attempts||0)+1,updatedAt:iso()},{merge:true});
 try{const results=await publishDestinations(ctx,post),ok=results.some(x=>x.state==='published');await setDoc(ref,{posts:results,state:ok?(results.every(x=>x.state==='published')?'published':'partial'):'failed',publishedAt:ok?iso():null,updatedAt:iso()},{merge:true});}
 catch(e:any){await setDoc(ref,{state:'failed',lastError:String(e?.message||'Publish worker failed').slice(0,500),updatedAt:iso()},{merge:true});}count++;}return count;
}
async function analytics(ctx:TenantContext,id:string,days:number){
 const all=await channels(ctx),ch=all.find(x=>x.id===id||x.accountId===id);if(!ch)throw new Error('Selected social account is not connected.');
 const start=new Date(Date.now()-days*86400000).toISOString().slice(0,10),end=new Date().toISOString().slice(0,10),out:any[]=[],notes:string[]=[];
 if(ch.identifier==='instagram'){
  const t=await token(ctx,'instagram'),u=new URL('https://graph.instagram.com/'+(process.env.META_GRAPH_API_VERSION||'v23.0')+'/'+t.channel!.accountId+'/insights');u.searchParams.set('metric','reach,views,profile_views,accounts_engaged,total_interactions');u.searchParams.set('period','day');u.searchParams.set('since',String(Math.floor(Date.parse(start+'T00:00:00Z')/1000)));u.searchParams.set('until',String(Math.floor(Date.parse(end+'T23:59:59Z')/1000)));u.searchParams.set('access_token',t.access);
  const r=await requestJson(u);for(const m of r.data||[])out.push({label:m.title||m.name,data:(m.values||[]).map((v:any)=>({date:v.end_time,total:v.value}))});notes.push('Instagram insights are available only for eligible professional accounts and supported metrics.');
 }else if(ch.identifier==='facebook'){
  const t=await token(ctx,'facebook',ch.id),page=String(t.bundle.identity?.pageTokens?.[ch.id]||t.access),u=new URL('https://graph.facebook.com/'+META+'/'+ch.id+'/insights');u.searchParams.set('metric','page_post_engagements,page_follows,page_views_total');u.searchParams.set('period','day');u.searchParams.set('since',start);u.searchParams.set('until',end);u.searchParams.set('access_token',page);
  const r=await requestJson(u);for(const m of r.data||[])out.push({label:m.title||m.name,data:(m.values||[]).map((v:any)=>({date:v.end_time,total:v.value}))});notes.push('Page Insights require the ANALYZE Page task and read_insights permission; Meta may deprecate metrics by API version.');
 }else if(ch.identifier==='youtube'){
  const t=await token(ctx,'youtube'),u=new URL('https://youtubeanalytics.googleapis.com/v2/reports');u.searchParams.set('ids','channel==MINE');u.searchParams.set('startDate',start);u.searchParams.set('endDate',end);u.searchParams.set('metrics','views,estimatedMinutesWatched,averageViewDuration,likes,comments,subscribersGained,subscribersLost');u.searchParams.set('dimensions','day');u.searchParams.set('sort','day');
  const r=await requestJson(u,{headers:{Authorization:'Bearer '+t.access}}),heads=(r.columnHeaders||[]).map((h:any)=>h.name);for(let i=1;i<heads.length;i++)out.push({label:heads[i],data:(r.rows||[]).map((row:any)=>({date:row[0],total:row[i]}))});notes.push('YouTube Analytics is private to the authorized channel owner and requires the yt-analytics.readonly scope.');
 }else if(ch.identifier==='x'){
  const t=await token(ctx,'x'),uid=String(t.bundle.identity?.accountId||ch.accountId),u=new URL('https://api.x.com/2/users/'+uid+'/tweets');u.searchParams.set('max_results','100');u.searchParams.set('tweet.fields','created_at,public_metrics,non_public_metrics');
  const r=await requestJson(u,{headers:{Authorization:'Bearer '+t.access}}),posts=r.data||[],sum=(k:string)=>posts.reduce((n:number,p:any)=>n+Number(p.public_metrics?.[k]||p.non_public_metrics?.[k]||0),0);out.push({label:'Posts retrieved',total:posts.length});for(const [k,l] of [['like_count','Likes'],['reply_count','Replies'],['retweet_count','Reposts'],['quote_count','Quotes']] as any[])out.push({label:l,total:sum(k)});notes.push('X usage is metered; private metrics depend on API plan and account permissions.');
 }else if(ch.identifier==='linkedin'){
  const t=await token(ctx,'linkedin');if(ch.organizationId&&String(t.bundle.scope||'').includes('r_organization_social')){const u=new URL('https://api.linkedin.com/rest/organizationalEntityShareStatistics');u.searchParams.set('q','organizationalEntity');u.searchParams.set('organizationalEntity','urn:li:organization:'+ch.organizationId);const r=await requestJson(u,{headers:{Authorization:'Bearer '+t.access,'LinkedIn-Version':LI_VERSION,'X-Restli-Protocol-Version':'2.0.0'}});const sum:any={};for(const e of r.elements||[])for(const [k,v] of Object.entries(e.totalShareStatistics||{}))sum[k]=(sum[k]||0)+Number(v||0);for(const [k,l] of [['impressionCount','Impressions'],['likeCount','Likes'],['commentCount','Comments'],['shareCount','Shares'],['clickCount','Clicks']] as any[])out.push({label:l,total:sum[k]||0});}
  else notes.push('LinkedIn member analytics and organization metrics require approved Community Management access and read permissions.');
 }else if(ch.identifier==='reddit'){
  if(!REDDIT_APPROVED)throw new Error('Reddit analytics are unavailable until Amaavigo has commercial Data API approval.');
  const t=await token(ctx,'reddit'),name=String(t.bundle.identity?.username||ch.username),r=await requestJson('https://oauth.reddit.com/user/'+encodeURIComponent(name)+'/submitted?limit=100&sort=new',{headers:{Authorization:'Bearer '+t.access,'User-Agent':REDDIT_AGENT}}),posts=(r.data?.children||[]).map((x:any)=>x.data||{});out.push({label:'Posts retrieved',total:posts.length},{label:'Post score',total:posts.reduce((n:number,p:any)=>n+Number(p.score||0),0)},{label:'Comments',total:posts.reduce((n:number,p:any)=>n+Number(p.num_comments||0),0)});notes.push('Reddit Data API does not expose ordinary post impressions or reach.');
 }
 return{provider:ch.identifier,channel:ch.name,period:{days,start,end},analytics:out,limitations:notes};
}
async function saveCompetitor(ctx:TenantContext,b:any){
 const provider=String(b.provider||'').toLowerCase() as Provider,handle=String(b.handle||'').trim().replace(/^@/,'');
 if(!['instagram','facebook','youtube','x','linkedin','reddit'].includes(provider)||!handle)throw new Error('Select a platform and enter a competitor handle, channel ID, Page ID or subreddit.');
 const id=hash(provider+':'+handle.toLowerCase()),record={id,provider,handle,createdAt:iso(),updatedAt:iso()};await setDoc(tenantRepo(ctx).doc('social_studio_competitors',id),record,{merge:true});return record;
}
async function analyzeCompetitor(ctx:TenantContext,c:any){
 const p=c.provider as Provider,h=String(c.handle||'').trim();
 if(p==='youtube'){const t=await token(ctx,'youtube'),u=new URL('https://www.googleapis.com/youtube/v3/channels');u.searchParams.set('part','id,snippet,statistics');u.searchParams.set('forHandle',h);const r=await requestJson(u,{headers:{Authorization:'Bearer '+t.access}}),v=r.items?.[0];if(!v)throw new Error('YouTube did not find a public channel for that handle.');const s=new URL('https://www.googleapis.com/youtube/v3/search');s.searchParams.set('part','id,snippet');s.searchParams.set('channelId',v.id);s.searchParams.set('type','video');s.searchParams.set('order','date');s.searchParams.set('maxResults','10');const recent=await requestJson(s,{headers:{Authorization:'Bearer '+t.access}});return{platform:p,handle:h,profile:{name:v.snippet?.title,subscribers:v.statistics?.subscriberCount,views:v.statistics?.viewCount,videos:v.statistics?.videoCount},recentPosts:(recent.items||[]).map((x:any)=>({title:x.snippet?.title,publishedAt:x.snippet?.publishedAt,url:'https://www.youtube.com/watch?v='+x.id?.videoId})),limitations:['Competitor private analytics, reach, watch time and demographics are not exposed.']};}
 if(p==='x'){const t=await token(ctx,'x'),u=await requestJson('https://api.x.com/2/users/by/username/'+encodeURIComponent(h)+'?user.fields=public_metrics,description,profile_image_url',{headers:{Authorization:'Bearer '+t.access}}),id=String(u.data?.id||'');if(!id)throw new Error('X could not find that public username.');const r=await requestJson('https://api.x.com/2/users/'+id+'/tweets?max_results=20&tweet.fields=created_at,public_metrics',{headers:{Authorization:'Bearer '+t.access}});return{platform:p,handle:h,profile:{name:u.data.name,followers:u.data.public_metrics?.followers_count,following:u.data.public_metrics?.following_count,posts:u.data.public_metrics?.tweet_count},recentPosts:(r.data||[]).map((x:any)=>({text:x.text,createdAt:x.created_at,metrics:x.public_metrics,url:'https://x.com/'+h+'/status/'+x.id})),limitations:['X public reads are metered and require API access/credits.']};}
 if(p==='reddit'){if(!REDDIT_APPROVED)throw new Error('Reddit competitor analysis is disabled until Amaavigo receives commercial Data API approval.');const t=await token(ctx,'reddit'),r=await requestJson('https://oauth.reddit.com/r/'+encodeURIComponent(h)+'/hot?limit=20',{headers:{Authorization:'Bearer '+t.access,'User-Agent':REDDIT_AGENT}});return{platform:p,handle:h,profile:{subreddit:h},recentPosts:(r.data?.children||[]).map((x:any)=>x.data||{}).map((x:any)=>({title:x.title,score:x.score,comments:x.num_comments,createdAt:new Date(Number(x.created_utc||0)*1000).toISOString(),url:'https://www.reddit.com'+x.permalink})),limitations:['Reddit commercial Data API approval is required before using this SaaS for Reddit data.']};}
 if(p==='instagram'||p==='facebook'){
  const fb=await token(ctx,'facebook');const pages=Array.isArray(fb.bundle.identity?.pages)?fb.bundle.identity.pages:[];
  if(p==='instagram'){
   const page=pages.find((x:any)=>x.instagramBusinessAccountId);
   if(!page)throw new Error('Connect a Facebook Page linked to an Instagram Business/Creator account and grant instagram_basic. Instagram Business Discovery is not part of the existing Instagram Login token.');
   const pageToken=String(fb.bundle.identity?.pageTokens?.[page.id]||fb.access);
   const fields='business_discovery.username('+h+'){username,name,followers_count,media_count,media.limit(10){caption,media_type,permalink,timestamp,like_count,comments_count}}';
   const u=new URL('https://graph.facebook.com/'+META+'/'+page.instagramBusinessAccountId);u.searchParams.set('fields',fields);u.searchParams.set('access_token',pageToken);
   const r=await requestJson(u),d=r.business_discovery;if(!d)throw new Error('Meta Business Discovery did not return this Instagram profile. Confirm instagram_basic, Page access and Meta App Review.');
   return{platform:p,handle:h,profile:{name:d.name,username:d.username,followers:d.followers_count,mediaCount:d.media_count},recentPosts:(d.media?.data||[]).map((x:any)=>({caption:x.caption,mediaType:x.media_type,createdAt:x.timestamp,likes:x.like_count,comments:x.comments_count,url:x.permalink})),limitations:['Public Business Discovery data only. Private reach, impressions, audience demographics and account insights are unavailable.']};
  }
  const tokenPage=pages.find((x:any)=>String(x.id)===h)||pages[0];const pageToken=String(fb.bundle.identity?.pageTokens?.[tokenPage?.id]||fb.access);
  const fields='id,name,fan_count,followers_count,posts.limit(10){message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true)}';
  const u=new URL('https://graph.facebook.com/'+META+'/'+encodeURIComponent(h));u.searchParams.set('fields',fields);u.searchParams.set('access_token',pageToken);
  const d=await requestJson(u);
  return{platform:p,handle:h,profile:{name:d.name,followers:d.followers_count,fans:d.fan_count},recentPosts:(d.posts?.data||[]).map((x:any)=>({text:x.message,createdAt:x.created_time,url:x.permalink_url,likes:x.likes?.summary?.total_count,comments:x.comments?.summary?.total_count,shares:x.shares?.count})),limitations:['Competitor Page details depend on Meta Page Public Content Access approval. Insights not exposed for Pages you do not manage.']};
 }
 const notes:any={linkedin:'LinkedIn does not expose arbitrary competitor page analytics through basic member OAuth. Approved Community Management access is required for organization content and analysis; it still does not grant competitors private reach or audience data.'};
 return{platform:p,handle:h,dataType:'Not available through the currently authorized API',limitations:[notes[p]||'This provider does not expose competitor analytics through this account authorization.']};
}
export async function handleNativeSocialStudioContentApi(req:any,res:any,ctx:TenantContext,url:string):Promise<boolean>{
 if(url==='/api/social-studio/posts'&&req.method==='GET'){const d=await getDocs(tenantRepo(ctx).collection('social_studio_posts')),q=params(req),a=Date.parse(q.get('startDate')||''),b=Date.parse(q.get('endDate')||''),posts=d.docs.map(x=>({id:x.id,...x.data() as any})).filter((p:any)=>{const t=Date.parse(String(p.publishDate||p.createdAt||''));return(!Number.isFinite(a)||t>=a)&&(!Number.isFinite(b)||t<b);}).sort((x:any,y:any)=>Date.parse(String(y.publishDate||y.createdAt||''))-Date.parse(String(x.publishDate||x.createdAt||'')));send(res,200,{success:true,posts});return true;}
 if(url==='/api/social-studio/posts'&&req.method==='POST'){await submitPost(req,res,ctx);return true;}
 const del=url.match(/^\/api\/social-studio\/posts\/([A-Za-z0-9_-]+)$/);if(del&&req.method==='DELETE'){const ref=tenantRepo(ctx).doc('social_studio_posts',del[1]),s=await getDoc(ref);if(!s.exists())send(res,404,{success:false,error:'Post was not found.'});else if(['published','partial'].includes((s.data() as any).state))send(res,409,{success:false,error:'Published posts remain in Social Studio history.'});else{await deleteDoc(ref);send(res,200,{success:true});}return true;}
 if(url==='/api/social-studio/media'&&req.method==='GET'){const d=await getDocs(tenantRepo(ctx).collection('social_studio_media')),media=d.docs.map(x=>({id:x.id,...x.data() as any})).sort((a:any,b:any)=>Date.parse(String(b.createdAt||''))-Date.parse(String(a.createdAt||'')));send(res,200,{success:true,media});return true;}
 if(url==='/api/social-studio/media/upload'&&req.method==='POST'){const assetId=String(req.body?.assetId||'');if(!assetId){send(res,400,{success:false,error:'Company Asset ID is required.'});return true;}const a=await getDoc(tenantRepo(ctx).assetDoc(assetId));if(!a.exists()){send(res,404,{success:false,error:'Company Asset not found in this workspace.'});return true;}const v=a.data() as any,id=hash(ctx.tenantId+':'+assetId),urlValue=String(v.url||v.publicUrl||v.downloadUrl||v.storageUrl||'');const publicAssetUrl=urlValue || (String(process.env.APP_URL||process.env.APP_BASE_URL||'').replace(/\/$/,'')+'/api/assets/'+encodeURIComponent(assetId)+'/view');const item={id,name:String(v.name||v.fileName||'Social media'),mimeType:String(v.mimeType||v.type||''),size:Number(v.size||0),sourceAssetId:assetId,createdAt:iso(),url:publicAssetUrl,path:publicAssetUrl,dataUrl:String(v.dataUrl||'')};await setDoc(tenantRepo(ctx).doc('social_studio_media',id),item,{merge:true});send(res,200,{success:true,media:item});return true;}
 if(url.startsWith('/api/social-studio/analytics')&&req.method==='GET'){try{const q=params(req),days=Math.max(1,Math.min(365,Number(q.get('days')||30))),data=await analytics(ctx,String(q.get('integrationId')||''),days);send(res,200,{success:true,analytics:data});}catch(e:any){send(res,400,{success:false,error:e?.message||'Analytics unavailable.'});}return true;}
 if(url==='/api/social-studio/competitors'&&req.method==='GET'){const d=await getDocs(tenantRepo(ctx).collection('social_studio_competitors'));send(res,200,{success:true,competitors:d.docs.map(x=>({id:x.id,...x.data() as any}))});return true;}
 if(url==='/api/social-studio/competitors'&&req.method==='POST'){try{send(res,200,{success:true,competitor:await saveCompetitor(ctx,req.body||{})});}catch(e:any){send(res,400,{success:false,error:e?.message||'Could not save competitor.'});}return true;}
 const dc=url.match(/^\/api\/social-studio\/competitors\/([A-Za-z0-9_-]+)$/);if(dc&&req.method==='DELETE'){await deleteDoc(tenantRepo(ctx).doc('social_studio_competitors',dc[1]));send(res,200,{success:true});return true;}
 if(url==='/api/social-studio/competitors/analyze'&&req.method==='POST'){try{const id=String(req.body?.competitorId||''),s=id?await getDoc(tenantRepo(ctx).doc('social_studio_competitors',id)):null,c=s?.exists()?s.data():req.body?.competitor;if(!c)throw new Error('Choose a saved competitor to analyze.');const result=await analyzeCompetitor(ctx,c),key=String((c as any).id||hash(String((c as any).provider)+':'+String((c as any).handle)));await setDoc(tenantRepo(ctx).doc('social_studio_competitors',key),{lastAnalysis:result,lastAnalyzedAt:iso(),updatedAt:iso()},{merge:true});send(res,200,{success:true,analysis:result});}catch(e:any){send(res,400,{success:false,error:e?.message||'Analysis unavailable.'});}return true;}
 return false;
}
