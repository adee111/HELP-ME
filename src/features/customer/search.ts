export type SearchOffer={professional_name:string;service_name:string;service_id:string;price:number;duration:number};
export const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function categoryOf(id:string,name=''){const value=normalize(id+' '+name);if(/babysitting|baba|infantil/.test(value))return 'childcare';if(/residential|deep|limpeza/.test(value))return 'cleaning';return 'other'}
export function filterOffers<T extends SearchOffer>(offers:T[],filters:{query:string;category:string;service:string;maxPrice:string;duration:string;sort:string}):T[]{
 const terms=normalize(filters.query).split(/\s+/).filter(Boolean);
 return offers.filter(o=>{const cat=categoryOf(o.service_id,o.service_name);const text=normalize(o.professional_name+' '+o.service_name+(cat==='childcare'?' baba babas cuidado infantil':'')+(cat==='cleaning'?' limpeza limpezas':''));return(filters.category==='all'||cat===filters.category)&&(filters.service==='all'||o.service_id===filters.service)&&(filters.maxPrice==='all'||o.price<=Number(filters.maxPrice)*100)&&(filters.duration==='all'||o.duration<=Number(filters.duration)*60)&&terms.every(t=>text.includes(t))}).sort((a,b)=>filters.sort==='price'?a.price-b.price:filters.sort==='priceDesc'?b.price-a.price:a.professional_name.localeCompare(b.professional_name,'pt-BR'));
}
