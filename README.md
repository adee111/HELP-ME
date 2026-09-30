# Help.me — MVP local com Stripe Checkout

Aplicação local funcional para validar cadastro de clientes/profissionais, ofertas, disponibilidade, solicitação de limpeza, aceite/recusa/cancelamento e checkout de teste. Não está publicado nem conectado a uma conta Stripe real. Nenhum commit ou push foi realizado.

## Executar no seu PC

Instale Node.js 24 LTS. Na pasta extraída:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Abra http://localhost:5173. Para build: `npm run build`. Para executar o build: configure `APP_URL=http://localhost:3001` no `.env` e rode `npm start`; abra http://localhost:3001.

Os pacotes foram instalados e fixados no package.json/package-lock.json nesta sessão. O ZIP contém código e lockfile; não inclui node_modules, credenciais ou banco de dados. `npm ci` reproduz a instalação no seu computador.

## Testar a jornada

1. Cadastre profissional (senha de pelo menos 12 caracteres).
2. Configure serviço/preço/duração e intervalo de disponibilidade que comporte a duração.
3. Em um terminal local, aprove o profissional:
   `npm run approve -- profissional@exemplo.com`
4. Saia da conta e cadastre cliente. Escolha oferta, endereço e horário dentro da disponibilidade.
5. Entre como profissional e aceite o pedido.
6. Entre como cliente para acompanhar e pagar em modo de teste, após configurar Stripe.

Cada conta usa um papel neste MVP. Aprovação somente pelo comando local administrativo. Cadastro local com scrypt e cookie HttpOnly, sem confirmação de email, recuperação de senha ou Google OAuth. Não há contas ou senhas predefinidas.

## Conectar SUA conta Stripe (teste)

Não envie chaves secretas por mensagem. Configure-as apenas no arquivo `.env` local, ignorado pelo Git:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

1. No painel Stripe, obtenha a chave secreta do ambiente de teste.
2. Instale a Stripe CLI conforme https://docs.stripe.com/cli/install e execute:

```powershell
stripe login
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

3. Copie o segredo `whsec_...` exibido pelo listener para `.env` e reinicie o servidor.
4. Faça um agendamento aceito e clique em Pagar no Stripe (teste).
5. Use cartão de teste 4242 4242 4242 4242, validade futura e CVC fictício. Nunca use cartão real nesse teste.
6. Retorne à plataforma e atualize os agendamentos. Somente webhook assinado com pagamento confirmado marca pedido como pago. O retorno do checkout não confirma pagamento.

SDK Stripe no servidor, sem chave secreta no React. Checkout hospedado não exige @stripe/react-stripe-js nem captura dados de cartão dentro da plataforma. Preço em centavos vem da reserva no banco; sessão idempotente por agendamento; eventos idempotentes por ID; verificação de valor/moeda/bookingId e modo teste.

Não foram criados recursos na sua conta Stripe: falta conexão autenticada e credenciais. Os testes automáticos usam SDK para assinar payloads sintéticos e simulam criação de checkout. Teste real na sua conta permanece pendente.

## Pagamentos e intermediação

Esta versão implementa pagamento único por serviço para a conta da plataforma em modo de teste. Não implementa assinatura SaaS, comissão ou repasse para profissionais. Não confundir recebimento pela plataforma com marketplace completo.

Para operar a Help.me como intermediária, a próxima etapa é Stripe Connect: onboarding de cada profissional, conta conectada, comissão definida por você, repasses, reembolsos, disputas e conciliação. Nada de assumir taxa de 30%. Pagamentos reais têm tarifas; a versão bloqueia chaves live deliberadamente até concluir esse fluxo.

## Arquitetura desta entrega

React + TypeScript + Vite → Express/Node → SQLite persistente + Stripe.

SQLite via node:sqlite, sem driver adicional, exige Node 24. Escolhido para teste imediato sem credenciais externas. Isto substitui temporariamente a proposta Supabase/Google OAuth: migração para PostgreSQL/Supabase e adaptação da autenticação não foram feitas. O backend precisa de hospedagem Node com disco persistente; Cloudflare Pages sozinho não executa esta aplicação. Não usar banco SQLite em disco efêmero/serverless.

## Segurança e limites conhecidos

- Origin obrigatório para mutações; cookie de sessão HttpOnly/SameSite, expira em 24h; limite de tentativas de login/cadastro.
- Senhas com scrypt/salt, tokens aleatórios guardados por hash, SQL parametrizado, autorização por participante.
- Endereço privado: profissional somente após aceite/conclusão. Dados ficam no banco local e precisam de política de retenção antes de publicação.
- Reserva e conflito de intervalo em transação SQLite; aplicação de instância única. Não escalar múltiplos processos antes de migrar banco/locks.
- Pedidos pendentes não expiram automaticamente nesta versão; profissional precisa recusar ou cliente cancelar.
- Checkout aberto impede cancelamento; sessão expira em 30 min, mas retry após expiração e reembolso ainda não implementados. Não iniciar checkout se não pretende terminar o teste; recuperação exige suporte administrativo.
- Sem painel administrativo, edição de cadastro, auditoria completa de eventos, notificações, avaliações, termos finais ou exclusão de conta.
- Interface assume piloto em Maravilha; validação de cobertura geográfica ainda precisa ser implementada antes de expandir.
- Validação visual no navegador não realizada nesta sessão. Build e integração de API foram verificados.

## Testes executados

`npm run build`: TypeScript + bundle aprovados.
`npm test`: 2 testes de integração aprovados, cobrindo cadastro, aprovação, conflito de horários, idempotência, proteção de endereço/pedidos, checkout e webhook com assinatura inválida/válida/repetida. Criação de sessão Stripe simulada; nenhum pagamento externo.
`npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades encontradas nas dependências de produção na data da entrega.

## Estrutura

- src/main.tsx e style.css: interface responsiva.
- server/app.js: autenticação, catálogo, ofertas, reservas e pagamentos.
- server/index.js: inicialização.
- scripts/approve.js: aprovação administrativa local.
- tests/flow.test.js: testes de integração.
- .env.example: configuração sem segredo.
- package.json e package-lock.json: instalação reproduzível.

Fonte Stripe: https://docs.stripe.com/webhooks e https://docs.stripe.com/connect.
