# Help.me — APK de teste Android

Este APK instala um lançador Android e abre a Help.me publicada em uma Custom Tab do navegador. Não é uma aplicação nativa completa nem uma cópia offline. A sessão, seleção de fotos, autenticação e checkout permanecem no navegador. Não contém chaves privadas, senhas ou permissões de câmera/localização. Requer Android 6 ou superior, navegador e internet.

## Instalar

1. Baixar `Helpme-teste-android.apk` no celular.
2. Abrir o arquivo. Se o Android solicitar, permitir instalação de aplicativos desta fonte para o navegador ou gerenciador de arquivos usado.
3. Instalar **Help.me Teste** e tocar em **Abrir Help.me**.
4. Entrar com sua conta para testar a plataforma real publicada. Novos cadastros, pedidos e avaliações são operações reais da plataforma. Pagamentos continuam dependentes da configuração do Stripe no servidor.

## Compilar

Requer Java, Android SDK Platform 35 e Build Tools 35.0.0. Executar `bash android-test/build.sh /caminho/do/sdk`. É possível usar `javac` do JDK ou definir `ECJ_JAR` para o compilador Eclipse 3.38.0. A chave de assinatura de teste é criada fora dos arquivos fonte; não enviar para o GitHub. APK assinado apenas para distribuição de teste, fora da Play Store.

Validação do pacote: assinatura APK v1/v2/v3, alinhamento, manifesto, versão mínima e classe de inicialização. A instalação e a navegação em um celular físico devem ser verificadas pelo testador; não foi alegado teste em hardware Android.
