export function platformFee(amount:number){if(!Number.isSafeInteger(amount)||amount<100)throw new Error('Valor inválido.');return Math.round(amount*15/100)}
export function directCheckout(booking:{id:string;price:number;service_name:string;connected_account:string},site:string){
 if(!/^acct_[A-Za-z0-9]+$/.test(booking.connected_account))throw new Error('Conta conectada obrigatória.');
 return {params:{integration_identifier:'helpme-direct-pxqzrnva',mode:'payment' as const,line_items:[{price_data:{currency:'brl',unit_amount:booking.price,product_data:{name:booking.service_name}},quantity:1}],payment_intent_data:{application_fee_amount:platformFee(booking.price),metadata:{bookingId:booking.id}},metadata:{bookingId:booking.id},client_reference_id:booking.id,success_url:site+'/?payment=return',cancel_url:site+'/?payment=cancel',expires_at:Math.floor(Date.now()/1000)+1800},options:{stripeAccount:booking.connected_account,idempotencyKey:'helpme-direct-'+booking.id}};
}
