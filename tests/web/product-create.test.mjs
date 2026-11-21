import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { productCreateSchema } from '../../apps/web/src/schemas/product.ts';

const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const sharp=require('sharp');
const state=globalThis.__productCreateTest={};
registerHooks({resolve(specifier,context,nextResolve){
  if(context.parentURL?.endsWith('/server/create-product.ts')){
    if(specifier==='./database.ts')return {url:'data:text/javascript,export const getDatabase=()=>globalThis.__productCreateTest.database;',shortCircuit:true};
    if(specifier==='./files.ts')return {url:'data:text/javascript,export const getFileStore=()=>globalThis.__productCreateTest.storage;',shortCircuit:true};
  }
  return nextResolve(specifier,context);
}});
const {createProduct,normalizeProductImage}=await import('../../apps/web/src/server/create-product.ts');
const actor='019a75c0-0000-7000-8000-000000000002';
const productId='019a75c0-0000-7000-8000-000000000003';
const fileId='019a75c0-0000-7000-8000-000000000004';
const objectId='019a75c0-0000-7000-8000-000000000005';
const input={code:'prd-test',name:'Fixture',description:'',price:'12,3456',currency:'pln',status:'active'};

function fixture({duplicate=false,storageFailure=false,ambiguousCommit=false,committed=false,catalogOnly=false}={}){
 const events=[];
 const transaction={
  $queryRaw:async()=>[{uuid:objectId}],
  file:{create:async args=>{events.push(['file',args.data]);return {uuid:fileId};}},
  product:{create:async args=>{if(duplicate)throw Object.assign(new Error('unique'),{code:'P2002'});events.push(['product',args.data]);return {uuid:productId};}},
 };
 state.database={
  $transaction:async callback=>{try{const result=await callback(transaction);if(ambiguousCommit)throw new Error('lost commit');events.push(['commit']);return result;}catch(error){events.push(['rollback']);throw error;}},
  fileVersion:{findUnique:async()=>catalogOnly?{uuid:fileId}:null},
  product:{findUnique:async()=>committed?{uuid:productId}:null},
 };
 state.storage={put:async(key,body)=>{events.push(['put',key,body]);if(storageFailure)throw new Error('storage');},remove:async key=>events.push(['remove',key])};
 return events;
}

test('product creation validates code, exact nonnegative money and currency before writes',async()=>{
 const events=fixture();
 for(const change of [{code:'../bad'},{price:'-1'},{price:'1.12345'},{currency:'BAD'},{name:' '}])assert.equal((await createProduct({...input,...change},actor)).status,'invalid');
 assert.equal(productCreateSchema.parse(input).price,'12.3456');
 assert.deepEqual(events,[]);
});

test('a product without an image writes only its catalog row and derives audit fields from the verified actor',async()=>{
 const events=fixture();
 assert.deepEqual(await createProduct(input,actor),{status:'ok',uuid:productId});
 const data=events.find(([kind])=>kind==='product')[1];
 assert.equal(data.code,'PRD-TEST');assert.equal(data.price,'12.3456');assert.equal(data.currency,'PLN');
 assert.equal(data.createdByUuid,actor);assert.equal(data.updatedByUuid,actor);assert.equal(data.imageFileUuid,undefined);
 assert.deepEqual(events.map(([kind])=>kind),['product','commit']);
});

test('image creation stores normalized WebP and links the audited file/version in the same transaction',async()=>{
 const events=fixture();const png=await sharp({create:{width:32,height:20,channels:4,background:'#ab4466'}}).png().toBuffer();
 assert.equal((await createProduct(input,actor,png)).status,'ok');
 const file=events.find(([kind])=>kind==='file')[1];const product=events.find(([kind])=>kind==='product')[1];const put=events.find(([kind])=>kind==='put');
 assert.equal(file.name,'PRD-TEST.webp');assert.equal(file.versions.create.version,1);assert.equal(file.versions.create.seaweedUuid,objectId);
 assert.equal(product.imageFileUuid,fileId);assert.equal(put[1],objectId);
 assert.equal((await sharp(put[2]).metadata()).format,'webp');
});

test('image validation rejects disguised SVG and corrupt files and duplicate codes never upload an object',async()=>{
 const png=await sharp({create:{width:2,height:2,channels:4,background:'#fff'}}).png().toBuffer();
 for(const bytes of [Buffer.from('<svg/>'),Buffer.from('not an image')])await assert.rejects(normalizeProductImage(bytes));
 const events=fixture({duplicate:true});assert.equal((await createProduct(input,actor,png)).status,'duplicate');
 assert.equal(events.some(([kind])=>kind==='put'),false);
});

test('partial image writes are cleaned up but a committed product is preserved after a lost response',async()=>{
 const png=await sharp({create:{width:2,height:2,channels:4,background:'#fff'}}).png().toBuffer();
 const failed=fixture({storageFailure:true});assert.equal((await createProduct(input,actor,png)).status,'failed');
 assert.ok(failed.some(([kind,key])=>kind==='remove'&&key===objectId));
 const committed=fixture({ambiguousCommit:true,committed:true});assert.equal((await createProduct(input,actor,png)).status,'ok');
 assert.equal(committed.some(([kind])=>kind==='remove'),false);
});

test('ambiguous create followed by product deletion preserves the committed catalog object', async () => {
 const png=await sharp({create:{width:2,height:2,channels:4,background:'#fff'}}).png().toBuffer();
 const events=fixture({ambiguousCommit:true,catalogOnly:true});
 assert.equal((await createProduct(input,actor,png)).status,'failed');
 assert.equal(events.some(([kind])=>kind==='remove'),false);
});
