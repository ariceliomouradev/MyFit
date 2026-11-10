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
];
