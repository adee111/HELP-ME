# Help.me — MVP local com Stripe Checkout

Aplicação local funcional para validar cadastro de clientes/profissionais, ofertas, disponibilidade, solicitação de limpeza, aceite/recusa/cancelamento e checkout de teste. Não está publicado nem conectado a uma conta Stripe real. O MVP foi enviado à branch main do repositório adee111/HELP-ME.

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

O site publicado usa Supabase Auth, PostgreSQL e Edge Functions. O servidor Node/SQLite permanece como alternativa local para desenvolvimento e testes sem credenciais. Node 24 é necessário somente nessa alternativa. Configure as variáveis VITE_SUPABASE_* para usar o backend hospedado.

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

## Conta Stripe autenticada nesta sessão

Autorização verificada em sandbox HELP-ME. Esta autorização da CLI é temporária e não constitui credencial permanente do servidor publicado. Não foi habilitado modo live.

Links de demonstração foram criados no sandbox para os valores de referência R$180/R$260 e disponibilizados na prévia visual. Não geram agendamento e não atualizam seu status de pagamento; não substituem o fluxo autenticado de Checkout + webhook do backend. IDs e links públicos de teste estão em stripe-sandbox-links.json.

O backend de agendamentos está publicado no Supabase. Para pagamentos vinculados aos pedidos, configure HELPME_STRIPE_SECRET_KEY e HELPME_STRIPE_WEBHOOK_SECRET nos segredos das Edge Functions e registre o endpoint helpme-stripe-webhook no Stripe. Somente chaves de teste são aceitas. Split para profissionais permanece pendente.

## Dashboard do prestador

Profissionais autenticados abrem automaticamente o painel. A prévia demonstrativa está disponível em `?painel=demo`; é separada dos registros reais, usa fixtures identificadas e não persiste alterações. A rota demonstrativa não fornece autorização e nenhuma API permite acessar registros privados sem sessão.

Visão geral com KPIs, calendário mensal e serviços por dia, próximas solicitações, detalhes e aceite/recusa/conclusão, histórico com busca/filtro/CSV, pagamentos por serviço e configuração de oferta/disponibilidade. Datas da agenda em America/Sao_Paulo.

Cobranças confirmadas são valores brutos pagos pelos clientes, não repasses ao profissional. Repasses reais são mostrados como não disponíveis enquanto Stripe Connect não for integrado. Fixtures de repasses são apenas ilustrações, sem estabelecer comissão comercial. A seleção de mês organiza os serviços por data do serviço; o indicador de repasses usa data do recebimento.

## Área do cliente e chat

A home agora oferece busca por nome/serviço, filtro e ordenação por preço; cadastro com nome/email/telefone/senha; entrada na conta; solicitação em horários livres; acompanhamento dos pedidos; cancelamento conforme regras existentes e acesso ao checkout configurado.

Cliente autenticado pode buscar horários disponíveis nos próximos 60 dias. O servidor filtra reservas sobrepostas; criação revalida disponibilidade atomicamente. A lista limita-se a 200 horários por oferta.

Chat bilateral vinculado a cada agendamento, disponível desde a solicitação. Clientes e profissionais acessam pelo painel de mensagens. Mensagens salvas em SQLite, limite de 2000 caracteres, atualização por polling a cada 4 segundos, leitura incremental em lotes de 100 e reenvio idempotente. Participantes definidos pelo banco; não aceitar sender_id do navegador. Terceiros recebem 404, visitantes 401. React exibe mensagens como texto, sem HTML interpretado. Sem anexos, notificações push ou indicador de leitura nesta versão.

O histórico permanece consultável após conclusão/cancelamento; a política de retenção/exclusão ainda precisa ser definida antes do lançamento público. Não enviar dados de cartão ou senhas pelo chat.

Prévia: `?cliente=demo` abre painel com fixtures; `?cadastro=cliente` abre a tela de cadastro. O site usa Supabase para cadastro real e chat persistente. As rotas de demonstração mantêm mensagens somente na memória, com identificação de dados fictícios.


### Administração

A prévia `/?admin=demo` usa dados fictícios e alterações temporárias. Na alternativa local SQLite, cadastre uma conta e execute `npm run grant-admin -- email-da-conta`. No Supabase, use o procedimento de operador documentado abaixo, após login e criação do perfil. Nenhum cadastro público pode atribuir esse privilégio. Contas administrativas devem ser gerenciadas pelo operador do servidor.

Clientes não precisam de aprovação administrativa: novos cadastros e clientes pendentes são liberados automaticamente após a autenticação exigida. Somente prestadores passam pela fila de aprovação. O painel permite bloquear ou reativar clientes e revisar prestadores (aprovar, recusar, suspender ou devolver à fila), exige justificativa e registra a decisão com autor e data. Contas recusadas ou suspensas não podem realizar novas operações. A suspensão não cancela agendamentos nem estorna pagamentos.

O financeiro lista pagamentos brutos confirmados pelo webhook assinado e idempotente em modo de teste. Comissões, tarifas Stripe, estornos e repasses ainda não são sincronizados. Pagamentos antigos sem registro no novo livro de movimentações não possuem data de recebimento atribuída. Não há confirmação manual de pagamento. O painel não expõe o conteúdo das conversas privadas.

O frontend hospedado se conecta ao Supabase Auth e às funções helpme-api e helpme-stripe-webhook. A autenticação exige confirmação de email conforme as configurações atuais do projeto.


### Backend Supabase publicado

Projeto: `ghtjngkdqfgpzklzcxxi` (São Paulo). Os dados novos ficam no schema privado `helpme`, separado da implementação Readdy anterior. As tabelas antigas e suas funções foram preservadas; usuários e registros SQLite não são automaticamente importados.

- `src/lib/backend.ts`: Supabase Auth e adaptador das telas existentes.
- `supabase/functions/helpme-api/index.ts`: verifica token via `getUser`, perfil, aprovação, participação no agendamento e permissões administrativas. Usa chave de serviço somente dentro da função. Operações privadas nunca confiam em metadata de privilégios do usuário.
- `supabase/migrations/`: tabelas e procedimentos transacionais. RPCs são SECURITY INVOKER, executáveis apenas por service_role. RLS, isolamento do schema e revogação de acesso direto dos navegadores são aplicados.
- `supabase/tests/backend.sql`: teste transacional com rollback, incluindo permissões efetivas de service_role, conflito de reserva, privacidade do chat e idempotência financeira. Não deixa usuários ou pagamentos de teste salvos.

Para desenvolvimento, preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em `.env.local`. Use somente a chave publicável; nunca uma chave secreta no bundle. Rode `npm run build`. Sem essas variáveis, a alternativa Node/SQLite continua disponível.

**Primeiro administrador:** faça cadastro, confirme email e entre no site uma vez para criar o perfil. O operador autorizado do projeto executa no SQL Editor, substituindo o email explicitamente:

```sql
begin;
insert into helpme.admins(user_id)
select id from helpme.profiles where email = 'SEU_EMAIL_CONFIRMADO'
on conflict do nothing;
update helpme.profiles set account_status = 'approved'
where email = 'SEU_EMAIL_CONFIRMADO'
  and exists(select 1 from helpme.admins a where a.user_id = helpme.profiles.id);
commit;
```

**Emails:** cadastros estão habilitados, mas o projeto exige confirmação de email. Configure SMTP próprio no Supabase Auth para enviar a clientes externos à equipe e inclua a URL publicada em Site URL/Redirect URLs. A entrega de emails e redirecionamentos precisam ser validados com uma conta real do operador; não foram enviados emails a terceiros durante a integração.

**Stripe:** checkout de teste e webhook estão implementados; a função responde explicitamente 503 enquanto os segredos específicos HELPME_* não estiverem configurados. Segredos de outras funções antigas não são reutilizados automaticamente.

**Auditoria do projeto anterior:** o Security Advisor sinaliza funções SECURITY DEFINER antigas (`public.is_admin`, `public.enforce_profile_role`) acessíveis pelas roles de navegador e proteção contra senhas vazadas desabilitada. As novas funções não usam SECURITY DEFINER. Revise as dependências da implementação antiga antes de restringir suas funções.

### Busca simplificada

A descoberta de serviços oferece categorias Todos/Limpeza/Babás, pesquisa por nome ou serviço sem distinção de acentos, filtros opcionais por tipo, valor máximo e duração, e ordenação por preço/nome. Os resultados usam somente ofertas reais de contas aprovadas; `?cliente=demo` continua explicitamente demonstrativo. O catálogo inclui Babá com referência de R$120/4h; profissionais definem preços e durações nas suas próprias ofertas. Não há ofertas de babás reais inseridas automaticamente.


### Stripe Connect: cobrança direta, Help.me 15%

A cobrança é criada na conta conectada do prestador (`stripeAccount`) com taxa `application_fee_amount` de 15%, arredondada em centavos. O valor total nunca é cobrado na conta Stripe da plataforma. Não há `transfer_data` nem repasse manual do valor total. O prestador recebe 85% antes das tarifas de processamento, que são de responsabilidade dele. Depósitos bancários seguem os prazos e requisitos do Stripe.

As contas usam Accounts v2, painel Stripe completo, tarifas cobradas pelo Stripe do prestador e responsabilidade por saldos negativos atribuída ao Stripe. O prestador passa pelo onboarding hospedado no Stripe na seção Pagamentos do seu painel. Pendências e ajustes de cadastro ficam disponíveis pela retomada desse onboarding e pelo dashboard Stripe. Para o onboarding com componentes incorporados em uma evolução futura, incluir `notification_banner`.

**Ativação pendente:** a conexão do plugin fornece acesso apenas ao sandbox. Ela não fornece uma chave permanente às funções do Supabase. Configure, em Edge Functions > Secrets, `HELPME_STRIPE_SECRET_KEY` (preferir chave restrita de teste com permissões necessárias de Connect, Accounts, Account Links, Checkout e PaymentIntents) e `HELPME_STRIPE_WEBHOOK_SECRET`. A conta da plataforma precisa ser brasileira para coletar comissões de prestadores brasileiros; o backend verifica isso. Esta versão bloqueia chaves live.

Registre webhook de eventos das contas conectadas para `checkout.session.completed` e `checkout.session.async_payment_succeeded` em `https://ghtjngkdqfgpzklzcxxi.supabase.co/functions/v1/helpme-stripe-webhook`. O webhook verifica assinatura, conta conectada, referência da reserva, moeda, valor e taxa de 15% na PaymentIntent. Eventos sem conta Connect são recusados. Não substitua por um endpoint de eventos apenas da plataforma.

`helpme.payment_ledger.platform_fee_amount` registra a comissão associada à cobrança confirmada; não é confirmação de depósito bancário. `provider_gross_amount` são os 85% antes das tarifas Stripe. Os saldos bancários, tarifas efetivas e estornos devem ser conciliados com Stripe; não são inferidos automaticamente.

A alternativa local SQLite não cria mais Checkout: retorna 503 e não permite que pagamentos caiam integralmente na plataforma. Use o backend Supabase conectado para testar este fluxo. Links de teste antigos em `stripe-sandbox-links.json` são referências históricas sem split; não representam este fluxo e não são usados pela interface.

## Qualidade de código

Execute `npm run lint` para analisar frontend, backend Node e Edge Functions do Supabase. Use `npm run lint:fix` para aplicar correções automáticas. A configuração está em `eslint.config.js`, com regras para JavaScript, TypeScript e React Hooks.

O TypeScript está fixado na série 6.0, compatível com typescript-eslint. Antes de enviar alterações, execute também `npm run build` e `npm test`.

## Perfil dos prestadores e avaliações

O cadastro do prestador inclui apresentação, habilidades e referências profissionais. Esses campos podem ser editados em Serviços e horários → Meu perfil público. O perfil público de prestadores aprovados está disponível na busca, com média de estrelas, total de avaliações e comentários. Prestadores sem avaliações não recebem nota artificial.

Somente o cliente vinculado a um serviço concluído pode publicar uma avaliação de 1 a 5 estrelas e um comentário de 3 a 1000 caracteres, uma vez por agendamento. O primeiro nome do cliente aparece no comentário; email, telefone e endereço não são expostos. Contas bloqueadas não podem publicar.

A Edge Function `helpme-reputation` é dedicada a perfis e avaliações. As leituras públicas são limitadas a ofertas e perfis aprovados; todas as operações privadas validam o token com `auth.getUser` e as permissões no banco. A API principal e os pagamentos não foram alterados. Testes de regressão: `tests/reputation.test.js` e `supabase/tests/reputation.sql`.

## Fotos, valores por hora e cadastro de serviços

O prestador pode escolher uma foto JPEG, PNG ou WebP de até 5 MB no cadastro e no editor do perfil. A imagem é reduzida no navegador a um avatar JPEG e persistida junto ao perfil; sem foto, aparece a inicial do nome.

Os preços de ofertas e os filtros representam R$/hora. O cliente escolhe de 0,5 a 12 horas; o servidor valida a disponibilidade e calcula o total em centavos, armazenando o valor/hora e as horas contratadas no agendamento. Agendamentos anteriores conservam o total original. Não há medição automática de ponto: a cobrança corresponde às horas escolhidas e confirmadas no pedido.

A rota POST /offers usa helpme-api; somente GET /offers usa helpme-reputation. Testes de regressão: tests/hourly-routes.test.js e supabase/tests/hourly.sql.

## Checkout do cliente — setembro de 2026

Na área do cliente, **Agendamentos → Pagar serviço** abre a revisão com prestador, duração, tarifa por hora e total reservado. O checkout é permitido para serviços aceitos e concluídos, exclusivamente pelo cliente do pedido. Os dados do cartão são preenchidos na página hospedada do Stripe. A aplicação valida o domínio antes de redirecionar.

A rota `/checkout` usa a Edge Function dedicada `helpme-checkout`. Sessões abertas são reutilizadas; sessões expiradas ou com pagamento assíncrono comprovadamente falho podem ser recriadas com nova chave de idempotência. Tokens de bloqueio impedem criação simultânea e desbloqueio por tentativas antigas. O prazo da sessão é o padrão do Stripe (24 horas); os parâmetros da tentativa são estáveis para retries. A cobrança direta mantém a taxa Help.me existente de 15%.

O retorno do Stripe abre os agendamentos e consulta o status por até um minuto. O retorno nunca marca o serviço como pago: a confirmação continua sendo feita pelo webhook assinado existente e pela verificação da cobrança na conta conectada.

**Situação operacional:** backend e interface publicados, mas cobrança externa ainda pendente de configuração. O servidor exige `HELPME_STRIPE_SECRET_KEY` de teste, `HELPME_STRIPE_WEBHOOK_SECRET` e conta de plataforma brasileira (`HELPME_STRIPE_PLATFORM_ACCOUNT_ID`). O prestador precisa concluir seu cadastro Stripe Connect. O endpoint obrigatório de eventos das contas conectadas é `https://ghtjngkdqfgpzklzcxxi.supabase.co/functions/v1/helpme-stripe-webhook`, com `checkout.session.completed` e `checkout.session.async_payment_succeeded`. Não inserir segredos no frontend ou no GitHub. Esta implementação mantém o bloqueio de chaves live; ativar cobranças reais exige configurar e validar o ambiente de produção separadamente.

Validação: `npm run lint`, `npm test` (17 testes), `npm run build` e `supabase/tests/checkout.sql` executado no Supabase com rollback. O teste transacional cobre total reservado, cliente proprietário, bloqueio do administrador, concorrência, retry, confirmação idempotente e restrição das RPCs financeiras ao servidor. Nenhuma cobrança externa foi executada.
