# Configuração e ativação do Stripe Checkout — Help.me

## Valores a substituir

Não há placeholders em `mode`, `success_url`, `cancel_url` ou `line_items` nas chamadas existentes. Mantidos pagamento único, URLs publicadas da Help.me e valores calculados no servidor a partir das horas reservadas. Os itens usam `price_data` real; não é necessário substituir por `price_...`.

## Parâmetros configurados

Arquivo: [supabase/functions/_shared/direct-charge.ts](supabase/functions/_shared/direct-charge.ts), usado pelas chamadas existentes de [helpme-checkout](supabase/functions/helpme-checkout/index.ts) e [helpme-api](supabase/functions/helpme-api/index.ts).

| Parâmetro | Valor |
|---|---|
| ui_mode | hosted_page (SDK 22.6.2) |
| billing_address_collection | auto |
| phone_number_collection.enabled | false |
| automatic_tax.enabled | false |
| allow_promotion_codes | false |
| submit_type | auto |
| integration_identifier | hosted_web_0001 |
| origin_context | web |
| mode | payment |

`payment_method_collection` foi omitido: a regra 8 do arquivo enviado restringe o parâmetro a assinaturas, e os serviços são pagamentos únicos. Removido o parâmetro `locale`, não configurado no arquivo; o Stripe usa o idioma do navegador.

Conforme escolha explícita do usuário, preservados `payment_intent_data.application_fee_amount` (15%), os metadados `bookingId`, `client_reference_id` e as opções Connect/idempotência. Eles mantêm a comissão, a identificação do pedido e a cobrança direta na conta do prestador. Não foram criadas novas rotas nem alteradas autenticação, banco ou interface nesta configuração.

## Ativação pendente

A configuração do Checkout Studio não contém credenciais e não ativa cobranças.

1. Usar uma conta Stripe de plataforma sediada no Brasil e configurar nos segredos das Edge Functions do [Supabase](https://supabase.com/dashboard/project/ghtjngkdqfgpzklzcxxi/functions/secrets):
   - `HELPME_STRIPE_SECRET_KEY`: chave restrita **de teste**, com as permissões necessárias para Accounts, Connect, Checkout e PaymentIntents.
   - `HELPME_STRIPE_PLATFORM_ACCOUNT_ID`: ID da conta brasileira da plataforma.
   - `HELPME_STRIPE_WEBHOOK_SECRET`: segredo de assinatura do endpoint Connect abaixo.
2. Registrar no [Stripe Workbench](https://dashboard.stripe.com/workbench/webhooks) um endpoint de eventos **das contas conectadas** em `https://ghtjngkdqfgpzklzcxxi.supabase.co/functions/v1/helpme-stripe-webhook`, ouvindo `checkout.session.completed` e `checkout.session.async_payment_succeeded`.
3. Cada prestador aprovado deve concluir o cadastro Stripe Connect na seção **Receber pagamentos**. A capacidade de cobrança precisa estar ativa.
4. Testar como cliente: solicitar um serviço, aguardar aceite, abrir **Agendamentos → Pagar serviço**, revisar o total e continuar para o Stripe. Também é permitido pagar após o serviço ser concluído.
5. No modo de teste, usar `4242 4242 4242 4242`, validade futura e CVC fictício. Nunca usar cartão real em teste. Verificar se o webhook marca o pedido como pago, registra o valor e a taxa de 15% uma única vez e impede novo pagamento do mesmo pedido.
6. Testar retorno sem concluir pagamento, autenticação exigida, cliente sem acesso a pedidos alheios e recuperação de sessão expirada. O retorno ao site sozinho não confirma pagamento.

## Produção

O backend atual aceita somente chaves de teste e rejeita pagamentos live. Cobranças reais exigem configurar e validar separadamente o ambiente de produção, seus segredos, webhook, contas habilitadas e regras de confirmação. Não basta trocar a chave por `sk_live_...`.

Nunca colocar segredos no frontend, no GitHub ou em variáveis `VITE_*`. As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são públicas; as variáveis `HELPME_STRIPE_*` são exclusivamente do servidor. O servidor SQLite local usa `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` e não oferece cobrança Connect.

## Estrutura e funcionamento

A única alteração de código desta configuração está no objeto de parâmetros compartilhado das chamadas existentes. Este documento é o único arquivo novo.

Cliente revisa pedido → servidor verifica cliente, total e conta do prestador → Stripe abre checkout hospedado → webhook assinado confirma cobrança → pedido e registro financeiro são atualizados → página de retorno consulta o status.

O total é o valor já reservado no pedido. Alterar a oferta do prestador não altera pedidos anteriores. Produtos, meios de pagamento e dados de recebimento devem ser administrados no Stripe; acompanhamento de pedidos permanece na Help.me.

## Recursos

- [Documentação do Checkout](https://docs.stripe.com/payments/checkout)
- [Suporte Stripe](https://support.stripe.com)
- [Stripe MCP](https://docs.stripe.com/mcp)
