import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {rateLimit} from 'express-rate-limit';
import Stripe from 'stripe';
import {z} from 'zod';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

export function createApp({dbPath=process.env.DATABASE_PATH||'data/helpme.sqlite',stripeClient,webhookSecret=process.env.STRIPE_WEBHOOK_SECRET,appUrl=process.env.APP_URL||'http://localhost:5173'}={}){
 if(dbPath!==':memory:')mkdirSync(dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,phone TEXT,password TEXT,role TEXT,approved INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
 CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY,name TEXT,price INTEGER,duration INTEGER);
 CREATE TABLE IF NOT EXISTS offers(professional_id TEXT REFERENCES users(id),service_id TEXT REFERENCES services(id),price INTEGER,duration INTEGER,PRIMARY KEY(professional_id,service_id));
 CREATE TABLE IF NOT EXISTS slots(id TEXT PRIMARY KEY,professional_id TEXT REFERENCES users(id),start INTEGER,end INTEGER);
 CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,customer_id TEXT REFERENCES users(id),professional_id TEXT REFERENCES users(id),service_id TEXT REFERENCES services(id),address TEXT,start INTEGER,end INTEGER,price INTEGER,status TEXT DEFAULT 'requested',payment TEXT DEFAULT 'unpaid',request_key TEXT,session_id TEXT UNIQUE,checkout_url TEXT,UNIQUE(customer_id,request_key));
 CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,booking_id TEXT NOT NULL REFERENCES bookings(id),sender_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),created_at INTEGER NOT NULL,client_message_id TEXT NOT NULL,UNIQUE(sender_id,client_message_id));
 CREATE TABLE IF NOT EXISTS admins(user_id TEXT PRIMARY KEY REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS account_reviews(user_id TEXT PRIMARY KEY REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','suspended')));
 CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES users(id),target_id TEXT REFERENCES users(id),action TEXT,previous_status TEXT,status TEXT,note TEXT,created_at INTEGER);
 CREATE TABLE IF NOT EXISTS payment_ledger(session_id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),event_id TEXT,amount INTEGER,currency TEXT,confirmed_at INTEGER,test_mode INTEGER);
 CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);
 CREATE INDEX IF NOT EXISTS idx_messages_booking_seq ON messages(booking_id,seq);
 `);
 for(const s of [['residential','Limpeza residencial',18000,240],['deep','Limpeza pesada',26000,360],['babysitting','Babá',12000,240]])db.prepare('INSERT OR IGNORE INTO services VALUES(?,?,?,?)').run(...s);
 const key=process.env.STRIPE_SECRET_KEY;
 if(key && ! /^(sk|rk)_test_/.test(key))throw new Error('Esta versão aceita somente Stripe em modo de teste.');
 const stripe=stripeClient||(key?new Stripe(key):null);
 const checkoutLocks=new Set();
 const app=express();app.disable('x-powered-by');app.use(helmet());
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}};
 const fail=(code,message)=>{const e=new Error(message);e.status=code;throw e};
 const accountStatus=u=>db.prepare('SELECT status FROM account_reviews WHERE user_id=?').get(u.id)?.status||(u.approved?'approved':'pending');
 const isAdmin=u=>!!db.prepare('SELECT user_id FROM admins WHERE user_id=?').get(u.id);
 const cleanUser=u=>({id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role,approved:!!u.approved,accountStatus:accountStatus(u),isAdmin:isAdmin(u)});
 const tokenHash=t=>createHash('sha256').update(t).digest('hex');
 app.post('/api/stripe/webhook',express.raw({type:'application/json',limit:'128kb'}),(req,res,next)=>{
  if(!stripe||!webhookSecret)return res.status(503).json({error:'Webhook Stripe não configurado.'});
  let event;try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],webhookSecret)}catch{return res.status(400).json({error:'Assinatura inválida.'})}
  try{tx(()=>{
   if(db.prepare('SELECT id FROM stripe_events WHERE id=?').get(event.id))return;
   if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
    const session=event.data.object;
    const b=db.prepare('SELECT * FROM bookings WHERE session_id=?').get(session.id);
    if(!b)fail(409,'Sessão ainda não registrada; tentar novamente.');
    if(session.payment_status==='paid'){
     if(session.currency!=='brl'||session.amount_total!==b.price||session.metadata?.bookingId!==b.id||session.livemode)fail(400,'Pagamento incompatível.');
     db.prepare("UPDATE bookings SET payment='paid' WHERE id=?").run(b.id);
     db.prepare('INSERT OR IGNORE INTO payment_ledger VALUES(?,?,?,?,?,?,?)').run(session.id,b.id,event.id,b.price,'brl',Date.now(),1);
    }
   }
   db.prepare('INSERT INTO stripe_events VALUES(?)').run(event.id);
  });res.json({received:true})}catch(e){next(e)}
 });
 app.use(express.json({limit:'16kb'}));app.use(cookieParser());
 app.use('/api',(req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==new URL(appUrl).origin)return res.status(403).json({error:'Origem não autorizada.'});next();
 });
 app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:50,standardHeaders:'draft-8',legacyHeaders:false}));
 const auth=(req,res,next)=>{
  const t=req.cookies.helpme_session;
  req.user=t?db.prepare('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(tokenHash(t),Date.now()):null;
  if(!req.user)return res.status(401).json({error:'Entre na sua conta.'});if(!['GET','HEAD'].includes(req.method)&&!req.path.endsWith('/auth/logout')&&['rejected','suspended'].includes(accountStatus(req.user)))return res.status(403).json({error:'Sua conta está bloqueada para novas operações.'});next();
 };
 const login=(res,u)=>{const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),u.id,Date.now()+86400000);res.cookie('helpme_session',token,{httpOnly:true,sameSite:'strict',secure:new URL(appUrl).protocol==='https:',maxAge:86400000});res.json({user:cleanUser(u)})};
 const registration=z.object({name:z.string().trim().min(2).max(100),email:z.email().max(254).transform(x=>x.toLowerCase()),phone:z.string().regex(/^\+?[0-9 ()-]{10,20}$/),password:z.string().min(12).max(128),role:z.enum(['customer','professional'])});
 app.post('/api/auth/register',(req,res,next)=>{try{const v=registration.parse(req.body);if(db.prepare('SELECT id FROM users WHERE email=?').get(v.email))fail(409,'Email já cadastrado.');const salt=randomBytes(16).toString('hex');const hash=scryptSync(v.password,salt,64).toString('hex');const id=randomUUID();db.prepare('INSERT INTO users(id,name,email,phone,password,role) VALUES(?,?,?,?,?,?)').run(id,v.name,v.email,v.phone,`${salt}:${hash}`,v.role);login(res,db.prepare('SELECT * FROM users WHERE id=?').get(id))}catch(e){next(e)}});
 app.post('/api/auth/login',(req,res,next)=>{try{const v=z.object({email:z.email(),password:z.string().max(128)}).parse(req.body);const u=db.prepare('SELECT * FROM users WHERE email=?').get(v.email.toLowerCase());const [salt,hash]=(u?.password||`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');if(!timingSafeEqual(scryptSync(v.password,salt,64),Buffer.from(hash,'hex'))||!u)fail(401,'Email ou senha incorretos.');login(res,u)}catch(e){next(e)}});
 app.get('/api/me',auth,(req,res)=>res.json({user:cleanUser(req.user)}));
 app.post('/api/auth/logout',auth,(req,res)=>{db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(req.cookies.helpme_session));res.clearCookie('helpme_session');res.json({ok:true})});
 const admin=(req,res,next)=>{if(!isAdmin(req.user))return res.status(403).json({error:'Acesso exclusivo para administradores.'});if(accountStatus(req.user)!=='approved')return res.status(403).json({error:'Conta administrativa inativa.'});next()};
 app.get('/api/admin',auth,admin,(req,res)=>{
 const users=db.prepare('SELECT id,name,email,phone,role,approved FROM users ORDER BY name').all().map(u=>({...cleanUser(u),accountStatus:accountStatus(u)}));
 const bookings=db.prepare('SELECT b.id,b.start,b.end,b.price,b.status,b.payment,s.name service_name,c.name customer_name,p.name professional_name FROM bookings b JOIN services s ON s.id=b.service_id JOIN users c ON c.id=b.customer_id JOIN users p ON p.id=b.professional_id ORDER BY b.start DESC').all();
 const payments=db.prepare('SELECT l.*,c.name customer_name,p.name professional_name,s.name service_name FROM payment_ledger l JOIN bookings b ON b.id=l.booking_id JOIN users c ON c.id=b.customer_id JOIN users p ON p.id=b.professional_id JOIN services s ON s.id=b.service_id ORDER BY l.confirmed_at DESC').all();
 const audit=db.prepare('SELECT a.*,u.name actor_name,t.name target_name FROM admin_audit a JOIN users u ON u.id=a.actor_id JOIN users t ON t.id=a.target_id ORDER BY a.created_at DESC LIMIT 200').all();
 res.json({users,bookings,payments,audit,services:db.prepare('SELECT s.*,COUNT(o.professional_id) offer_count FROM services s LEFT JOIN offers o ON o.service_id=s.id GROUP BY s.id').all(),messageCount:db.prepare('SELECT COUNT(*) n FROM messages').get().n,stripeConfigured:false,testMode:true});
 });
 app.post('/api/admin/users/:id/review',auth,admin,(req,res,next)=>{try{
 const v=z.object({status:z.enum(['approved','rejected','suspended','pending']),note:z.string().trim().min(2).max(500)}).parse(req.body);
 tx(()=>{const target=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(!target)fail(404,'Conta não encontrada.');if(isAdmin(target))fail(409,'Contas administrativas são gerenciadas pelo operador do servidor.');const previous=accountStatus(target);if(previous===v.status)fail(409,'A conta já possui esse status.');db.prepare('INSERT INTO account_reviews VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status').run(target.id,v.status);db.prepare('UPDATE users SET approved=? WHERE id=?').run(v.status==='approved'?1:0,target.id);db.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),req.user.id,target.id,'account_review',previous,v.status,v.note,Date.now());});res.json({ok:true});
 }catch(e){next(e)}});
 app.get('/api/config',(req,res)=>res.json({stripeConfigured:false,testMode:true}));
 app.get('/api/services',(req,res)=>res.json(db.prepare('SELECT * FROM services').all()));
 app.get('/api/professionals',(req,res)=>res.json(db.prepare("SELECT id,name FROM users WHERE role='professional' AND approved=1").all()));
 app.get('/api/offers',(req,res)=>res.json(db.prepare('SELECT o.*,u.name professional_name,s.name service_name FROM offers o JOIN users u ON u.id=o.professional_id JOIN services s ON s.id=o.service_id WHERE u.approved=1').all()));
 app.get('/api/professionals/:id/availability',auth,(req,res,next)=>{try{
 const offer=db.prepare('SELECT o.* FROM offers o JOIN users u ON u.id=o.professional_id WHERE o.professional_id=? AND o.service_id=? AND u.approved=1').get(req.params.id,String(req.query.serviceId||''));if(!offer)fail(404,'Oferta não encontrada.');
 const now=Date.now(),horizon=now+60*86400000;
 const slots=db.prepare('SELECT start,end FROM slots WHERE professional_id=? AND end>? AND start<? ORDER BY start LIMIT 200').all(req.params.id,now,horizon);
 const occupied=db.prepare("SELECT start,end FROM bookings WHERE professional_id=? AND status IN ('requested','accepted') AND end>? AND start<?").all(req.params.id,now,horizon);
 const times=new Set();for(const slot of slots){const begin=Math.ceil(Math.max(slot.start,now+60000)/1800000)*1800000;for(let t=begin;t+offer.duration*60000<=Math.min(slot.end,horizon)&&times.size<200;t+=1800000){if(!occupied.some(b=>b.start<t+offer.duration*60000&&b.end>t))times.add(t)}}
 res.json([...times].sort((a,b)=>a-b).map(start=>({start,end:start+offer.duration*60000})))
 }catch(e){next(e)}});
 const participant=(req)=>{const booking=db.prepare('SELECT id,customer_id,professional_id FROM bookings WHERE id=?').get(req.params.id);if(!booking||![booking.customer_id,booking.professional_id].includes(req.user.id))fail(404,'Conversa não encontrada.');return booking};
 const chatLimit=rateLimit({windowMs:60000,limit:30,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false});
 app.get('/api/bookings/:id/messages',auth,(req,res,next)=>{try{participant(req);const after=z.coerce.number().int().nonnegative().parse(req.query.after||0);res.json(db.prepare('SELECT seq,id,booking_id,sender_id,body,created_at FROM messages WHERE booking_id=? AND seq>? ORDER BY seq LIMIT 100').all(req.params.id,after))}catch(e){next(e)}});
 app.post('/api/bookings/:id/messages',auth,chatLimit,(req,res,next)=>{try{participant(req);const v=z.object({body:z.string().trim().min(1).max(2000),clientMessageId:z.uuid()}).parse(req.body);const existing=db.prepare('SELECT seq,id,booking_id,sender_id,body,created_at FROM messages WHERE sender_id=? AND client_message_id=?').get(req.user.id,v.clientMessageId);if(existing){if(existing.booking_id!==req.params.id||existing.body!==v.body)fail(409,'Identificador já utilizado em outra mensagem.');return res.json(existing)}
 const id=randomUUID(),created=Date.now();db.prepare('INSERT INTO messages(id,booking_id,sender_id,body,created_at,client_message_id) VALUES(?,?,?,?,?,?)').run(id,req.params.id,req.user.id,v.body,created,v.clientMessageId);res.status(201).json(db.prepare('SELECT seq,id,booking_id,sender_id,body,created_at FROM messages WHERE id=?').get(id));
 }catch(e){next(e)}});
 app.post('/api/offers',auth,(req,res,next)=>{try{if(req.user.role!=='professional')fail(403,'Somente profissionais.');const v=z.object({serviceId:z.string(),price:z.number().int().min(100).max(1000000),duration:z.number().int().min(30).max(720)}).parse(req.body);if(!db.prepare('SELECT id FROM services WHERE id=?').get(v.serviceId))fail(400,'Serviço inválido.');db.prepare('INSERT INTO offers VALUES(?,?,?,?) ON CONFLICT(professional_id,service_id) DO UPDATE SET price=excluded.price,duration=excluded.duration').run(req.user.id,v.serviceId,v.price,v.duration);res.json({ok:true})}catch(e){next(e)}});
 app.post('/api/slots',auth,(req,res,next)=>{try{if(req.user.role!=='professional')fail(403,'Somente profissionais.');const v=z.object({start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true})}).parse(req.body);const start=Date.parse(v.start),end=Date.parse(v.end);if(start<=Date.now()||end<=start||end-start>86400000)fail(400,'Intervalo inválido.');db.prepare('INSERT INTO slots VALUES(?,?,?,?)').run(randomUUID(),req.user.id,start,end);res.json({ok:true})}catch(e){next(e)}});
 app.get('/api/bookings',auth,(req,res)=>res.json(db.prepare(`SELECT b.*,s.name service_name,u.name professional_name,c.name customer_name FROM bookings b JOIN services s ON s.id=b.service_id JOIN users u ON u.id=b.professional_id JOIN users c ON c.id=b.customer_id WHERE b.customer_id=? OR b.professional_id=? ORDER BY b.start DESC`).all(req.user.id,req.user.id).map(b=>({...b,address:req.user.id===b.customer_id||['accepted','completed'].includes(b.status)?b.address:null}))));
 app.post('/api/bookings',auth,(req,res,next)=>{try{if(req.user.role!=='customer')fail(403,'Somente clientes.');if(!req.user.approved)fail(403,'Aguarde a aprovação da sua conta pelo administrador.');const v=z.object({professionalId:z.uuid(),serviceId:z.string(),start:z.iso.datetime({offset:true}),address:z.string().trim().min(10).max(500),requestKey:z.uuid()}).parse(req.body);const b=tx(()=>{
 const old=db.prepare('SELECT * FROM bookings WHERE customer_id=? AND request_key=?').get(req.user.id,v.requestKey);if(old)return old;
 const o=db.prepare('SELECT o.* FROM offers o JOIN users u ON u.id=o.professional_id WHERE professional_id=? AND service_id=? AND u.approved=1').get(v.professionalId,v.serviceId);if(!o)fail(400,'Oferta indisponível.');const start=Date.parse(v.start),end=start+o.duration*60000;if(start<=Date.now())fail(400,'Escolha um horário futuro.');
 if(!db.prepare('SELECT id FROM slots WHERE professional_id=? AND start<=? AND end>=?').get(v.professionalId,start,end))fail(409,'Horário fora da disponibilidade.');
 if(db.prepare("SELECT id FROM bookings WHERE professional_id=? AND status IN ('requested','accepted') AND start<? AND end>?").get(v.professionalId,end,start))fail(409,'Horário já reservado.');
 const id=randomUUID();db.prepare('INSERT INTO bookings(id,customer_id,professional_id,service_id,address,start,end,price,request_key) VALUES(?,?,?,?,?,?,?,?,?)').run(id,req.user.id,v.professionalId,v.serviceId,v.address,start,end,o.price,v.requestKey);return db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
 });res.status(201).json(b)}catch(e){next(e)}});
 app.post('/api/bookings/:id/status',auth,(req,res,next)=>{try{const {status}=z.object({status:z.enum(['accepted','rejected','cancelled','completed'])}).parse(req.body);tx(()=>{const b=db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);if(!b||![b.customer_id,b.professional_id].includes(req.user.id))fail(404,'Pedido não encontrado.');if(checkoutLocks.has(b.id))fail(409,'Checkout em criação; tente novamente.');if(status==='cancelled'){if(!['requested','accepted'].includes(b.status)||b.start<=Date.now()||b.payment==='paid'||b.session_id)fail(409,'Cancelamento indisponível: pedido iniciado ou checkout aberto.')}else{if(req.user.id!==b.professional_id)fail(403,'Somente profissional designado.');if(['accepted','rejected'].includes(status)&&(b.status!=='requested'||b.start<=Date.now()))fail(409,'Transição inválida.');if(status==='completed'&&(b.status!=='accepted'||b.end>Date.now()))fail(409,'Serviço ainda não finalizado.')}db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,b.id)});res.json({ok:true})}catch(e){next(e)}});
 app.post('/api/checkout',auth,(req,res)=>res.status(503).json({error:'Pagamentos disponíveis somente no backend Supabase com Stripe Connect e cobrança direta.'}));
 app.use(express.static(resolve('dist')));
 app.use((err,req,res,_next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:'Confira os campos informados.',fields:err.issues.map(x=>x.path.join('.'))});res.status(err.status||500).json({error:err.status?err.message:'Não foi possível concluir. Tente novamente.'})});
 return {app,db};
}
