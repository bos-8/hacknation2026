"use client";
import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowClockwise, Archive, CheckCircle, CheckCircleFill, Files, InfoCircle, Pencil, Plus, Send } from 'react-bootstrap-icons';
import { CONFIG_DEFAULTS, CONFIG_INTERVALS, type ConfigPage, type ConfigQuery, type ConfigSettings, type ConfigVersion, type ConfigChange } from '@formiq/database/config';
import type { AppLocale } from '@/schemas/i18n';
import { parseConfigQuery } from '@/schemas/system-config';
import { Badge, Button, Input, Select, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Textarea, Throbber, VerticalDivider } from '@/ui/basic';
import { TableQuery, useTableQuery } from '@/ui/components/table-query';
import { TableFilters } from '@/ui/components/table-filters';
import { TableSearch } from '@/ui/components/table-search';
import { TablePaginator } from '@/ui/components/table-paginator';
import { TableLoadingBody } from '@/ui/components/table-loading-body';
import { TableDataRegion } from '@/ui/components/table-data-region';
import { useTableRefresh } from '@/ui/components/use-table-refresh';
import { PushAside } from '@/ui/components/aside';
import { AsideSection } from '@/ui/components/aside-section';
import { Popup } from '@/ui/components/popup';
import { refreshSettings, submitSettings, transitionSettings } from './actions';

export function SettingsResults({locale,initialQuery}:{locale:AppLocale;initialQuery:ConfigQuery}) {
  const namespace='common.admin.settings';const t=useTranslations(namespace);const formatter=useFormatter();
  const query=useTableQuery(initialQuery,parseConfigQuery);
  const {result,refresh,pending,status}=useTableRefresh<ConfigPage,ConfigQuery>(null,query,refreshSettings);
  const [editor,setEditor]=useState<{row?:ConfigVersion;sourceVersion?:number;settings:ConfigSettings}|null>(null);
  const [info,setInfo]=useState<ConfigVersion|null>(null);
  const [confirmation,setConfirmation]=useState<{row:ConfigVersion;operation:ConfigChange['operation']}|null>(null);
  const [saving,startSave]=useTransition();const [message,setMessage]=useState<string|null>(null);
  const date=(value:Date|null)=>value?formatter.dateTime(value,{dateStyle:'short',timeStyle:'medium'}):'—';
  const params={page:String(query.page),limit:String(query.limit),...(query.search?{search:query.search}:{}),...(query.status?{status:query.status}:{})};
  const action=`/${locale}/admin/settings`;
  const error=!pending&&(status==='denied'||status==='failed')?t('loadError'):null;
  function edit(row?:ConfigVersion){setMessage(null);setEditor({row:row?.status==='DRAFT'?row:undefined,sourceVersion:row?.status==='PUBLISHED'?row.version:undefined,settings:row?{name:row.name,description:row.description,monitoringIntervalSeconds:row.monitoringIntervalSeconds,cleanupIntervalSeconds:row.cleanupIntervalSeconds,ocrPollSeconds:row.ocrPollSeconds,historyRetentionDays:row.historyRetentionDays,queueRetryLimit:row.queueRetryLimit,slowResponseMs:row.slowResponseMs}:{...CONFIG_DEFAULTS,name:t('defaultName')}});}
  function save(){if(!editor||saving)return;setMessage(null);startSave(async()=>{try{const response=await submitSettings(editor.settings,editor.row?{uuid:editor.row.uuid,expectedUpdatedAt:new Date(editor.row.updatedAt).toISOString()}:undefined);if(response.status==='ok'){setEditor(null);void refresh();}else setMessage(t(response.status==='conflict'?'conflict':'saveError'));}catch{setMessage(t('saveError'));}});}
  function change(){if(!confirmation||saving)return;setMessage(null);startSave(async()=>{try{const response=await transitionSettings({uuid:confirmation.row.uuid,expectedUpdatedAt:new Date(confirmation.row.updatedAt).toISOString(),operation:confirmation.operation,expectedActiveUuid:result?.activeUuid??null});if(response.status==='ok'){setConfirmation(null);void refresh();}else setMessage(t(response.status==='conflict'?'conflict':'saveError'));}catch{setMessage(t('saveError'));}});}
  const workerStatus=(worker:ConfigPage['workers'][number])=>!result||worker.errorCode||worker.appliedConfigUuid!==result.activeUuid||new Date(worker.heartbeatAt).getTime()<=new Date(result.checkedAt).getTime()-120000?'waiting':result.activeUuid?'synced':'paused';
  const numeric=['historyRetentionDays','queueRetryLimit','slowResponseMs'] as const;
  return <TableQuery locale={locale} pathname="/admin/settings" pending={pending}>
    <TableFilters namespace={namespace} action={action} definitions={[{key:'status',label:t('status'),options:['DRAFT','PUBLISHED','ARCHIVED'].map(value=>({value,label:t(`statuses.${value}`)}))}]}
      values={query.status?{status:query.status}:{}} preserved={{limit:params.limit,search:query.search}}
      search={<TableSearch namespace={namespace} action={action} inputId="settings-search" value={query.search} preserved={{limit:params.limit,...(query.status?{status:query.status}:{})}}/>}
      actions={<Button size="sm" className="h-7 px-2 text-xs" onClick={()=>edit()}><Plus aria-hidden="true"/>{t('create')}</Button>}
      refreshButton={<Button size="icon" className="size-7 p-0" disabled={pending} tooltip={t('refresh')} aria-label={t('refresh')} onClick={refresh}>{pending?<Throbber size="sm"/>:<ArrowClockwise aria-hidden="true"/>}</Button>}/>
    {result?.activeVersion&&<p className="py-2 text-sm">{t('active')}: v{result.activeVersion}</p>}
    {!pending&&result&&!result.activeUuid&&<p className="py-2 text-sm text-warning">{t('noActive')}</p>}
    {message&&!editor&&!confirmation&&<p role="alert" className="text-danger">{message}</p>}
    <TableDataRegion label={t('title')}><Table><caption className="sr-only">{t('title')}</caption><TableHead><TableRow>{['version','name','status','monitoringIntervalSeconds','queueRetryLimit','updatedAt','actions'].map(key=><TableHeader key={key} actionColumn={key==='actions'}>{t(key)}</TableHeader>)}</TableRow></TableHead>
      {pending?<TableLoadingBody colSpan={7} label={t('loading')}/>:<TableBody>{error&&<TableRow><TableCell colSpan={7} className="py-8 text-center text-danger">{error}</TableCell></TableRow>}
        {result?.versions.map(row=><TableRow key={row.uuid}><TableCell className="tabular-nums">v{row.version}</TableCell><TableCell>{row.name}</TableCell><TableCell><Badge tone={row.status==='PUBLISHED'?'success':row.status==='DRAFT'?'primary':'neutral'}>{t(`statuses.${row.status}`)}</Badge>{row.uuid===result.activeUuid&&<Badge tone="success" className="ml-2">{t('active')}</Badge>}</TableCell>
          <TableCell>{row.monitoringIntervalSeconds}s</TableCell><TableCell>{row.queueRetryLimit}</TableCell><TableCell className="whitespace-nowrap">{date(row.updatedAt)}</TableCell>
          <TableCell actionColumn><div className="flex items-center justify-end gap-1">
            <Button size="icon" tone="main-outline" className="size-7 p-0" disabled={saving||row.status==='ARCHIVED'} tooltip={t(row.status==='PUBLISHED'?'editCopy':'edit')} aria-label={t(row.status==='PUBLISHED'?'editCopy':'edit')} onClick={()=>edit(row)}><Pencil aria-hidden="true"/></Button><VerticalDivider/>
            <Button size="icon" tone="main-outline" className="size-7 p-0" disabled={saving} tooltip={t('clone')} aria-label={t('clone')} onClick={()=>{setMessage(null);setConfirmation({row,operation:'clone'});}}><Files aria-hidden="true"/></Button>
            <Button size="icon" tone="success-outline" className="size-7 p-0" disabled={saving||row.status!=='DRAFT'} tooltip={t('publish')} aria-label={t('publish')} onClick={()=>{setMessage(null);setConfirmation({row,operation:'publish'});}}><Send aria-hidden="true"/></Button>
            <Button size="icon" tone={row.uuid===result.activeUuid?'primary':'success-outline'} className="size-7 p-0" disabled={saving||row.status!=='PUBLISHED'||row.uuid===result.activeUuid} tooltip={t('activate')} aria-label={t('activate')} onClick={()=>{setMessage(null);setConfirmation({row,operation:'activate'});}}>{row.uuid===result.activeUuid?<CheckCircleFill aria-hidden="true"/>:<CheckCircle aria-hidden="true"/>}</Button>
            <Button size="icon" tone="warning-outline" className="size-7 p-0" disabled={saving||row.status==='ARCHIVED'||row.uuid===result.activeUuid} tooltip={t('archive')} aria-label={t('archive')} onClick={()=>{setMessage(null);setConfirmation({row,operation:'archive'});}}><Archive aria-hidden="true"/></Button><VerticalDivider/>
            <Button size="icon" tone="main-outline" className="size-7 p-0" tooltip={t('info')} aria-label={t('info')} onClick={()=>setInfo(row)}><InfoCircle aria-hidden="true"/></Button>
          </div></TableCell></TableRow>)}
        {!result?.versions.length&&!error&&<TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{t('empty')}</TableCell></TableRow>}
      </TableBody>}</Table></TableDataRegion>
    <TablePaginator locale={locale} namespace={namespace} pathname="/admin/settings" params={params} page={query.page} limit={query.limit} total={result?.total??0} rowCount={result?.versions.length??0} sizes={[10,25,50]} unavailable={!result}/>
    <AsideSection title={t('workers')} defaultOpen><p className="mb-2 text-sm text-muted-foreground">{t('workerDescription')}</p>{!result?.workers.length?<p className="text-sm">{t('noWorkers')}</p>:<ul className="space-y-2 text-sm">{result.workers.map(worker=><li key={worker.uuid} className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono">{worker.workerKey}</span><Badge tone={workerStatus(worker)==='synced'?'success':workerStatus(worker)==='paused'?'neutral':'warning'}>{t(workerStatus(worker))}</Badge><span>{worker.appliedVersion?`v${worker.appliedVersion}`:'—'}</span><span>{date(worker.appliedAt)}</span><span>{t('heartbeat')}: {date(worker.heartbeatAt)}</span></li>)}</ul>}</AsideSection>
    <AsideSection title={t('activationHistory')}><ul className="space-y-2 text-xs">{result?.activations.map(item=><li key={item.uuid}>{date(item.createdAt)} · {item.previousConfigUuid??'—'} → {item.configUuid} · {item.createdByUuid}</li>)}</ul></AsideSection>
    {editor&&<PushAside open title={t(editor.sourceVersion?'editCopy':editor.row?'edit':'create')} disableClose={saving} onClose={()=>setEditor(null)}><form className="space-y-4" onSubmit={event=>{event.preventDefault();save();}}>
      {editor.sourceVersion&&<p className="text-sm text-muted-foreground">{t('editCopyNotice',{version:editor.sourceVersion})}</p>}
      <label className="grid gap-1 text-sm">{t('name')}<Input name="name" required maxLength={120} value={editor.settings.name} disabled={saving} onChange={event=>setEditor({...editor,settings:{...editor.settings,name:event.target.value}})}/></label>
      <label className="grid gap-1 text-sm">{t('description')}<Textarea name="description" maxLength={2000} value={editor.settings.description} disabled={saving} onChange={event=>setEditor({...editor,settings:{...editor.settings,description:event.target.value}})}/></label>
      {(['monitoringIntervalSeconds','cleanupIntervalSeconds'] as const).map(key=><label key={key} className="grid gap-1 text-sm">{t(key)}<Select name={key} value={editor.settings[key]} disabled={saving} onChange={event=>setEditor({...editor,settings:{...editor.settings,[key]:Number(event.target.value)}})}>{CONFIG_INTERVALS.map(n=><option key={n} value={n}>{n/60} min</option>)}</Select></label>)}
      <label className="grid gap-1 text-sm">{t("ocrPollSeconds")}<Input name="ocrPollSeconds" type="number" required min={1} max={3600} value={editor.settings.ocrPollSeconds} disabled={saving} onChange={event=>setEditor({...editor,settings:{...editor.settings,ocrPollSeconds:Number(event.target.value)}})}/></label>
      {numeric.map(key=><label key={key} className="grid gap-1 text-sm">{t(key)}<Input name={key} type="number" required min={key==='historyRetentionDays'?1:key==='slowResponseMs'?100:0} max={key==='historyRetentionDays'?7:key==='slowResponseMs'?5000:10} step={1} value={editor.settings[key]} disabled={saving} onChange={event=>setEditor({...editor,settings:{...editor.settings,[key]:Number(event.target.value)}})}/></label>)}
      {message&&<p role="alert" className="text-danger">{message}</p>}<div className="flex justify-end gap-2"><Button disabled={saving} onClick={()=>setEditor(null)}>{t('cancel')}</Button><Button type="submit" tone="success-outline" disabled={saving}>{saving?<Throbber size="sm"/>:t(editor.sourceVersion?'saveCopy':'save')}</Button></div>
    </form></PushAside>}
    {info&&<PushAside open title={t('info')} onClose={()=>setInfo(null)}><AsideSection title={t('info')} defaultOpen><dl className="space-y-3">{Object.entries(info).map(([key,value])=><div key={key}><dt className="text-xs text-muted-foreground">{t.has(key)?t(key):key}</dt><dd className="wrap-anywhere text-sm">{value instanceof Date?date(value):String(value??'—')}</dd></div>)}</dl></AsideSection></PushAside>}
    {confirmation&&<Popup title={t(confirmation.operation)} disableClose={saving} onClose={()=>setConfirmation(null)} content={<div className="space-y-3"><p>{t('confirm',{version:confirmation.row.version})}</p>{confirmation.operation==='activate'&&<p>{t('activationNotice')}</p>}{message&&<p role="alert" className="text-danger">{message}</p>}</div>} actions={<><Button disabled={saving} onClick={()=>setConfirmation(null)}>{t('cancel')}</Button><Button tone="success-outline" disabled={saving} onClick={change}>{saving?<Throbber size="sm"/>:t('confirmAction')}</Button></>}/>}
  </TableQuery>;
}
