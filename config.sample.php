<?php
// Copie este arquivo para config.php (na mesma pasta) e preencha. NUNCA envie o config.php para o GitHub.
// No hPanel (Hostinger) o nome do banco e do usuário ganham um prefixo, ex.: u123456789_treinos.
return [
  'db_host'   => 'localhost',              // na Hostinger é localhost
  'db_port'   => null,                     // só preencha se o seu MySQL usar outra porta
  'db_name'   => 'u000000000_treinos',     // nome COMPLETO do banco, com o prefixo
  'db_user'   => 'u000000000_treinos',     // nome COMPLETO do usuário do banco
  'db_pass'   => 'TROQUE-POR-UMA-SENHA-FORTE',
  'timezone'  => 'America/Fortaleza',
  'allow_registration' => true,            // false = ninguém se cadastra sozinho; só entra quem a empresa criar
  'debug'     => false,                    // deixe false em produção

  // Endereço do seu site, SEM barra no fim. É o que vai nos links de redefinição de senha e no aviso do PagBank.
  // Obrigatório em produção (sem ele, "esqueci a senha" não envia nada). Use https.
  'app_url'   => 'https://seudominio.com.br',

  // ---- Pagamentos PIX pelo PagBank (opcional: sem isto o app funciona, só não cobra online) ----
  // env 'sandbox' = testes (dinheiro de mentira) · 'production' = valendo. O token de cada ambiente é diferente.
  // Gere em: sandbox -> https://portaldev.pagbank.com.br (aba Tokens) · produção -> conta PagBank > Vendas > Integrações > Gerar Token
  // 'pagbank' => ['token' => 'COLE-O-TOKEN-AQUI', 'env' => 'sandbox'],   // conta PagBank da PLATAFORMA (mensalidade das empresas e clientes diretos)
  // Cartão na conta da plataforma: 'card' => true (crédito) e 'debit' => true (débito, só se liberado pelo PagBank), dentro do bloco 'pagbank' acima.
  // Cada empresa conecta a PRÓPRIA conta em Financeiro > PagBank (o token dela fica cifrado no banco). A chave de cifra é criada sozinha em storage/app.key;
  // se preferir, defina a sua (base64 de 32 bytes):  php -r "echo base64_encode(random_bytes(32));"
  // 'app_key' => 'COLE-AQUI-32-BYTES-EM-BASE64',

  // ---- E-mail (usado na redefinição de senha) ----
  // RECOMENDADO: SMTP com uma caixa de e-mail de verdade. O remetente é a própria caixa, então SPF/DKIM do seu domínio valem e a mensagem chega.
  // 1) hPanel > E-mails > crie uma caixa, ex.: nao-responda@seudominio.com.br  2) preencha abaixo (descomente) com o endereço e a senha dessa caixa.
  // Hostinger: servidor smtp.hostinger.com, porta 465 com 'secure' => 'ssl' (ou porta 587 com 'secure' => 'tls').
  // 'smtp' => ['host' => 'smtp.hostinger.com', 'port' => 465, 'secure' => 'ssl', 'user' => 'nao-responda@seudominio.com.br', 'pass' => 'SENHA-DA-CAIXA', 'from' => 'nao-responda@seudominio.com.br'],
  // Sem 'smtp', o app tenta o mail() da hospedagem (pode ser aceito e nunca entregue). Para desligar de vez: 'mail_enabled' => false.
  // Se o e-mail falhar, o link vai para a "Fila de envio" do administrador (ele copia o link e manda à pessoa).
];
