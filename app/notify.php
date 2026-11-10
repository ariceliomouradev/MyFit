<?php
declare(strict_types=1);

/* =====================================================================
 *  Envio de mensagens (WhatsApp e e-mail) e chamadas HTTP de saída.
 *
 *  WhatsApp: o app NÃO inventa um canal; ele usa o que você configurar em config.php ('whatsapp'):
 *    ['driver' => 'meta',    'phone_id' => '...', 'token' => '...', 'template' => 'redefinir_senha', 'lang' => 'pt_BR']   (API oficial da Meta)
 *    ['driver' => 'webhook', 'url' => 'https://...', 'secret' => '...']   (Z-API, Evolution, n8n... recebe {"to","text"})
 *  Sem nada configurado, ou se o envio falhar, o app tenta o e-mail; se o e-mail também falhar, a mensagem vai para a
 *  "Fila de envio" do administrador, que manda com um toque pelo próprio WhatsApp.
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

function send_whatsapp(string $digits, string $text): bool
{
    $c = cfg('whatsapp');
    if (!is_array($c) || empty($c['driver'])) return false;
    $to = '55' . $digits;
    if ($c['driver'] === 'meta' && !empty($c['phone_id']) && !empty($c['token'])) {
        $msg = !empty($c['template'])
            ? ['messaging_product' => 'whatsapp', 'to' => $to, 'type' => 'template', 'template' => ['name' => $c['template'], 'language' => ['code' => $c['lang'] ?? 'pt_BR'], 'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $text]]]]]]
            : ['messaging_product' => 'whatsapp', 'to' => $to, 'type' => 'text', 'text' => ['body' => $text]];
        [$st] = http_json('POST', 'https://graph.facebook.com/v20.0/' . rawurlencode((string) $c['phone_id']) . '/messages', ['Authorization: Bearer ' . $c['token']], $msg);
        return $st >= 200 && $st < 300;
    }
    if ($c['driver'] === 'webhook' && !empty($c['url'])) {
        [$st] = http_json('POST', (string) $c['url'], !empty($c['secret']) ? ['Authorization: Bearer ' . $c['secret']] : [], ['to' => $to, 'text' => $text]);
        return $st >= 200 && $st < 300;
    }
    return false;
}

function send_email(string $to, string $subject, string $text): bool
{
    if (!empty($GLOBALS['MAIL_STUB'])) return ($GLOBALS['MAIL_STUB'])($to, $subject, $text);
    if (cfg('mail_enabled', true) === false || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $from = (string) cfg('mail_from', '');
    if ($from === '' && ($h = parse_url(app_url(), PHP_URL_HOST))) $from = 'nao-responda@' . preg_replace('/^www\./', '', (string) $h);
    if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) return false;
    $headers = ['From: ' . brand_effective(null)['app_name'] . ' <' . $from . '>', 'Content-Type: text/plain; charset=UTF-8', 'X-Mailer: MeusTreinos'];
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, implode("\r\n", $headers));
}

/**
 * Entrega uma mensagem a uma pessoa: WhatsApp, depois e-mail, depois fila do administrador.
 * Devolve o canal usado: 'whatsapp' | 'email' | 'manual'.
 */
function deliver_message(array $user, string $subject, string $text, string $kind = 'reset', bool $emailOnly = false): string
{
    if (!$emailOnly && !empty($user['whatsapp']) && send_whatsapp((string) $user['whatsapp'], $text)) return 'whatsapp';
    if (!empty($user['email']) && send_email((string) $user['email'], $subject, $text)) return 'email';
    Db::run('INSERT INTO outbox (company_id,user_id,kind,whatsapp,email,body,created_at) VALUES (?,?,?,?,?,?,?)',
        [$user['company_id'] ?? null, $user['id'], $kind, $user['whatsapp'] ?? null, $user['email'] ?? null, $text, now()]);
    return 'manual';
}
