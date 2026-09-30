import {DatabaseSync} from 'node:sqlite';
const email=process.argv[2]?.trim().toLowerCase();
if(!email)throw new Error('Uso: npm run grant-admin -- email-de-uma-conta-existente');
const db=new DatabaseSync(process.env.DATABASE_PATH||'data/helpme.sqlite');
try{const u=db.prepare('SELECT id FROM users WHERE email=?').get(email);if(!u)throw new Error('Cadastre a conta e inicie o servidor antes de conceder acesso.');db.exec('BEGIN IMMEDIATE');db.prepare('INSERT OR IGNORE INTO admins VALUES(?)').run(u.id);db.prepare("UPDATE users SET approved=1,role='admin' WHERE id=?").run(u.id);db.prepare("INSERT INTO account_reviews VALUES(?,'approved') ON CONFLICT(user_id) DO UPDATE SET status='approved'").run(u.id);db.exec('COMMIT');console.log('Acesso administrativo concedido à conta existente.')}finally{db.close()}
