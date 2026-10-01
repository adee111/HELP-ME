import {test} from 'node:test';
import assert from 'node:assert/strict';
import {endpointFor,hourlyTotal} from '../src/lib/routes.ts';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
test('cadastro de ofertas usa API principal; consultas e perfis usam reputação',()=>{assert.equal(endpointFor('/offers','POST'),'helpme-api');assert.equal(endpointFor('/offers','GET'),'helpme-reputation');assert.equal(endpointFor('/provider-profile?professionalId=123','GET'),'helpme-reputation');assert.equal(endpointFor('/checkout','POST'),'helpme-checkout');assert.equal(hourlyTotal(4500,240),18000);assert.equal(hourlyTotal(4500,90),6750)});
test('valor por hora é calculado no servidor e foto é persistida no perfil',async()=>{
 const {app,db}=createApp({dbPath:':memory:'});try{
 const c=request.agent(app),p=request.agent(app);const post=(a,path,b)=>a.post('/api'+path).set('Origin','http://localhost:5173').send(b);
 const reg=async(a,role,email)=>(await post(a,'/auth/register',{role,email,name:'Teste hora',phone:'49999999999',password:'senha-forte-12345'})).body.user;
 await reg(c,'customer','hour-client@example.com');const provider=await reg(p,'professional','hour-provider@example.com');db.prepare('UPDATE users SET approved=1 WHERE id=?').run(provider.id);
 assert.equal((await post(p,'/offers',{serviceId:'residential',price:4500,duration:240})).status,200);
 const start=Date.now()+86400000;assert.equal((await post(p,'/slots',{start:new Date(start).toISOString(),end:new Date(start+8*3600000).toISOString()})).status,200);
 const booking=await post(c,'/bookings',{professionalId:provider.id,serviceId:'residential',start:new Date(start).toISOString(),duration:90,address:'Rua de Teste, 100',requestKey:randomUUID(),price:1});assert.equal(booking.status,201);assert.equal(booking.body.price,6750);assert.equal(booking.body.end-booking.body.start,5400000);
 assert.equal((await post(p,'/provider-profile/me',{bio:'Experiência em limpeza',skills:'Organização',references:'',photo_url:'data:image/svg+xml;base64,AAAA'})).status,400);
 const photo='data:image/jpeg;base64,/9j/2Q==';assert.equal((await post(p,'/provider-profile/me',{bio:'Experiência em limpeza',skills:'Organização',references:'',photo_url:photo})).status,200);
 assert.equal((await request(app).get('/api/provider-profile').query({professionalId:provider.id})).body.photo_url,photo);
 }finally{db.close()}
});
