import {DatabaseSync} from 'node:sqlite';
const email=process.argv[2];if(!email)throw new Error('Use npm run approve -- email@exemplo.com');
const db=new DatabaseSync(process.env.DATABASE_PATH||'data/helpme.sqlite');
const result=db.prepare("UPDATE users SET approved=1 WHERE email=? AND role='professional'").run(email.toLowerCase());
console.log(result.changes?'Profissional aprovado.':'Profissional não encontrado.');db.close();
