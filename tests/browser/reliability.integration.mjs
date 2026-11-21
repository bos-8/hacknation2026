import assert from 'node:assert/strict';
import {testDocumentReview,testDocumentComparisonPdf} from './document-review.mjs';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const playwrightPath=process.env.PLAYWRIGHT_MODULE || '../../.local/ui-check/node_modules/playwright/index.mjs';
const {chromium}=await import(new URL(playwrightPath,import.meta.url));
import {createDatabaseClient} from '../../packages/database/dist/index.js';

const local=parseEnv(readFileSync('infra/local/.env.dev','utf8'));
const web=parseEnv(readFileSync('apps/web/.env','utf8'));
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const sharp=require('sharp');
const app=new URL(web.AUTH_BASE_URL).origin;
assert.equal(new URL(app).hostname,'modulon.local');assert.equal(local.ENV_MODE,'dev');
assert.ok(['localhost','127.0.0.1'].includes(new URL(web.DATABASE_URL).hostname));
const auth=new URL(web.AUTH_ISSUER).origin;
const admin=new URL(local.AUTH_ADMIN_PUBLIC_URL).origin;
const realm=new URL(web.AUTH_ISSUER).pathname.split('/').at(-1);
const suffix=randomBytes(6).toString('hex');
const username=`ui-check-${suffix}`;
const password=randomBytes(24).toString('base64url');
const codes=[`UI-A-${suffix}`.toUpperCase(),`UI-Z-${suffix}`.toUpperCase()];
let token,userId,secondUserId,browser,activePage;
const db=createDatabaseClient({connectionString:web.DATABASE_URL});
async function api(method,path,body){
 let response=await fetch(admin+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(response.status===401){const refreshed=await fetch(auth+'/realms/master/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:local.AUTH_ADMIN_USERNAME,password:local.AUTH_ADMIN_PASSWORD})});assert.ok(refreshed.ok,'Operator token refresh failed');token=(await refreshed.json()).access_token;response=await fetch(admin+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 assert.ok(response.ok,`Keycloak ${method} failed: ${response.status}`);
 if(response.status===201)return response.headers.get('location').split('/').at(-1);
 return response.status===204?null:response.json();
}
async function save(page,code,image){
 await page.getByRole('link',{name:'Add product',exact:true}).click();
 await page.waitForURL(url=>url.pathname.endsWith('/admin/products/create'));
 const panel=page.locator('#product-create-panel');await panel.waitFor({state:'visible'});
 await panel.locator('input[name=code]').fill(code);
 await panel.locator('input[name=name]').fill(`Fixture ${code}`);
 await panel.locator('input[name=price]').fill('12.3456');
 await panel.locator('textarea[name=description]').fill('Disposable browser fixture');
 if(image){await panel.getByRole('button',{name:'Image (optional)',exact:true}).click();const buffer=await sharp({create:{width:32,height:32,channels:4,background:'#55aa66'}}).png().toBuffer();await panel.locator('input[name=image]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer});}
 await panel.getByRole('button',{name:'Save product',exact:true}).click();
 await page.waitForURL(url=>url.pathname.endsWith('/admin/products'),{timeout:45000});
 await page.getByText(`Fixture ${code}`,{exact:true}).first().waitFor({state:'visible',timeout:45000});
}
try{
 const login=await fetch(auth+'/realms/master/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:local.AUTH_ADMIN_USERNAME,password:local.AUTH_ADMIN_PASSWORD})});
 assert.ok(login.ok,'Operator authentication failed');token=(await login.json()).access_token;
 for(const [name,level] of Object.entries({ROOT:100,SADMIN:90,ADMIN:80,USER:50,LOGED:0})){const role=await api('GET',`/admin/realms/${realm}/roles/${name}`);assert.deepEqual(role.attributes.level,[String(level)]);}
 console.log('PASS live Keycloak level attributes');
 userId=await api('POST',`/admin/realms/${realm}/users`,{username,email:`${username}@example.invalid`,emailVerified:true,firstName:'UI',lastName:'Fixture',enabled:true,credentials:[{type:'password',value:password,temporary:false}]});
 console.log('Fixture username:',username);
 const role=await api('GET',`/admin/realms/${realm}/roles/ADMIN`);
 await api('POST',`/admin/realms/${realm}/users/${userId}/role-mappings/realm`,[role]);
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-proxy-server']});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
 const page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);
 page.on('response', response=>{const request=response.request();if(request.method()==='POST'||response.status()>=500){const url=new URL(request.url());console.log('HTTP',request.method(),url.origin+url.pathname,response.status());}});
 const home=await page.goto(app+'/en',{waitUntil:'domcontentloaded'});assert.equal(home.status(),200,'Canonical homepage must be ready before login');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.locator('input[name=username]').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).origin,auth);
 await page.locator('input[name=username]').fill(username+'@example.invalid');await page.locator('input[name=password]').fill(password);
 await page.locator('#kc-login').click();
 await page.waitForURL(url=>url.origin===app&&!url.pathname.includes('/api/'),{timeout:45000});
 console.log('PASS real sign-in button -> Server Action -> Next.js -> Keycloak -> application callback');
 if(process.argv.includes('--document-pdf-only')){
   await testDocumentComparisonPdf({page,app,db,suffix});
 }else if(process.argv.includes('--documents-only')){
   await testDocumentReview({page,app,db,sharp,suffix});
 }else{
 await page.goto(app+'/en/chat');
 await page.getByRole('heading',{name:'Chat',exact:true}).waitFor();
 await page.getByRole('navigation',{name:'Chat navigation'}).getByRole('link',{name:'System prompt',exact:true}).click();
 await page.waitForURL(url=>url.pathname==='/en/chat/settings');
 await page.getByRole('textbox',{name:'System prompt',exact:true}).waitFor();
 await page.goto(app+'/en/chat');
 const chatText='Chat fixture '+suffix;
 const chatTitle='Renamed '+suffix;
 const chatBytes=Buffer.from('Private attachment fixture');
 await page.getByRole('button',{name:'Thinking',exact:true}).click();
 await page.getByRole('textbox',{name:'Message',exact:true}).fill(chatText);
 await page.locator('input[type=file]').setInputFiles({name:'chat-notes.txt',mimeType:'text/plain',buffer:chatBytes});
 const chatResponse=process.env.CHAT_EXPECT_OPENAI==='1'
   ? page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/chat' && response.request().method()==='POST')
   : null;
 await page.getByRole('button',{name:'Send',exact:true}).click();
 let renderedReply;
 if(chatResponse){
   const response=await chatResponse;
   assert.match(response.headers()['content-type'] ?? '',/application\/x-ndjson/);
   const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
   assert.equal(events.find(event=>event.type==='error')?.status,undefined,'OpenAI chat stream returned an error');
   const deltas=events.filter(event=>event.type==='text').map(event=>event.delta);
   assert.ok(deltas.length>1,'Expected multiple incremental OpenAI text events');
   const assistantReply=events.find(event=>event.type==='done')?.entry;
   assert.equal(assistantReply?.content,deltas.join(''));
   const generation=assistantReply.generation;
   assert.ok(generation.model && generation.promptVersion > 0);
   assert.ok(generation.firstTextMs >= 0 && generation.totalMs >= generation.firstTextMs);
   assert.ok(generation.usage?.input > 0 && generation.usage.output > 0);
   await page.locator('[data-chat-composer] form[aria-busy="false"]').waitFor();
   renderedReply=await page.locator('[data-chat-markdown]').last().innerText();
   assert.ok(renderedReply.trim());
   console.log('PASS chat streams a reply through POST /api/v1/chat');
 }
 const chatFile=page.getByRole('link',{name:/chat-notes\.txt/});
 await chatFile.waitFor();
 const chatDownload=(await chatFile.getAttribute('href'));
 const ownedAttachment=await context.request.get(app+chatDownload);
 assert.equal(ownedAttachment.status(),200);
 assert.deepEqual(await ownedAttachment.body(),chatBytes);
 await page.getByRole('button',{name:'Rename conversation',exact:true}).click();
 await page.getByRole('textbox',{name:'Rename conversation',exact:true}).fill(chatTitle);
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('heading',{name:chatTitle,exact:true}).waitFor();
 await page.reload();
 const desktopHistory=page.locator('aside[data-chat-history]');
 await desktopHistory.waitFor({state:'hidden'});
 const chatHistoryToggle=page.getByRole('button',{name:'History',exact:true});
 await chatHistoryToggle.click();
 await desktopHistory.waitFor({state:'visible'});
 await page.waitForFunction(()=>{
   const panel=document.querySelector('aside[data-chat-history]');
   return panel&&Math.abs(panel.getBoundingClientRect().right-window.innerWidth)<=2;
 });
 await desktopHistory.getByRole('button',{name:new RegExp(chatTitle)}).click();
 await page.getByText(chatText,{exact:true}).waitFor();
 if(renderedReply){
   assert.equal(await page.locator('[data-chat-markdown]').last().innerText(),renderedReply);
   const details=page.locator('[data-chat-generation]').last();
   await details.locator('summary').click();
   await details.getByText('Time to first text',{exact:true}).waitFor();
   await details.getByText('Reasoning tokens',{exact:true}).waitFor();
   assert.equal(await page.locator('[aria-label="Messages"] article time').count(),2);
   console.log('PASS OpenAI timing and usage metrics persist in conversation history');
 }
 assert.equal(await page.getByRole('button',{name:'Thinking',exact:true}).getAttribute('aria-pressed'),'true');
 await chatFile.waitFor();
 const longMessage=Array.from({length:60},(_,index)=>`Scrollable line ${index}`).join('\n');
 await page.getByRole('textbox',{name:'Message',exact:true}).fill(longMessage);
 await page.getByRole('button',{name:'Send',exact:true}).click();
 const transcript=page.getByRole('region',{name:'Messages',exact:true});
 await transcript.getByText('Scrollable line 59',{exact:false}).waitFor();
 const layout=await page.evaluate(()=>{
   const composer=document.querySelector('[data-chat-composer]').getBoundingClientRect();
   return {bottom:composer.bottom,height:window.innerHeight,
     scrollable:document.querySelector('[aria-label="Messages"]').scrollHeight>document.querySelector('[aria-label="Messages"]').clientHeight};
 });
 assert.ok(layout.scrollable&&Math.abs(layout.bottom-layout.height)<=2);
 await page.setViewportSize({width:390,height:780});
 await page.getByRole('button',{name:'History',exact:true}).click();
 const mobileHistory=page.locator('aside[data-aside-panel]').filter({hasText:chatTitle});
 await mobileHistory.getByRole('button',{name:new RegExp(chatTitle)}).click();
 await mobileHistory.waitFor({state:'hidden'});
 await page.getByText('AI can make mistakes. Check important information.',{exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('[data-chat-composer]').getBoundingClientRect().bottom-window.innerHeight)<=2));
 await page.setViewportSize({width:1440,height:1000});
 console.log('PASS chat history opens as a right-hand aside on desktop and mobile; composer stays at viewport bottom');
 console.log('PASS chat saves a message and private attachment, renames it and reopens the selected mode from history');
 await page.goto(app+'/en/admin/products',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Products',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('tbody[aria-busy="true"]'),{timeout:45000});
 console.log('PASS authenticated product table shell and initial load');
 await save(page,codes[0],false);console.log('PASS create without image');
 await save(page,codes[1],true);console.log('PASS create with normalized image');
 const historyProduct=await db.product.findUnique({where:{code:codes[0]},select:{uuid:true,createdByUuid:true}});
 let historyReads=0;
 await page.route('**/api/v1/admin/history?**',async route=>{
   historyReads++;
   const cursor=new URL(route.request().url()).searchParams.get('before');
   await route.fulfill({json:{rows:[{uuid:cursor?'019a75c0-0000-7000-8000-000000000001':'019a75c0-0000-7000-8000-000000000002',actorUuid:historyProduct.createdByUuid,occurredAt:new Date().toISOString(),operation:cursor?'INSERT':'UPDATE',before:cursor?null:{price:'1.0000'},after:{price:'2.0000'}}],next:cursor?null:'019a75c0-0000-7000-8000-000000000002'}});
 });
 await page.getByRole('button',{name:`Details for product Fixture ${codes[0]}`,exact:true}).click();
 const historyToggle=page.getByRole('button',{name:'Change history',exact:true});await historyToggle.waitFor();assert.equal(historyReads,0);
 await historyToggle.click();await page.getByText('Updated ·',{exact:false}).first().waitFor();
 await page.getByText('Changed values',{exact:true}).click();await page.getByText('1.0000',{exact:true}).waitFor();await page.getByText('2.0000',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Load older',exact:true}).click();await page.getByText('Created ·',{exact:false}).first().waitFor();assert.ok(historyReads>=2);
 await page.unroute('**/api/v1/admin/history?**');await page.goto(app+'/en/admin/products');
 console.log('PASS lazy change-history UI with exact before/after values and pagination (controlled API fixture)');
 const imageRecord=await db.product.findUnique({where:{code:codes[1]},select:{imageFileUuid:true}});
 const previewActor=await db.user.findUnique({where:{keycloakUuid:userId},select:{uuid:true}});
 const pdf=Buffer.from('%PDF-1.7 preview fixture\n'+' '.repeat(128*1024));
 const fileName='preview-'+suffix+'.pdf';
 const sdk=require('@aws-sdk/client-s3');
 const translations=JSON.parse(readFileSync('apps/web/messages/en/common.json','utf8')).common.admin.files;
 await page.goto(app+'/en/admin/files');
 const uploadTrigger=page.getByRole('button',{name:translations.addFile,exact:true});
 const uploadPanel=page.getByRole('form',{name:translations.addFile,exact:true});
 await uploadTrigger.click();
 await uploadPanel.locator('input[type=file]').setInputFiles({name:fileName,mimeType:'application/pdf',buffer:pdf});
 await uploadPanel.locator('input[type=file]').press('Escape');
 await uploadPanel.waitFor({state:'hidden'});
 assert.equal(await uploadTrigger.evaluate(button=>button===document.activeElement),true);
 await uploadTrigger.click();
 assert.equal(await uploadPanel.getByRole('button',{name:translations.upload,exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('dialog',{name:translations.addFile,exact:true}).count(),0);
 const toolbar=await uploadTrigger.boundingBox();
 const panel=await uploadPanel.boundingBox();
 assert.ok(toolbar&&panel&&panel.y>=toolbar.y+toolbar.height);
 await uploadPanel.locator('input[type=file]').setInputFiles({name:fileName,mimeType:'application/pdf',buffer:pdf});
 const cdp=await context.newCDPSession(page);
 const uploadUrl=app+'/api/v1/admin/files/upload';
 await cdp.send('Network.emulateNetworkConditionsByRule',{offline:false,matchedNetworkConditions:[
   {urlPattern:uploadUrl,latency:75,downloadThroughput:-1,uploadThroughput:24*1024},
 ]});
 try {
   await uploadPanel.getByRole('button',{name:translations.upload,exact:true}).click();
   const bell=page.locator('[data-notification-trigger] button');
   await bell.click();
   const progress=page.locator('[data-notification-id]').filter({hasText:fileName});
   await progress.getByText(/About .* s remaining/).waitFor();
   await progress.getByText(/Sent .*\([1-9][0-9]?%\)/).waitFor();
   const headers={origin:app,'content-type':'application/octet-stream','x-file-name':'blocked.txt'};
   const parallel=await context.request.post(uploadUrl,{headers,data:Buffer.from('parallel')});
   assert.equal(parallel.status(),429);
   assert.deepEqual(await parallel.json(),{status:'busy'});
   const wrongOrigin=await context.request.post(uploadUrl,{headers:{...headers,origin:'https://example.invalid'},data:Buffer.from('foreign')});
   assert.equal(wrongOrigin.status(),403);
   await progress.getByText(translations.uploaded,{exact:true}).waitFor();
   console.log('PASS live upload progress and ETA in notifications, one upload per user and cross-origin rejection');
   await page.getByLabel('Close notifications panel',{exact:true}).click();
 } finally {
   await cdp.send('Network.emulateNetworkConditionsByRule',{offline:false,matchedNetworkConditions:[]});
   await cdp.detach();
 }
 await uploadPanel.waitFor({state:'hidden'});
 await page.getByRole('row').filter({has:page.getByText(fileName,{exact:true})}).waitFor();
 const pdfFile=await db.file.findFirstOrThrow({where:{name:fileName,createdByUuid:previewActor.uuid}});
 console.log('PASS toolbar upload expands below its trigger, closes with Escape, resets selection and refreshes after upload');
 const imagePath=`**/api/v1/admin/files/${imageRecord.imageFileUuid}/image`;
 await page.route(imagePath,route=>route.fulfill({status:503,body:''}));
 await page.goto(app+`/en/admin/files?file=${imageRecord.imageFileUuid}&preview=image`);
 await page.getByText(translations.imageLoadFailed,{exact:true}).waitFor();
 await page.unroute(imagePath);
 await page.evaluate(uuid=>{const url=new URL(location.href);url.searchParams.set('file',uuid);history.pushState(null,'',url);},pdfFile.uuid);
 await page.getByText(translations.imageUnsupported,{exact:true}).waitFor();
 assert.equal(await page.getByText(translations.imageLoadFailed,{exact:true}).count(),0);
 await page.evaluate(uuid=>{const url=new URL(location.href);url.searchParams.set('file',uuid);history.pushState(null,'',url);},imageRecord.imageFileUuid);
 await page.locator('img[src^="blob:"]').waitFor();
 assert.equal(await page.getByText(translations.imageUnsupported,{exact:true}).count(),0);
 console.log('PASS storage 503 recovery, PDF 415 message and clearing stale preview/error when selection changes');
 await page.goto(app+'/en/admin/files');
 const fileRow=page.getByRole('row').filter({has:page.getByText(fileName,{exact:true})});
 const expand=fileRow.getByRole('button',{name:translations.olderRevisionsFor.replace('{name}',fileName),exact:true});
 await fileRow.waitFor();
 assert.equal(await expand.count(),0,'A single version does not need an expansion button');
 await fileRow.getByRole('button',{name:translations.replaceFileFor.replace('{name}',fileName),exact:true}).click();
 const uploadDialog=page.getByRole('dialog',{name:translations.addRevision,exact:true});
 const png=await sharp({create:{width:16,height:16,channels:4,background:'#335577'}}).png().toBuffer();
 await uploadDialog.locator('input[type=file]').setInputFiles({name:'revision.png',mimeType:'image/png',buffer:png});
 await uploadDialog.getByRole('button',{name:translations.upload,exact:true}).click();
 await expand.waitFor();
 assert.equal(await expand.locator('xpath=ancestor::td').textContent(),'2');
 assert.equal(await fileRow.count(),1);
 await expand.click();
 const older=page.getByRole('row').filter({has:page.getByRole('link',{
   name:translations.downloadFor.replace('{name}',fileName).replace('{version}','1'),exact:true})});
 const revisionInfo=older.getByRole('button',{name:translations.revisionPreview,exact:true});
 await revisionInfo.click();
 assert.equal(await fileRow.locator('xpath=following-sibling::tr[1]').getByRole('link',{
   name:translations.downloadFor.replace('{name}',fileName).replace('{version}','1'),exact:true}).count(),1);
 const revisionAside=page.locator('aside[data-aside-panel]').filter({hasText:translations.revisionLabel.replace('{version}','1')});
 await revisionAside.getByText(translations.imageUnsupported,{exact:true}).waitFor();
 assert.equal(await older.getByText(translations.imageUnsupported,{exact:true}).count(),0);
 await revisionAside.getByLabel('Close side panel',{exact:true}).click();
 await revisionAside.waitFor({state:'hidden'});
 assert.equal(await revisionInfo.evaluate(button=>button===document.activeElement),true);
 const olderDownload=await context.request.get(app+`/api/v1/admin/files/${pdfFile.uuid}/download?version=1`);
 assert.equal(olderDownload.status(),200);
 assert.deepEqual(await olderDownload.body(),pdf);
 await older.getByRole('button',{name:translations.restoreRevision,exact:true}).click();
 await page.getByRole('dialog',{name:translations.restoreRevision,exact:true})
   .getByRole('button',{name:translations.restoreRevision,exact:true}).click();
 await page.getByText(translations.revisionRestored,{exact:true}).waitFor();
 const restored=await db.fileVersion.findMany({where:{fileUuid:pdfFile.uuid},orderBy:{version:'asc'}});
 assert.deepEqual(restored.map(item=>item.version),[1,2,3]);
 assert.equal(new Set(restored.map(item=>item.seaweedUuid)).size,3);
 const restoredDownload=await context.request.get(app+`/api/v1/admin/files/${pdfFile.uuid}/download?version=3`);
 assert.equal(restoredDownload.status(),200);
 assert.match(restoredDownload.headers()['content-disposition'],/\.pdf/);
 const newVersionDownload=await context.request.get(app+`/api/v1/admin/files/${pdfFile.uuid}/download?version=2`);
 assert.equal(newVersionDownload.status(),200);
 assert.match(newVersionDownload.headers()['content-disposition'],/revision\.png/);
 assert.deepEqual(await restoredDownload.body(),pdf);
 await fileRow.getByRole('button',{name:translations.permaDeleteFor.replace('{name}',fileName),exact:true}).click();
 await page.getByRole('dialog',{name:translations.perma_delete,exact:true})
   .getByRole('button',{name:translations.perma_delete,exact:true}).click();
 await fileRow.waitFor({state:'hidden'});
 assert.equal(await db.file.count({where:{uuid:pdfFile.uuid}}),0);
 assert.equal(await db.fileVersion.count({where:{fileUuid:pdfFile.uuid}}),0);
 const verifyStorage=new sdk.S3Client({endpoint:web.S3_ENDPOINT,region:web.S3_REGION||'eu-central-1',forcePathStyle:true,
   credentials:{accessKeyId:web.S3_APP_ACCESS_KEY,secretAccessKey:web.S3_APP_SECRET_KEY}});
 try {
   for(const revision of restored) await assert.rejects(verifyStorage.send(new sdk.HeadObjectCommand({
     Bucket:web.S3_BUCKET,Key:revision.seaweedUuid,
   })),error=>error.$metadata?.httpStatusCode===404);
 } finally { verifyStorage.destroy(); }
 console.log('PASS expand one file, preview/download an older copy, restore as version 3 and delete all three S3 objects and catalog rows');
 await page.goto(app+'/en/admin/products');
 const snapshot=await db.product.findMany({where:{code:{in:codes}},select:{code:true,imageFileUuid:true,price:true,currency:true}});
 assert.equal(snapshot.length,2);assert.equal(snapshot.find(row=>row.code===codes[0]).imageFileUuid,null);assert.ok(snapshot.find(row=>row.code===codes[1]).imageFileUuid);
 assert.ok(snapshot.every(row=>row.price.toFixed(4)==='12.3456'&&row.currency==='PLN'));
 await page.goto(app+'/en/admin/products/create',{waitUntil:'domcontentloaded'});
 await page.locator('#product-create-panel').waitFor({state:'visible'});
 await page.setViewportSize({width:320,height:800});
 assert.ok((await page.locator('#product-create-panel').boundingBox()).width<=320);
 await page.locator('#product-create-panel').getByRole('button',{name:'Cancel',exact:true}).click();
 await page.waitForURL(url=>url.pathname.endsWith('/admin/products'));
 await page.setViewportSize({width:1440,height:1000});
 await page.waitForFunction(()=>!document.querySelector('tbody[aria-busy="true"]'));
 console.log('PASS direct create URL and 320px panel');
 await page.evaluate(value=>{window.__tableFixture=value;},suffix);
 let navigations=0;page.on('request',request=>{if(request.isNavigationRequest()&&request.resourceType()==='document')navigations++;});
 const sizes=page.locator('details.group\\/page-size');
 await sizes.locator('summary').click();await sizes.locator('button[name=limit][value="1"]').click();
 await page.waitForURL(url=>url.searchParams.get('limit')==='1');
 await page.waitForFunction(()=>!document.querySelector('tbody[aria-busy="true"]'));
 assert.equal(await page.evaluate(()=>window.__tableFixture),suffix);
 await page.getByRole('link',{name:'Next',exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get('page')==='2');
 await page.waitForFunction(()=>!document.querySelector('tbody[aria-busy="true"]'));
 await page.locator('button[aria-controls="products-search-form"]').click();
 await page.locator('#products-search').fill(codes[1]);
 await page.locator('#products-search-form button[type=submit]').click();
 await page.waitForURL(url=>url.searchParams.get('search')===codes[1]);
 await page.getByText(`Fixture ${codes[1]}`,{exact:true}).first().waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>window.__tableFixture),suffix);assert.equal(navigations,0);
 console.log('PASS page size, paging and global search without a document reload');
 await page.getByRole('button',{name:'Filters',exact:true}).click();
 const filterForm=page.locator('form[data-table-query][aria-label="Filters"]');
 await filterForm.locator('select').first().selectOption('status');
 await filterForm.locator('select[name=status]').selectOption('inactive');
 await filterForm.getByRole('button',{name:'Apply filters',exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get('status')==='inactive');
 await page.getByText('No products match your criteria.',{exact:true}).waitFor();
 assert.equal(navigations,0);assert.equal(await page.evaluate(()=>window.__tableFixture),suffix);
 console.log('PASS global filter without a document reload');

 // Stacked real confirmation/session-warning dialogs: only the top layer owns Escape.
 await page.goto(app+'/en/admin/products?search='+encodeURIComponent(codes[0]),{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:`Fixture ${codes[0]} — permanently delete product`,exact:true}).click();
 const bottom=page.getByRole('dialog',{name:'Delete permanently',exact:true});await bottom.waitFor();
 const lease=new Date(Date.now()+45000).toISOString();
 await page.route('**/api/v1/auth/session-status',async route=>{
   const response=await route.fetch();const data=await response.json();
   await route.fulfill({response,json:{...data,expiresAt:lease,serverTime:new Date().toISOString(),warningSeconds:60}});
 });
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('dialog',{name:'Session expiring soon',exact:true}).waitFor();
 assert.equal(await page.locator('dialog[open]').count(),2);
 await page.keyboard.press('Escape');
 await page.getByRole('dialog',{name:'Session expiring soon',exact:true}).waitFor({state:'hidden'});
 assert.ok(await bottom.isVisible());
 await page.unroute('**/api/v1/auth/session-status');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.keyboard.press('Escape');await bottom.waitFor({state:'hidden'});
 console.log('PASS stacked session warning and delete confirmation: Escape closes only the top popup');
 // A different administrator changes name/price while the first confirmation is open.
 await page.getByRole('button',{name:`Fixture ${codes[0]} — permanently delete product`,exact:true}).click();await bottom.waitFor();
 const product=await db.product.findUnique({where:{code:codes[0]}});
 secondUserId=await api('POST',`/admin/realms/${realm}/users`,{username:username+'-second',email:`${username}-second@example.invalid`,emailVerified:true,firstName:'Second',lastName:'Administrator',enabled:true,credentials:[{type:'password',value:password,temporary:false}]});
 await api('POST',`/admin/realms/${realm}/users/${secondUserId}/role-mappings/realm`,[role]);
 const secondContext=await browser.newContext({ignoreHTTPSErrors:true});const second=await secondContext.newPage();activePage=second;second.setDefaultTimeout(30000);
 await second.bringToFront();
 await second.goto(app+'/en');await second.getByRole('button',{name:'Sign in',exact:true}).click();
 await second.locator('input[name=username]').fill(username+'-second@example.invalid');await second.locator('input[name=password]').fill(password);await second.locator('#kc-login').click();
 await second.waitForURL(url=>url.origin===app&&!url.pathname.includes('/api/'));
 console.log('PASS second administrator sign-in');
 assert.equal((await secondContext.request.get(app+chatDownload)).status(),404);
 await second.goto(app+'/en/chat');
 await second.getByRole('button',{name:'History',exact:true}).click();
 await second.locator('aside[data-chat-history]').getByText('No saved conversations.',{exact:true}).waitFor();
 assert.equal(await second.getByText(chatTitle,{exact:true}).count(),0);
 console.log('PASS another signed-in account cannot see the conversation or download its attachment');
 await second.goto(app+'/en/admin/products?search='+encodeURIComponent(codes[0]));
 await second.getByRole('button',{name:`Fixture ${codes[0]} — edit product`,exact:true}).click();
 const edit=second.locator('#product-edit-panel');await edit.locator('input[name=name]').fill('Concurrent '+suffix);await edit.locator('input[name=price]').fill('99.0000');
 await edit.getByRole('button',{name:'Save product',exact:true}).click();await edit.waitFor({state:'hidden'});
 const secondActor=await db.user.findUnique({where:{keycloakUuid:secondUserId},select:{uuid:true}});
 assert.equal((await db.product.findUnique({where:{uuid:product.uuid}})).updatedByUuid,secondActor.uuid);
 console.log('PASS second administrator product edit');
 activePage=page;await page.bringToFront();
 await bottom.getByRole('button',{name:'Delete permanently',exact:true}).click();
 await page.getByText('The product has changed or is unavailable. The list was refreshed.',{exact:true}).first().waitFor();
 assert.ok(await db.product.findUnique({where:{uuid:product.uuid}}));
 await page.keyboard.press('Escape');
 console.log('PASS two real administrators: stale deletion rejects the other administrator name/price update');
 activePage=second;await second.bringToFront();
 // A stale 401 arrives after another tab has renewed the same lease.
 await db.session.updateMany({where:{userUuid:secondActor.uuid},data:{expiresAt:new Date(Date.now()+1200000),renewalCount:{increment:1}}});
 let staleStatus=true;
 await second.route('**/api/v1/auth/session-status',async route=>{if(staleStatus){staleStatus=false;await route.fulfill({status:401,json:{error:'unauthorized'}});}else await route.continue();});
 const [protectedLease,synchronized]=await Promise.all([
   second.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/auth/hard-sign-out'),
   second.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/auth/session-status'&&response.status()===200),
   second.evaluate(()=>window.dispatchEvent(new Event('focus'))),
 ]);
 assert.equal((await protectedLease.json()).renewed,true);
 assert.equal((await synchronized.json()).refreshes,1);
 await second.unroute('**/api/v1/auth/session-status');assert.equal(await db.session.count({where:{userUuid:secondActor.uuid}}),1);
 console.log('PASS stale 401 logout preserves a concurrently renewed lease and resynchronizes the client');
 // If the renewal Set-Cookie is lost, resync must leave the protected UI once.
 const preserved=await db.session.findFirst({where:{userUuid:secondActor.uuid},select:{uuid:true}});
 await db.session.updateMany({where:{userUuid:secondActor.uuid},data:{expiresAt:new Date(Date.now()+1500000),renewalCount:{increment:1}}});
 const authCookie=(await secondContext.cookies(app)).find(cookie=>cookie.name.endsWith('.session_token'));assert.ok(authCookie);
 await secondContext.clearCookies({name:authCookie.name});
 await second.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await second.waitForURL(url=>url.origin===app&&url.pathname==='/en',{timeout:30000});
 assert.ok(await db.session.findUnique({where:{uuid:preserved.uuid}}));
 await second.getByRole('button',{name:'Sign in',exact:true}).click();
 let reacquired;const loginDeadline=Date.now()+15000;
 while(Date.now()<loginDeadline){const response=await secondContext.request.get(app+'/api/v1/auth/session-status',{timeout:1000}).catch(()=>null);if(response?.ok()){reacquired=await response.json();break;}await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(reacquired?.userUuid,secondActor.uuid);assert.notEqual(reacquired.sessionUuid,preserved.uuid);
 await db.session.delete({where:{uuid:preserved.uuid}});
 await second.goto(app+'/en/admin/products');await second.getByRole('heading',{name:'Products',exact:true}).waitFor();
 console.log('PASS lost renewal cookie exits protected UI without a logout loop; SSO reacquires a new session');
 await db.session.updateMany({where:{userUuid:secondActor.uuid},data:{expiresAt:new Date(0)}});await second.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await second.waitForURL(url=>url.origin===app&&url.pathname==='/en',{timeout:30000});
 assert.equal(await db.session.count({where:{userUuid:secondActor.uuid}}),0);await secondContext.close();activePage=page;await page.bringToFront();console.log('PASS expired session is revoked and returns to the public application');
 // Two result pages shrink to one; URL, rows and counters must agree after refresh.
 await page.goto(app+'/en/admin/products?limit=1&page=2&search='+encodeURIComponent(suffix),{waitUntil:'domcontentloaded'});
 await page.getByText('Page 2 of 2',{exact:true}).waitFor();
 await db.product.delete({where:{code:codes[1]}});
 await page.getByRole('button',{name:'Refresh table',exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get('page')==='1');
 await page.getByText('Page 1 of 1',{exact:true}).waitFor();
 assert.equal(await page.locator('tbody tr').count(),1);
 console.log('PASS page shrink refetches page 1 and synchronizes URL, rows and counter');
 // Session remains valid while role removal must stop the very next data action.
 await api('DELETE',`/admin/realms/${realm}/users/${userId}/role-mappings/realm`,[role]);
 const userRole=await api('GET',`/admin/realms/${realm}/roles/USER`);
 await api('POST',`/admin/realms/${realm}/users/${userId}/role-mappings/realm`,[userRole]);
 await page.getByRole('button',{name:'Refresh table',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Could not verify access'}).first().waitFor();
 console.log('PASS lowered role is denied by the next server action');
 }
}catch(error){
 if(activePage){const current=new URL(activePage.url());console.log('Browser failure path:',current.origin+current.pathname);await activePage.screenshot({path:'.local/ui-check/reliability-failure.png',fullPage:true}).catch(()=>{});}
 console.error('FAIL browser check:',String(error.message).split('\n').slice(0,8).join('\n').replace(/https?:\/\/\S+/g,'[url]'));process.exitCode=1;
}finally{
 await browser?.close();
 if(userId){
  const actor=await db.user.findUnique({where:{keycloakUuid:userId},select:{uuid:true}});
  if(actor){
   const versions=await db.fileVersion.findMany({where:{createdByUuid:actor.uuid},select:{seaweedUuid:true}});
   await db.product.deleteMany({where:{createdByUuid:actor.uuid}});
   if(versions.length){
    const s3=require('@aws-sdk/client-s3');const client=new s3.S3Client({endpoint:web.S3_ENDPOINT,region:web.S3_REGION??'eu-central-1',forcePathStyle:true,credentials:{accessKeyId:web.S3_APP_ACCESS_KEY,secretAccessKey:web.S3_APP_SECRET_KEY}});
    try{for(const version of versions)await client.send(new s3.DeleteObjectCommand({Bucket:web.S3_BUCKET,Key:version.seaweedUuid}));}finally{client.destroy();}
   }
   await db.fileVersion.deleteMany({where:{createdByUuid:actor.uuid}});await db.file.deleteMany({where:{createdByUuid:actor.uuid}});
   await db.user.delete({where:{uuid:actor.uuid}});
  }
  await api('DELETE',`/admin/realms/${realm}/users/${userId}`);
 }
 if(secondUserId){const actor=await db.user.findUnique({where:{keycloakUuid:secondUserId},select:{uuid:true}});if(actor)await db.user.delete({where:{uuid:actor.uuid}});await api('DELETE',`/admin/realms/${realm}/users/${secondUserId}`);}
 await db.$disconnect();console.log('Disposable browser users, products and images removed.');
}
