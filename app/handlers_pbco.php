<?php
declare(strict_types=1);

/* =====================================================================
 *  V3.6 · PagBank por empresa
 *  Cada empresa (academia ou personal solo) conecta a PRÓPRIA conta PagBank e recebe o dinheiro dos alunos nela.
 *  A plataforma só cobra, na conta dela, a mensalidade das empresas e os clientes diretos ("Clientes diretos").
 *  O token da empresa é guardado CIFRADO (AES-256-GCM) e nunca é devolvido ao navegador.
 * ===================================================================== */

/** Chave de cifra do app: 'app_key' no config.php (base64 de 32 bytes) ou, se faltar, um arquivo gerado uma vez em storage/ (bloqueado na web). */
function secret_key(): string
{
    $k = cfg('app_key');
    if (is_string($k) && $k !== '') { $raw = base64_decode($k, true); if ($raw !== false && strlen($raw) === 32) return $raw; }
    $file = APP_ROOT . '/storage/app.key';
    if (is_file($file)) { $raw = base64_decode(trim((string) file_get_contents($file)), true); if ($raw !== false && strlen($raw) === 32) return $raw; }
    $raw = random_bytes(32);
    if (!is_dir(dirname($file))) @mkdir(dirname($file), 0750, true);
    if (@file_put_contents($file, base64_encode($raw), LOCK_EX) === false) throw new RuntimeException('Não consegui gravar a chave de cifra');
    @chmod($file, 0600);
    return $raw;
}

function secret_encrypt(string $plain): string
{
    $iv = random_bytes(12); $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', secret_key(), OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($ct === false) throw new RuntimeException('Falha ao cifrar');
    return 'v1:' . base64_encode($iv . $tag . $ct);
}

function secret_decrypt(string $enc): ?string
{
    if (!str_starts_with($enc, 'v1:')) return null;
    $raw = base64_decode(substr($enc, 3), true);
    if ($raw === false || strlen($raw) < 29) return null;
    try { $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', secret_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16)); } catch (Throwable) { return null; }
    return $plain === false ? null : $plain;
}

/** Conta PagBank da empresa (ou null se não conectou / não foi possível decifrar). */
function pb_company_account(int $cid): ?array
{
    $r = Db::one('SELECT pb_token_enc, pb_env, pb_card, pb_debit FROM companies WHERE id=?', [$cid]);
    if (!$r || empty($r['pb_token_enc'])) return null;
    $token = secret_decrypt((string) $r['pb_token_enc']);
    if ($token === null || $token === '') return null;
    $env = $r['pb_env'] === 'production' ? 'production' : 'sandbox';
    $over = cfg('pagbank'); $base = is_array($over) && !empty($over['base_url']) ? (string) $over['base_url'] : ($env === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com');
    return ['token' => $token, 'env' => $env, 'base' => rtrim($base, '/'), 'owner' => 'empresa', 'card' => !empty($r['pb_card']), 'debit' => !empty($r['pb_debit'])];
}

/**
 * Conta que recebe uma cobrança:
 *  - aluno de academia ou de personal solo  -> conta PagBank da PRÓPRIA empresa;
 *  - aluno da empresa interna "Clientes diretos", mensalidade da empresa e demais cobranças -> conta da plataforma.
 */
function pb_account_for(string $kind, ?int $companyId): ?array
{
    if ($kind === 'aluno' && $companyId && company_kind($companyId) !== 'direta') return pb_company_account($companyId);
    $c = pb_cfg();
    return $c ? $c + ['owner' => 'plataforma'] : null;
}

function pbco_company(array $u): int
{
    require_role($u, 'admin', 'super');
    return (int) company_scope($u, $_GET['company_id'] ?? (body()['company_id'] ?? null));
}

function pbco_status(int $cid): array
{
    $c = Db::one('SELECT kind, pb_token_enc, pb_env, pb_hint, pb_connected_at, pb_card, pb_debit FROM companies WHERE id=?', [$cid]);
    $base = app_url();
    $direct = ($c['kind'] ?? 'empresa') === 'direta';
    $connected = !$direct && !empty($c['pb_token_enc']) && pb_company_account($cid) !== null;
    return ['connected' => $connected, 'env' => $c['pb_env'] ?? 'sandbox', 'hint' => $connected ? $c['pb_hint'] : null, 'connected_at' => $connected ? iso($c['pb_connected_at']) : null,
            'card' => !empty($c['pb_card']), 'debit' => !empty($c['pb_debit']), 'receiver' => $direct ? 'plataforma' : 'empresa', 'broken' => !$direct && !empty($c['pb_token_enc']) && !$connected,
            'webhook_url' => $base ? $base . '/api/pagbank/webhook' : null, 'https' => str_starts_with($base, 'https://')];
}

function h_pbco_get(array $p, array $u): void { j(['pagbank' => pbco_status(pbco_company($u))]); }

/** Pergunta ao PagBank se o token funciona: devolve [status HTTP, 0 se sem rede]. */
function pbco_probe(array $acct): int
{
    try { [$st] = pb_call('GET', '/public-keys?type=webhook', null, $acct); } catch (Throwable) { return 0; }
    return (int) $st;
}

function h_pbco_put(array $p, array $u): void
{
    require_role($u, 'admin'); // só o dono da conta conecta: o gestor geral não mexe no recebimento da empresa
    $cid = (int) $u['company_id'];
    if (company_kind($cid) === 'direta') fail('Esta empresa recebe pela plataforma.', 409);
    throttle_marker('__pbco' . $cid . '__', 20);
    $in = body();
    $token = is_string($in['token'] ?? null) ? trim($in['token']) : '';
    $env = ($in['env'] ?? 'sandbox') === 'production' ? 'production' : 'sandbox';
    if (!preg_match('/^[A-Za-z0-9._\-]{16,200}$/', $token)) fail('O token do PagBank parece incompleto. Copie o token inteiro, sem espaços.', 422);
    $over = cfg('pagbank'); $base = is_array($over) && !empty($over['base_url']) ? (string) $over['base_url'] : ($env === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com');
    $st = pbco_probe(['token' => $token, 'env' => $env, 'base' => rtrim($base, '/'), 'owner' => 'empresa']);
    if ($st === 0) fail('Não consegui falar com o PagBank agora (rede ou endereço). Tente de novo em instantes.', 502);
    if ($st === 401 || $st === 403) fail('O PagBank recusou o token. Confira se é o token certo para o ambiente escolhido (testes ou produção).', 422);
    if ($st < 200 || $st >= 300) fail('O PagBank respondeu com erro ' . $st . '. Tente de novo em instantes.', 502);
    try { $enc = secret_encrypt($token); } catch (Throwable $e) { error_log('[meus-treinos] cifra do token: ' . $e->getMessage()); fail('Não consegui guardar o token com segurança. Avise o suporte.', 500); }
    Db::run('UPDATE companies SET pb_token_enc=?, pb_env=?, pb_hint=?, pb_connected_at=? WHERE id=?', [$enc, $env, substr($token, -4), now(), $cid]);
    audit($u, (int) $u['id'], 'pagbank_conectado', $env === 'production' ? 'produção' : 'testes');
    j(['pagbank' => pbco_status($cid)]);
}

/** O administrador liga/desliga cartão de crédito e débito (o débito precisa estar liberado na conta PagBank dele). */
function h_pbco_methods(array $p, array $u): void
{
    require_role($u, 'admin');
    $cid = (int) $u['company_id'];
    if (company_kind($cid) === 'direta') fail('Esta empresa recebe pela plataforma.', 409);
    $in = body();
    Db::run('UPDATE companies SET pb_card=?, pb_debit=? WHERE id=?', [!empty($in['card']) ? 1 : 0, !empty($in['debit']) ? 1 : 0, $cid]);
    audit($u, (int) $u['id'], 'pagbank_cartao', (!empty($in['card']) ? 'crédito' : '') . (!empty($in['card']) && !empty($in['debit']) ? ' + ' : '') . (!empty($in['debit']) ? 'débito' : '') ?: 'desligado');
    j(['pagbank' => pbco_status($cid)]);
}

function h_pbco_delete(array $p, array $u): void
{
    require_role($u, 'admin');
    $cid = (int) $u['company_id'];
    Db::run('UPDATE companies SET pb_token_enc=NULL, pb_hint=NULL, pb_connected_at=NULL WHERE id=?', [$cid]);
    audit($u, (int) $u['id'], 'pagbank_removido');
    j(['pagbank' => pbco_status($cid)]);
}

/** Testa a conexão já guardada (sem mexer em nada). */
function h_pbco_test(array $p, array $u): void
{
    require_role($u, 'admin');
    $acct = pb_company_account((int) $u['company_id']);
    if (!$acct) fail('Conecte a conta PagBank primeiro.', 422);
    $st = pbco_probe($acct);
    if ($st === 0) fail('Não consegui falar com o PagBank (rede ou endereço).', 502);
    if ($st === 401 || $st === 403) fail('O PagBank recusou o token guardado. Gere um novo e conecte de novo.', 422);
    j(['ok' => $st >= 200 && $st < 300, 'status' => $st]);
}
