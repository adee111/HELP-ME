/** Only public, read-only requests may be retried; mutations are sent once. */
export async function catalogRequest(send:()=>Promise<Response>,route:string,method:string,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){
 const retryable=method==='GET'&&['/offers','/services','/config'].includes(route.split('?')[0]);
 for(let attempt=0;;attempt++){
  try{const response=await send();if(!retryable||response.status<500||attempt===2)return response;await response.body?.cancel();}
  catch(error){if(!retryable||attempt===2)throw error;}
  await wait(400*(attempt+1));
 }
}
export async function loadCatalog(read:(path:string)=>Promise<unknown>,receive:(path:string,data:unknown)=>void){
 const paths=['/services','/offers','/config'];
 const results=await Promise.allSettled(paths.map(async path=>{const data=await read(path);receive(path,data)}));
 const failed=paths.filter((_,index)=>results[index].status==='rejected');
 return failed.includes('/offers')?'Não foi possível carregar as ofertas. Tente novamente.':failed.length?'Não foi possível carregar todos os dados. Tente novamente.':'';
}
