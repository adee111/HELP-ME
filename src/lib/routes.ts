export function endpointFor(route:string,method='GET'){
 const path=route.split('?')[0].replace(/\/$/,'');
 if(path==='/checkout')return 'helpme-checkout';
 return (path==='/offers'&&method==='GET')||['/provider-profile','/provider-profile/me','/reviews','/reviews/mine'].includes(path)?'helpme-reputation':'helpme-api';
}
export function hourlyTotal(rate:number,minutes:number){return Math.round(rate*minutes/60)}
