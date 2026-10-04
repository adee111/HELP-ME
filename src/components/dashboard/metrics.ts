export type MetricRow={start:number;status:string;payment:string;price:number};
const dates=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
export const metricDay=(timestamp:number)=>dates.format(timestamp);
export function monthSeries(month:string,entries:{timestamp:number;value:number}[]){
 const [year,number]=month.split('-').map(Number),days=new Date(Date.UTC(year,number,0)).getUTCDate();
 const buckets=Array.from({length:Math.ceil(days/7)},(_,i)=>({label:`${i*7+1}–${Math.min(days,(i+1)*7)}`,value:0}));
 for(const entry of entries){const day=metricDay(entry.timestamp);if(day.startsWith(month)&&Number.isFinite(entry.value))buckets[Math.floor((Number(day.slice(-2))-1)/7)].value+=entry.value;}
 return buckets;
}
export function statusSummary(rows:MetricRow[],month:string){
 const selected=rows.filter(row=>metricDay(row.start).startsWith(month));
 return [{key:'requested',label:'Solicitados',color:'#D99A24'},{key:'accepted',label:'Confirmados',color:'#3979D3'},{key:'completed',label:'Realizados',color:'#15966F'},{key:'cancelled',label:'Cancelados / recusados',color:'#AF6472'}].map(item=>({...item,value:selected.filter(row=>item.key==='cancelled'?['cancelled','rejected'].includes(row.status):row.status===item.key).length}));
}
