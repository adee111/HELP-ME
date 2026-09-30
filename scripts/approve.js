import {DatabaseSync} from 'node:sqlite';
const email=process.argv[2];if(!email)throw new Error('Use npm run approve -- email@exemplo.com');
const db=new DatabaseSync(process.env.DATABASE_PATH||'data/helpme.sqlite');
try{const user=db.prepare("SELECT id FROM users WHERE email=? AND role='professional'").get(email.toLowerCase());if(!user)throw new Error('Profissional não encontrado.');db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE users SET approved=1 WHERE id=?').run(user.id);db.prepare("INSERT INTO account_reviews VALUES(?,'approved') ON CONFLICT(user_id) DO UPDATE SET status='approved'").run(user.id);db.exec('COMMIT');console.log('Profissional aprovado pelo operador do servidor.')}finally{db.close()}
