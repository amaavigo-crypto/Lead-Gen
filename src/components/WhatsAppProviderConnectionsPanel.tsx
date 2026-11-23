import React, { useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase/config.js';
import type { WhatsAppProviderConnection, WhatsAppProviderValidation, WhatsAppProviderTemplate } from '../server/whatsappProviderTypes.js';

type Sender = { phoneNumber: string; providerSenderId: string; providerAccountId?: string; displayName?: string; verifiedName?: string };
type Provider = 'META' | 'TWILIO' | 'WATI';
type TemplateResult = { [connectionId: string]: WhatsAppProviderTemplate[] };
const FIELD_CONFIG: Record<Provider, Array<{key:string;label:string;placeholder?:string;secret?:boolean;required?:boolean}>> = {
  META: [
    {key:'accessToken',label:'System User access token',secret:true,required:true},
    {key:'wabaId',label:'WhatsApp Business Account ID',required:true},
    {key:'phoneNumberId',label:'Phone Number ID (optional)',required:false},
    {key:'messagingAccountId',label:'Messaging Account ID (optional)',required:false},
    {key:'graphVersion',label:'Graph API version',placeholder:'v23.0'},
  ],
  TWILIO: [
    {key:'accountSid',label:'Account SID',required:true},
    {key:'authToken',label:'Auth Token',secret:true,required:true},
    {key:'senderNumber',label:'WhatsApp-enabled sender number',placeholder:'+14155550123',required:true},
    {key:'senderSid',label:'Sender SID (optional)'},
    {key:'messagingServiceSid',label:'Messaging Service SID (optional)'},
  ],
  WATI: [
    {key:'apiEndpoint',label:'WATI API host',placeholder:'https://live-mt-server.wati.io',required:true},
    {key:'accessToken',label:'Permanent access token',secret:true,required:true},
    {key:'tenantId',label:'WATI tenant ID',required:true},
    {key:'senderNumber',label:'Connected WhatsApp number',placeholder:'+919876543210',required:true},
    {key:'webhookSecret',label:'Webhook shared secret (optional)',secret:true},
  ],
};
async function api(path:string, method='GET', body?:unknown) {
  const user=auth.currentUser;
  if(!user) throw new Error('Sign in again before managing WhatsApp connections.');
  const headers:Record<string,string>={Authorization:'Bearer '+await user.getIdToken()};
  if(body!==undefined) headers['Content-Type']='application/json';
  const response=await fetch(path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || 'WhatsApp provider request failed.');
  return data;
}
export function WhatsAppProviderConnectionsPanel({tenantId,canEdit}:{tenantId:string;canEdit:boolean}) {
  const [provider,setProvider]=useState<Provider>('TWILIO');
  const [fields,setFields]=useState<Record<string,string>>({});
  const [connections,setConnections]=useState<WhatsAppProviderConnection[]>([]);
  const [validation,setValidation]=useState<WhatsAppProviderValidation|null>(null);
  const [selectedSender,setSelectedSender]=useState('');
  const [displayName,setDisplayName]=useState('');
  const [templates,setTemplates]=useState<TemplateResult>({});
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [webhookInstructions,setWebhookInstructions]=useState<string[]>([]);
  const refresh=useCallback(async()=>{
    try { const data=await api('/api/whatsapp/providers'); setConnections(Array.isArray(data.connections)?data.connections:[]); }
    catch(e:any){setError(e.message);}
  },[]);
  useEffect(()=>{refresh();},[refresh,tenantId]);
  const validate=async()=>{
    setBusy('validate');setError('');setMessage('');setValidation(null);
    try{
      const data=await api('/api/whatsapp/providers/'+provider+'/validate','POST',{credentials:fields});
      setValidation(data.validation);setSelectedSender(data.validation?.senders?.[0]?.providerSenderId||'');
      setMessage('Credentials verified. Select the WhatsApp sender to connect.');
    }catch(e:any){setError(e.message);}
    finally{setBusy('');}
  };
  const connect=async()=>{
    const sender=validation?.senders?.find(s=>s.providerSenderId===selectedSender);
    if(!sender){setError('Select a sender that was returned by the provider validation.');return;}
    setBusy('connect');setError('');setMessage('');
    try{
      const data=await api('/api/whatsapp/providers/'+provider+'/connect','POST',{credentials:fields,sender,displayName:displayName||undefined});
      setWebhookInstructions(data.webhook?.setup||[]);
      setMessage('WhatsApp provider connected. Complete the webhook instructions below to receive replies.');
      setValidation(null);setFields({});setDisplayName('');
      await refresh();
    }catch(e:any){setError(e.message);}
    finally{setBusy('');}
  };
  const disconnect=async(id:string)=>{
    if(!window.confirm('Disconnect this WhatsApp sender? New messages will stop, but existing CRM history will remain.'))return;
    setBusy(id);setError('');setMessage('');
    try{await api('/api/whatsapp/providers/'+id,'DELETE');setMessage('Connection disconnected.');await refresh();}
    catch(e:any){setError(e.message);}finally{setBusy('');}
  };
  const syncTemplates=async(id:string)=>{
    setBusy('templates-'+id);setError('');
    try{const data=await api('/api/whatsapp/providers/'+id+'/templates');setTemplates(prev=>({...prev,[id]:data.templates||[]}));setMessage('Template sync complete.');}
    catch(e:any){setError(e.message);}finally{setBusy('');}
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-extrabold text-slate-900">Third-party WhatsApp providers</h3>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Connect multiple Meta Direct, Twilio and WATI senders to this workspace. Messages from each connection are routed into its CRM inbox independently.</p></div>
      <button type="button" onClick={refresh} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Refresh</button>
    </div>
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">Add provider connection</h4>
        <select value={provider} onChange={e=>{setProvider(e.target.value as Provider);setValidation(null);setFields({});setSelectedSender('');setError('');setMessage('');}} disabled={!canEdit} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">
          <option value="META">Meta Direct</option><option value="TWILIO">Twilio</option><option value="WATI">WATI</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FIELD_CONFIG[provider].map(field=><label key={field.key} className="block text-[11px] font-semibold text-slate-600">
          {field.label}{field.required?' *':''}
          <input type={field.secret?'password':'text'} autoComplete="off" value={fields[field.key]||''} onChange={e=>{setFields(prev=>({...prev,[field.key]:e.target.value}));setValidation(null);setMessage('');}} placeholder={field.placeholder||''} disabled={!canEdit||busy!==''} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-slate-800 outline-none focus:border-blue-500"/>
        </label>)}
        <label className="block text-[11px] font-semibold text-slate-600">Connection display name
          <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder={provider+' WhatsApp'} disabled={!canEdit||busy!==''} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-slate-800 outline-none focus:border-blue-500"/>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={validate} disabled={!canEdit||!!busy||FIELD_CONFIG[provider].filter(f=>f.required).some(f=>!fields[f.key]?.trim())} className="rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy==='validate'?'Validating…':'Validate credentials'}</button>
        {validation&&<button type="button" onClick={connect} disabled={!canEdit||!!busy||!selectedSender} className="rounded-lg bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy==='connect'?'Connecting…':'Connect sender'}</button>}
      </div>
      {validation&&<div className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2">
        <p className="text-xs font-bold text-emerald-800">Provider verified · {validation.accountName||validation.providerAccountId}</p>
        <label className="block text-[11px] font-semibold text-slate-600">Choose sender
          <select value={selectedSender} onChange={e=>setSelectedSender(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
            {validation.senders.map((sender:Sender)=><option key={sender.providerSenderId} value={sender.providerSenderId}>{sender.phoneNumber}{sender.displayName?' · '+sender.displayName:''} · ID {sender.providerSenderId}</option>)}
          </select>
        </label>
        {validation.warnings?.map((warning,i)=><p key={i} className="text-[11px] text-amber-700">{warning}</p>)}
      </div>}
    </div>
    {connections.length>0&&<div className="space-y-2">
      <h4 className="text-xs font-bold text-slate-700">Connected senders ({connections.length})</h4>
      {connections.map(connection=><div key={connection.connectionId} className="rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-900">{connection.displayName||connection.provider}</span><span className={'rounded-full px-2 py-0.5 text-[9px] font-bold '+(connection.status==='CONNECTED'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700')}>{connection.status}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{connection.provider}</span></div>
            <p className="mt-1 text-xs text-slate-600">{connection.sender.phoneNumber} <span className="text-slate-400">· {connection.sender.providerSenderId}</span></p>
            <p className="mt-1 text-[10px] text-slate-500">Webhook: {connection.webhook?.status||'PENDING'} · Connection ID {connection.connectionId}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={()=>syncTemplates(connection.connectionId)} disabled={!!busy||connection.status!=='CONNECTED'} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 disabled:opacity-50">{busy==='templates-'+connection.connectionId?'Syncing…':'Sync templates'}</button>
            {canEdit&&<button type="button" onClick={()=>disconnect(connection.connectionId)} disabled={!!busy} className="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 disabled:opacity-50">{busy===connection.connectionId?'Disconnecting…':'Disconnect'}</button>}
          </div>
        </div>
        {templates[connection.connectionId]&&<div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="mb-2 text-[11px] font-bold text-slate-700">Templates ({templates[connection.connectionId].length})</p>
          {templates[connection.connectionId].length?templates[connection.connectionId].map(t=><div key={t.providerTemplateId} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-1.5 text-[11px]"><span className="font-semibold text-slate-700">{t.name} · {t.language}</span><span className="text-slate-500">{t.status}</span></div>):<p className="text-[11px] text-slate-500">No templates returned by this provider.</p>}
        </div>}
      </div>)}
    </div>}
    {webhookInstructions.length>0&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">Finish webhook setup</p>{webhookInstructions.map((line,i)=><p key={i} className="mt-1 break-words text-[11px] leading-relaxed text-amber-900">{line}</p>)}</div>}
    {error&&<p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
    {message&&<p role="status" className="text-xs font-semibold text-slate-600">{message}</p>}
    {!canEdit&&<p className="text-[11px] text-slate-500">Only workspace admins can manage provider connections.</p>}
  </section>;
}
