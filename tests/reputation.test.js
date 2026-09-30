import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
test('perfil público e avaliação somente pelo cliente de um serviço concluído',async()=>{
 const {app,db}=createApp({dbPath:':memory:'});try{
 const client=request.agent(app),provider=request.agent(app),other=request.agent(app);
 const post=(a,p,b)=>a.post('/api'+p).set('Origin','http://localhost:5173').send(b);
 const register=async(a,role,email)=>(await post(a,'/auth/register',{role,email,name:'Conta de teste',phone:'49999999999',password:'senha-forte-12345',bio:'Experiência em limpeza residencial.',skills:'Organização e pontualidade',references:'Experiência em residências.'})).body.user;
 const c=await register(client,'customer','client-review@example.com'),p=await register(provider,'professional','provider-review@example.com');await register(other,'customer','other-review@example.com');
 assert.equal((await request(app).get('/api/provider-profile').query({professionalId:p.id})).status,404);
 db.prepare('UPDATE users SET approved=1 WHERE id=?').run(p.id);
 const profile=await request(app).get('/api/provider-profile').query({professionalId:p.id});assert.equal(profile.status,200);assert.equal(profile.body.skills,'Organização e pontualidade');assert.equal(profile.body.review_count,0);assert.equal('email' in profile.body,false);
 assert.equal((await post(client,'/provider-profile/me',{bio:'Outra apresentação',skills:'Teste'})).status,403);
 const id=randomUUID();db.prepare('INSERT INTO bookings(id,customer_id,professional_id,service_id,start,end,price,status) VALUES(?,?,?,?,?,?,?,?)').run(id,c.id,p.id,'residential',1,2,18000,'accepted');
 const review={bookingId:id,rating:5,comment:'Excelente qualidade e pontualidade.'};
 assert.equal((await post(other,'/reviews',review)).status,404);assert.equal((await post(provider,'/reviews',review)).status,403);assert.equal((await post(client,'/reviews',review)).status,409);
 db.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(id);
 assert.equal((await post(client,'/reviews',{...review,rating:6})).status,400);assert.equal((await post(client,'/reviews',review)).status,200);assert.equal((await post(client,'/reviews',review)).status,409);
 const rated=await request(app).get('/api/provider-profile').query({professionalId:p.id});assert.equal(rated.body.rating_average,5);assert.equal(rated.body.review_count,1);assert.equal(rated.body.reviews[0].comment,review.comment);
 assert.equal((await client.get('/api/reviews/mine')).body[0].booking_id,id);
 }finally{db.close()}
});
