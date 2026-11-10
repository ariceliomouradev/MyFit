<?php
declare(strict_types=1);

/* =====================================================================
 *  Envio de e-mail e chamadas HTTP de saída.
 *
 *  E-mail: o jeito CONFIÁVEL é SMTP com uma caixa de e-mail de verdade (config.php, 'smtp'): o remetente é a própria
 *  caixa, então SPF e DKIM do seu domínio valem e a mensagem chega. Sem 'smtp', o app tenta o mail() da hospedagem,
 *  que muitas vezes é aceito mas nunca entregue (por isso o SMTP é recomendado).
 *  Se o envio falhar, o link vai para a "Fila de envio" do administrador (copiar o link e mandar como quiser).
 * ===================================================================== */

/** Endereço público do app (sem barra no fim). Em produção defina 'app_url' no config.php: é o que vai nos links enviados. */
function app_url(): string
{
    $u = trim((string) cfg('app_url', ''));
    if ($u !== '') return rtrim($u, '/');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    // Sem app_url só aceitamos o endereço local (o cabeçalho Host pode ser falsificado e o link seria enviado à vítima).
    if (preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host)) return 'http://' . $host;
    return '';
}

/**
 * Chamada HTTP com JSON. Devolve [status, json|null, texto]. Status 0 = falha de rede.
 * Em testes, defina $GLOBALS['HTTP_STUB'] = fn($method,$url,$headers,$body) => [status, json, text].
 */
function http_json(string $method, string $url, array $headers = [], ?array $body = null, int $timeout = 15): array
{
    if (!empty($GLOBALS['HTTP_STUB'])) return ($GLOBALS['HTTP_STUB'])($method, $url, $headers, $body);
    if (!function_exists('curl_init')) return [0, null, 'curl indisponível'];
    $h = array_merge(['Accept: application/json'], $headers);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS]);
    if ($body !== null) { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
    $text = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($text === false) return [0, null, 'falha de rede'];
    $json = json_decode((string) $text, true);
    return [$status, is_array($json) ? $json : null, (string) $text];
}

/* ---------- SMTP (sem biblioteca) ---------- */
/** Configuração do SMTP: ['host','port'(465),'secure'('ssl'|'tls'|'none'),'user','pass','from']. null = não configurado. */
function smtp_cfg(): ?array
{
    $c = cfg('smtp');
    if (!is_array($c) || empty($c['host']) || empty($c['from']) || !filter_var((string) $c['from'], FILTER_VALIDATE_EMAIL)) return null;
    return ['host' => (string) $c['host'], 'port' => (int) ($c['port'] ?? 465), 'secure' => in_array($c['secure'] ?? 'ssl', ['ssl', 'tls', 'none'], true) ? ($c['secure'] ?? 'ssl') : 'ssl',
            'user' => (string) ($c['user'] ?? $c['from']), 'pass' => (string) ($c['pass'] ?? ''), 'from' => (string) $c['from']];
}

/** Envia uma mensagem de texto por SMTP. Em caso de falha devolve false e um motivo SEM dados secretos em $err. */
function smtp_send(array $c, string $to, string $subject, string $text, string $fromName, ?string &$err = null): bool
{
    $err = null;
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $fp = @stream_socket_client(($c['secure'] === 'ssl' ? 'ssl://' : 'tcp://') . $c['host'] . ':' . $c['port'], $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) { $err = 'não consegui conectar em ' . $c['host'] . ':' . $c['port'] . ($errstr ? ' (' . $errstr . ')' : ''); return false; }
    stream_set_timeout($fp, 12);
    $read = static function () use ($fp): string {
        $resp = '';
        while (($l = fgets($fp, 2048)) !== false) { $resp .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; }
        return $resp;
    };
    $step = static function (string $label, ?string $line, array $ok) use ($fp, $read, &$err): bool {
        if ($line !== null) fwrite($fp, $line . "\r\n");
        $r = $read();
        if (!in_array((int) substr($r, 0, 3), $ok, true)) { $why = trim((string) preg_replace('/\s+/', ' ', $r)); $err = $label . ($why !== '' ? ' → ' . $why : ' → sem resposta do servidor'); return false; }
        return true;
    };
    try {
        $heloHost = preg_replace('/[^a-z0-9.-]/i', '', (string) (parse_url(app_url(), PHP_URL_HOST) ?: 'localhost')) ?: 'localhost';
        if (!$step('o servidor não respondeu ao conectar', null, [220])) return false;
        if (!$step('EHLO recusado', 'EHLO ' . $heloHost, [250])) return false;
        if ($c['secure'] === 'tls') {
            if (!$step('STARTTLS recusado', 'STARTTLS', [220])) return false;
            if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { $err = 'falha ao iniciar a conexão segura (TLS)'; return false; }
            if (!$step('EHLO recusado', 'EHLO ' . $heloHost, [250])) return false;
        }
        if ($c['pass'] !== '') { // autenticação (o usuário e a senha nunca entram nas mensagens de erro)
            if (!$step('autenticação não suportada', 'AUTH LOGIN', [334])) return false;
            if (!$step('usuário recusado', base64_encode($c['user']), [334])) return false;
            if (!$step('autenticação recusada (usuário ou senha da caixa de e-mail errados)', base64_encode($c['pass']), [235])) return false;
        }
        if (!$step('remetente recusado', 'MAIL FROM:<' . $c['from'] . '>', [250])) return false;
        if (!$step('destinatário recusado', 'RCPT TO:<' . $to . '>', [250, 251])) return false;
        if (!$step('DATA recusado', 'DATA', [354])) return false;
        $encName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $msg = 'From: ' . $encName . ' <' . $c['from'] . ">\r\nTo: <" . $to . ">\r\nSubject: =?UTF-8?B?" . base64_encode(preg_replace('/[\r\n]+/', ' ', $subject)) . "?=\r\n"
            . 'Date: ' . date('r') . "\r\nMessage-ID: <" . bin2hex(random_bytes(12)) . '@' . $heloHost . ">\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($text), 76, "\r\n");
        fwrite($fp, $msg . ".\r\n");
        if (!$step('mensagem recusada', null, [250])) return false;
        fwrite($fp, "QUIT\r\n");
        return true;
    } finally {
        @fclose($fp);
    }
}

/** Último motivo de falha do envio (sem dados secretos), para o botão "e-mail de teste". */
function mail_last_error(?string $set = null): ?string { static $e = null; if ($set !== null) $e = $set; return $e; }

function send_email(string $to, string $subject, string $text): bool
{
    mail_last_error('');
    if (!empty($GLOBALS['MAIL_STUB'])) return ($GLOBALS['MAIL_STUB'])($to, $subject, $text);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) { mail_last_error('e-mail do destinatário inválido'); return false; }
    $name = (string) brand_effective(null)['app_name'];
    if ($smtp = smtp_cfg()) {
        $ok = smtp_send($smtp, $to, $subject, $text, $name, $err);
        if (!$ok) { mail_last_error((string) $err); error_log('[meus-treinos] SMTP: ' . $err); }
        return $ok;
    }
    if (cfg('mail_enabled', true) === false) { mail_last_error('envio de e-mail desligado no config.php'); return false; }
    // Sem SMTP: mail() da hospedagem (pode ser aceito e nunca entregue; configure o 'smtp' para garantir).
    $from = (string) cfg('mail_from', '');
    if ($from === '' && ($h = parse_url(app_url(), PHP_URL_HOST))) $from = 'nao-responda@' . preg_replace('/^www\./', '', (string) $h);
    if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) { mail_last_error('sem remetente: configure o smtp ou mail_from no config.php'); return false; }
    $headers = ['From: =?UTF-8?B?' . base64_encode($name) . '?= <' . $from . '>', 'Content-Type: text/plain; charset=UTF-8', 'X-Mailer: MeusTreinos'];
    $ok = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, implode("\r\n", $headers));
    if (!$ok) mail_last_error('o mail() da hospedagem recusou o envio');
    return $ok;
}

/**
 * Entrega uma mensagem por e-mail. Se falhar, coloca na fila do administrador.
 * Devolve o canal usado: 'email' | 'manual'.
 */
function deliver_message(array $user, string $subject, string $text, string $kind = 'reset'): string
{
    if (!empty($user['email']) && send_email((string) $user['email'], $subject, $text)) return 'email';
    Db::run('INSERT INTO outbox (company_id,user_id,kind,whatsapp,email,body,created_at) VALUES (?,?,?,?,?,?,?)',
        [$user['company_id'] ?? null, $user['id'], $kind, null, $user['email'] ?? null, $text, now()]);
    return 'manual';
}
