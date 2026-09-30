export interface ProviderBooking {id:string;service_name:string;customer_name:string;professional_name:string;status:string;payment:string;start:number;end?:number;price:number;address:string|null;session_id:string|null;providerPaidCents?:number;providerPaidAt?:number}
export const zone='America/Sao_Paulo';
export const dayKey=(timestamp:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(timestamp);
export const formatMoney=(amount:number)=>(amount/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const formatTime=(timestamp:number)=>new Intl.DateTimeFormat('pt-BR',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(timestamp);
export function monthSummary(rows:ProviderBooking[],month:string){const selected=rows.filter(b=>dayKey(b.start).startsWith(month));return {completed:selected.filter(b=>b.status==='completed').length,upcoming:selected.filter(b=>['requested','accepted'].includes(b.status)).length,charged:selected.filter(b=>b.payment==='paid').reduce((s,b)=>s+b.price,0),pending:selected.filter(b=>['accepted','completed'].includes(b.status)&&b.payment!=='paid').reduce((s,b)=>s+b.price,0),received:rows.filter(b=>b.providerPaidAt!==undefined&&dayKey(b.providerPaidAt).startsWith(month)).reduce((s,b)=>s+(b.providerPaidCents||0),0)}}
export function demoBookings(now=Date.now()):ProviderBooking[]{
 const [year,month]=dayKey(now).split('-').map(Number);const stamp=(day:number,hour=9)=>Date.UTC(year,month-1,day,hour+3);
 return [
  {day:3,status:'completed',payment:'paid',name:'Cliente exemplo A',price:18000,received:15300},
  {day:8,status:'completed',payment:'paid',name:'Cliente exemplo B',price:26000,received:22100},
  {day:12,status:'completed',payment:'unpaid',name:'Cliente exemplo C',price:18000},
  {day:16,status:'completed',payment:'paid',name:'Cliente exemplo D',price:18000,received:15300},
  {day:22,status:'accepted',payment:'paid',name:'Cliente exemplo E',price:26000},
  {day:25,status:'requested',payment:'unpaid',name:'Cliente exemplo F',price:18000},
  {day:28,status:'accepted',payment:'unpaid',name:'Cliente exemplo G',price:18000},
 ].map((b,i)=>({id:'demo-'+i,service_name:b.price===26000?'Limpeza pesada':'Limpeza residencial',customer_name:b.name,professional_name:'Prestador exemplo',status:b.status,payment:b.payment,start:stamp(b.day),end:stamp(b.day,13),price:b.price,address:b.status==='requested'?null:'Endereço demonstrativo · Maravilha/SC',session_id:b.payment==='paid'?'demo-session':null,providerPaidCents:b.received,providerPaidAt:b.received?stamp(b.day+1):undefined}));
}
