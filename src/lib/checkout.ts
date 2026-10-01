export type PayableBooking={status:string;payment:string;price:number};
export function canPay(booking:PayableBooking){return ['accepted','completed'].includes(booking.status)&&booking.payment!=='paid'&&booking.price>0}
export function checkoutUrl(value:unknown){
 if(typeof value!=='string')throw new Error('O checkout não retornou um endereço válido.');
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password)throw new Error('Endereço de pagamento inválido.');
 return url.href;
}
