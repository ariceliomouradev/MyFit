<?php
declare(strict_types=1);
header_remove('X-Powered-By');
if (!is_file(__DIR__ . '/config.php')) {
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    exit('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Em configuração</title><body style="font:16px system-ui;background:#101418;color:#e8e6e1;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center"><p>Este aplicativo ainda não foi configurado.<br><small style="color:#9aa3ad">Crie o arquivo config.php (veja INSTALACAO.md).</small></p>');
}
$v = static fn(string $f): int => (int) @filemtime(__DIR__ . '/' . $f);
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob: https://static.exercisedb.dev; object-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
header('Cache-Control: no-cache');
?><!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Meus Treinos</title>
<meta name="description" content="Seu diário de treino: rotinas, cargas, recordes e evolução. Por Aricelio Moura.">
<meta name="theme-color" content="#101418">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Meus Treinos">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/svg+xml" href="assets/img/logo-icone.svg">
<link rel="apple-touch-icon" href="assets/img/icon-180.png">
<link rel="preload" href="assets/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/app.css?v=<?= $v('assets/css/app.css') ?>">
<link rel="stylesheet" href="assets/css/v3.css?v=<?= $v('assets/css/v3.css') ?>">
</head>
<body>
<div id="app"><p class="boot">Carregando…</p></div>
<noscript><p class="boot">O Meus Treinos precisa de JavaScript para funcionar.</p></noscript>
<script src="assets/js/app.js?v=<?= $v('assets/js/app.js') ?>" defer></script>
<script src="assets/js/perfil.js?v=<?= $v('assets/js/perfil.js') ?>" defer></script>
<script src="assets/js/gestao.js?v=<?= $v('assets/js/gestao.js') ?>" defer></script>
<script src="assets/js/marca.js?v=<?= $v('assets/js/marca.js') ?>" defer></script>
<script src="assets/js/financeiro.js?v=<?= $v('assets/js/financeiro.js') ?>" defer></script>
</body>
</html>
