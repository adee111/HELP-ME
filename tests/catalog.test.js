import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogRequest,loadCatalog} from '../src/lib/catalog.ts';
const noWait=async()=>{};
test('public catalog reads recover from temporary server or network errors',async()=>{
 let calls=0;const r=await catalogRequest(async()=>++calls===1?new Response('{}',{status:500}):new Response('[]'),'/offers','GET',noWait);assert.equal(r.status,200);assert.equal(calls,2);
 calls=0;await catalogRequest(async()=>{if(++calls===1)throw new Error('network');return new Response('[]')},'/services','GET',noWait);assert.equal(calls,2);
});
test('retry is bounded and does not repeat writes or authorization failures',async()=>{
 for(const [path,method,status,expected] of [['/offers','GET',503,3],['/offers','POST',500,1],['/checkout','POST',500,1],['/offers','GET',401,1]]){let calls=0;await catalogRequest(async()=>{calls++;return new Response('{}',{status})},path,method,noWait);assert.equal(calls,expected)}
});
test('a failed config does not discard successfully loaded offers; retry clears the error',async()=>{
 const data={};const error=await loadCatalog(async path=>{if(path==='/config')throw new Error('temporary');return [{id:'offer'}]},(path,value)=>data[path]=value);
 assert.equal(data['/offers'].length,1);assert.match(error,/todos os dados/);
 assert.equal(await loadCatalog(async()=>[],()=>{}),'');
 assert.match(await loadCatalog(async path=>{if(path==='/offers')throw new Error('offline');return []},()=>{}),/ofertas/);
});
