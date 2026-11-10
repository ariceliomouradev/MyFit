<?php
declare(strict_types=1);

/* =====================================================================
 *  V3 · Financeiro da empresa, indicações e pagamentos (PagBank / PIX)
 *
 *  Valores sempre em CENTAVOS (inteiros). Quem confirma um pagamento é o servidor, consultando o PagBank
 *  (GET /orders/{id}) com o token da conta: o conteúdo do aviso (webhook) nunca é confiável sozinho.
 *
 *  Regras de indicação (por empresa, o administrador ajusta os percentuais):
 *   - Quem foi INDICADO ganha X% do valor de UM mês do plano, na primeira renovação paga pelo app.
 *   - Quem INDICOU (aluno) ganha Y% do valor de UM mês do plano por indicação ativa, na próxima renovação (acumula até o teto).
 *   - Se quem indicou é PERSONAL, ele recebe Z% de comissão sobre cada pagamento do indicado (por N meses).
 *   - O desconto nunca vale para um período já pago: só abate a renovação seguinte.
 * ===================================================================== */

/* ---------- PagBank ---------- */
function pb_cfg(): ?array
{
    $c = cfg('pagbank');
    if (!is_array($c) || empty($c['token'])) return null;
    $env = ($c['env'] ?? 'sandbox') === 'production' ? 'production' : 'sandbox';
    $base = !empty($c['base_url']) ? (string) $c['base_url'] : ($env === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com');
    return ['token' => (string) $c['token'], 'env' => $env, 'base' => rtrim($base, '/')];
}

/** Chamada autenticada ao PagBank. Devolve [status, json, texto]. */
function pb_call(string $method, string $pathOrUrl, ?array $body = null): array
{
    $c = pb_cfg();
    if (!$c) throw new RuntimeException('PagBank não configurado');
    $url = str_starts_with($pathOrUrl, 'http') ? $pathOrUrl : $c['base'] . $pathOrUrl;
    // só fala com o host do PagBank configurado (não segue links de respostas para outros endereços)
    if (parse_url($url, PHP_URL_HOST) !== parse_url($c['base'], PHP_URL_HOST)) throw new RuntimeException('Endereço inesperado');
    return http_json($method, $url, ['Authorization: Bearer ' . $c['token']], $body);
}

function pb_link(array $links, string $rel): ?string
{
    foreach ($links as $l) if (is_array($l) && ($l['rel'] ?? '') === $rel && !empty($l['href'])) return (string) $l['href'];
    return null;
}

/** Cria o pedido PIX no PagBank e devolve os dados que guardamos (id, texto copia-e-cola, imagem). */
function pb_create_pix(array $pay, array $payer, string $taxId): array
{
    $amount = (int) $pay['amount_cents'];
    $exp = (new DateTimeImmutable('+30 minutes'))->format('c');
    $wa = (string) ($payer['whatsapp'] ?? '');
    $phones = strlen($wa) === 11 ? [['country' => '55', 'area' => substr($wa, 0, 2), 'number' => substr($wa, 2), 'type' => 'MOBILE']] : [];
    $body = [
        'reference_id' => $pay['reference'],
        'customer' => ['name' => mb_substr((string) $payer['name'], 0, 80), 'email' => $payer['email'], 'tax_id' => $taxId] + ($phones ? ['phones' => $phones] : []),
        'items' => [['reference_id' => 'plano-' . ($pay['plan_ref'] ?? 0), 'name' => mb_substr((string) $pay['plan_name'], 0, 100), 'quantity' => 1, 'unit_amount' => $amount]],
        'charges' => [['reference_id' => $pay['reference'], 'description' => mb_substr((string) $pay['plan_name'], 0, 60),
            'amount' => ['value' => $amount, 'currency' => 'BRL'], 'payment_method' => ['type' => 'PIX', 'pix' => ['expiration_date' => $exp]]]],
    ];
    $base = app_url();
    if (str_starts_with($base, 'https://') && strlen($base . '/api/pagbank/webhook') <= 100) $body['notification_urls'] = [$base . '/api/pagbank/webhook'];
    [$st, $json, $txt] = pb_call('POST', '/orders', $body);
    if ($st < 200 || $st >= 300 || !is_array($json) || empty($json['id'])) {
        error_log('[meus-treinos] PagBank criar pedido: HTTP ' . $st . ' ' . mb_substr((string) $txt, 0, 400));
        throw new RuntimeException('PagBank recusou o pedido');
    }
    $ch = $json['charges'][0] ?? [];
    $text = $ch['qr_code']['text'] ?? null;
    if (!$text) throw new RuntimeException('PagBank não devolveu o PIX');
    $qr = null;
    if ($b64 = pb_link($ch['links'] ?? [], 'QRCODE.BASE64')) {
        try { [$qs, , $qt] = pb_call('GET', $b64); if ($qs === 200 && preg_match('/^[A-Za-z0-9+\/=\s]+$/', trim($qt)) && strlen($qt) < 400000) $qr = 'data:image/png;base64,' . preg_replace('/\s+/', '', $qt); } catch (Throwable) { /* sem imagem: o copia-e-cola basta */ }
    }
    return ['order_id' => (string) $json['id'], 'charge_id' => isset($ch['id']) ? (string) $ch['id'] : null, 'text' => (string) $text, 'qr' => $qr, 'expires' => date('Y-m-d H:i:s', strtotime($exp))];
}

/** Pergunta ao PagBank o estado do pedido e atualiza o pagamento. Devolve o status final. */
function pb_sync(array $pay): string
{
    if (empty($pay['pb_order_id']) || $pay['status'] === 'pago') return $pay['status'];
    Db::run('UPDATE payments SET checked_at=? WHERE id=?', [now(), $pay['id']]);
    try { [$st, $json] = pb_call('GET', '/orders/' . rawurlencode((string) $pay['pb_order_id'])); } catch (Throwable $e) { return $pay['status']; }
    if ($st !== 200 || !is_array($json)) return $pay['status'];
    // o pedido precisa ser mesmo o nosso: mesma referência e mesmo valor
    $match = null;
    foreach (($json['charges'] ?? []) as $ch) if (is_array($ch) && (($ch['reference_id'] ?? '') === $pay['reference'] || ($json['reference_id'] ?? '') === $pay['reference'])) $match = $ch;
    if (!$match) return $pay['status'];
    $status = strtoupper((string) ($match['status'] ?? ''));
    $value = (int) ($match['amount']['value'] ?? -1);
    if ($status === 'PAID' && $value === (int) $pay['amount_cents']) { pay_apply_paid((int) $pay['id']); return 'pago'; }
    if ($status === 'PAID') { error_log('[meus-treinos] PagBank: valor pago diferente do cobrado no pagamento #' . $pay['id']); return $pay['status']; }
    if (in_array($status, ['CANCELED', 'DECLINED'], true) && $pay['status'] === 'pendente') {
        $new = $status === 'DECLINED' ? 'falhou' : 'expirado';
        Db::run('UPDATE payments SET status=? WHERE id=? AND status=?', [$new, $pay['id'], 'pendente']);
        pay_release((int) $pay['id']);
        return $new;
    }
    return $pay['status'];
}

/** Devolve ao estoque os créditos de indicação reservados por uma cobrança que não se concretizou. */
function pay_release(int $payId): void
{
    Db::run("UPDATE referrals SET credit_state='livre', credit_payment_id=NULL WHERE credit_payment_id=? AND credit_state='reservado'", [$payId]);
}

/** Aplica os efeitos de um pagamento confirmado (uma única vez): estende o acesso, consome descontos. */
function pay_apply_paid(int $id): bool
{
    $pdo = Db::pdo();
    $pdo->beginTransaction();
    try {
        $pay = Db::one('SELECT * FROM payments WHERE id=? FOR UPDATE', [$id]);
        if (!$pay || $pay['status'] === 'pago') { $pdo->commit(); return false; }
        Db::run("UPDATE payments SET status='pago', paid_at=?, checked_at=? WHERE id=?", [now(), now(), $id]);
        $months = max(1, (int) $pay['months']);
        $extend = static function (?string $cur) use ($months): string {
            $base = new DateTimeImmutable($cur && $cur > date('Y-m-d') ? $cur : date('Y-m-d'));
            return $base->modify("+$months months")->format('Y-m-d');
        };
        if ($pay['kind'] === 'aluno') {
            $u = Db::one('SELECT id, company_id, access_until FROM users WHERE id=? FOR UPDATE', [$pay['user_id']]);
            if ($u) {
                Db::run('UPDATE users SET access_until=? WHERE id=?', [$extend($u['access_until']), $u['id']]);
                audit(['id' => $u['id'], 'company_id' => $u['company_id']], (int) $u['id'], $pay['method'] === 'manual' ? 'pagamento_manual' : 'pagamento', $pay['plan_name'] . ' · ' . brl((int) $pay['amount_cents']));
            }
            if ($pay['referral_id']) Db::run('UPDATE referrals SET referred_discount_used=1 WHERE id=?', [$pay['referral_id']]);
            Db::run("UPDATE referrals SET credit_state='usado' WHERE credit_payment_id=? AND credit_state='reservado'", [$id]);
        } elseif ($pay['company_id']) {
            $c = Db::one('SELECT id, access_until FROM companies WHERE id=? FOR UPDATE', [$pay['company_id']]);
            if ($c) {
                Db::run("UPDATE companies SET access_until=?, status='ativa'" . ($pay['plan_ref'] && Db::val('SELECT 1 FROM plans WHERE id=?', [$pay['plan_ref']]) ? ', plan_id=' . (int) $pay['plan_ref'] : '') . ' WHERE id=?', [$extend($c['access_until']), $c['id']]);
            }
        }
        $pdo->commit();
        return true;
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

/* ---------- Cálculo de preço, descontos e comissão ---------- */
function company_fin(int $cid): array
{
    $c = Db::one('SELECT id,name,commission_pct,commission_months,discount_referred_pct,discount_referrer_pct,discount_cap_pct,access_until,status,plan_id FROM companies WHERE id=?', [$cid]);
    if (!$c) fail('Empresa não encontrada.', 404);
    return $c;
}

/**
 * Preço de uma renovação para $payer no plano $plan.
 * Desconto = % do valor de UM mês do plano (preço do plano ÷ meses), somando o desconto de "indicado" (1ª renovação)
 * com o de "quem indicou" (por indicação ativa), limitado ao teto da empresa.
 */
function pay_quote(array $payer, array $plan): array
{
    $c = company_fin((int) $payer['company_id']);
    $list = (int) $plan['price_cents'];
    $months = max(1, (int) $plan['months']);
    $monthly = (int) round($list / $months);
    $pct1 = 0.0; $refId = null; $creditIds = []; $note = [];
    $r = Db::one('SELECT id FROM referrals WHERE referred_id=? AND activated_at IS NOT NULL AND referred_discount_used=0', [$payer['id']]);
    if ($r) { $pct1 = (float) $c['discount_referred_pct']; $refId = (int) $r['id']; if ($pct1 > 0) $note[] = 'indicação (você foi indicado): ' . rtrim(rtrim(number_format($pct1, 2, ',', ''), '0'), ',') . '%'; }
    $pct2 = (float) $c['discount_referrer_pct']; $cap = (float) $c['discount_cap_pct'];
    $credits = Db::all("SELECT id FROM referrals WHERE referrer_id=? AND activated_at IS NOT NULL AND credit_state='livre' ORDER BY id", [$payer['id']]);
    $room = max(0.0, $cap - $pct1);
    $k = $pct2 > 0 ? min(count($credits), (int) floor($room / $pct2 + 1e-9)) : 0;
    $creditIds = array_map('intval', array_column(array_slice($credits, 0, $k), 'id'));
    if ($k > 0) $note[] = $k . ' ' . ($k === 1 ? 'amigo indicado' : 'amigos indicados') . ': ' . rtrim(rtrim(number_format($k * $pct2, 2, ',', ''), '0'), ',') . '%';
    $pctTotal = min($cap, $pct1 + $k * $pct2);
    if ($refId === null && $k === 0) $pctTotal = 0.0;
    $discount = (int) round($monthly * $pctTotal / 100);
    $amount = max(100, $list - $discount);
    $discount = $list - $amount;
    // comissão do personal que indicou (só dentro do prazo da comissão)
    $comUser = null; $comCents = 0;
    $rf = Db::one("SELECT r.referrer_id, r.activated_at FROM referrals r JOIN users u ON u.id=r.referrer_id WHERE r.referred_id=? AND r.activated_at IS NOT NULL AND u.role='personal' AND u.status='ativo'", [$payer['id']]);
    if ($rf && strtotime((string) $rf['activated_at'] . ' +' . (int) $c['commission_months'] . ' months') > time() && (float) $c['commission_pct'] > 0) {
        $comUser = (int) $rf['referrer_id']; $comCents = (int) round($amount * (float) $c['commission_pct'] / 100);
    }
    return ['list_cents' => $list, 'monthly_cents' => $monthly, 'discount_cents' => $discount, 'amount_cents' => $amount, 'discount_pct' => $pctTotal,
            'discount_note' => $note ? implode(' + ', $note) . ' sobre 1 mês' : null, 'referral_id' => $refId, 'credit_ids' => $creditIds, 'commission_user_id' => $comUser, 'commission_cents' => $comCents];
}

function pay_public(array $p): array
{
    return ['id' => (int) $p['id'], 'token' => $p['token'], 'status' => $p['status'], 'plan_name' => $p['plan_name'], 'months' => (int) $p['months'], 'list_cents' => (int) $p['list_cents'],
            'discount_cents' => (int) $p['discount_cents'], 'discount_note' => $p['discount_note'], 'amount_cents' => (int) $p['amount_cents'], 'pix_text' => $p['status'] === 'pendente' ? $p['pix_text'] : null,
            'pix_qr' => $p['status'] === 'pendente' ? $p['pix_qr'] : null, 'expires_at' => iso($p['expires_at']), 'paid_at' => iso($p['paid_at']), 'method' => $p['method'], 'created_at' => iso($p['created_at'])];
}

function pay_insert(array $payer, string $kind, array $plan, array $q, string $method, ?int $companyId, ?int $by): int
{
    Db::run('INSERT INTO payments (company_id,user_id,payer_name,kind,plan_name,plan_ref,months,list_cents,discount_cents,amount_cents,discount_note,referral_id,commission_user_id,commission_cents,method,status,reference,token,created_by,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [$companyId, $payer['id'], mb_substr((string) $payer['name'], 0, 80), $kind, mb_substr((string) $plan['name'], 0, 60), $plan['id'] ?? null, max(1, (int) ($plan['months'] ?? 1)), $q['list_cents'], $q['discount_cents'], $q['amount_cents'],
         $q['discount_note'], $q['referral_id'], $q['commission_user_id'], $q['commission_cents'], $method, 'pendente', 'mt' . bin2hex(random_bytes(10)), bin2hex(random_bytes(16)), $by, now()]);
    return Db::id();
}

/** Gera a cobrança PIX de uma renovação. */
function pay_create_pix(array $payer, string $kind, array $plan, array $q, string $taxId, ?int $by = null): array
{
    if (!pb_cfg()) fail('O pagamento online ainda não foi ativado. Fale com a sua academia para pagar de outra forma.', 503);
    $cid = $payer['company_id'] ? (int) $payer['company_id'] : null;
    if ((int) Db::val("SELECT COUNT(*) FROM payments WHERE user_id=? AND created_at > (NOW() - INTERVAL 1 HOUR)", [$payer['id']]) >= 10) fail('Muitas cobranças geradas. Aguarde um pouco e tente de novo.', 429);
    foreach (Db::all("SELECT id FROM payments WHERE user_id=? AND kind=? AND status='pendente'", [$payer['id'], $kind]) as $old) { // só uma cobrança aberta por pessoa
        Db::run("UPDATE payments SET status='cancelado' WHERE id=? AND status='pendente'", [$old['id']]);
        pay_release((int) $old['id']);
    }
    $id = pay_insert($payer, $kind, $plan, $q, 'pix', $cid, $by);
    if ($q['credit_ids']) {
        $in = implode(',', array_fill(0, count($q['credit_ids']), '?'));
        Db::run("UPDATE referrals SET credit_state='reservado', credit_payment_id=? WHERE credit_state='livre' AND id IN ($in)", array_merge([$id], $q['credit_ids']));
    }
    $pay = Db::one('SELECT * FROM payments WHERE id=?', [$id]);
    try {
        $r = pb_create_pix($pay, $payer, $taxId);
    } catch (Throwable $e) {
        error_log('[meus-treinos] cobrança #' . $id . ': ' . $e->getMessage());
        Db::run("UPDATE payments SET status='falhou' WHERE id=?", [$id]);
        pay_release($id);
        fail('Não consegui gerar o PIX agora. Tente de novo em instantes.', 502);
    }
    Db::run('UPDATE payments SET pb_order_id=?, pb_charge_id=?, pix_text=?, pix_qr=?, expires_at=? WHERE id=?', [$r['order_id'], $r['charge_id'], $r['text'], $r['qr'], $r['expires'], $id]);
    return pay_public(Db::one('SELECT * FROM payments WHERE id=?', [$id]));
}

/* ---------- Rotas de pagamento ---------- */
function plan_options_for(array $payer): array
{
    $plans = Db::all('SELECT * FROM company_plans WHERE company_id=? AND active=1 ORDER BY months, id', [$payer['company_id']]);
    return array_map(fn($pl) => ['id' => (int) $pl['id'], 'name' => $pl['name'], 'months' => (int) $pl['months'], 'price_cents' => (int) $pl['price_cents'], 'quote' => array_diff_key(pay_quote($payer, $pl), ['credit_ids' => 1])], $plans);
}

function h_pay_options(array $p, array $u): void
{
    if ($u['role'] === 'aluno') {
        j(['kind' => 'aluno', 'enabled' => pb_cfg() !== null, 'access_until' => $u['access_until'], 'plans' => plan_options_for($u)]);
    }
    if ($u['role'] === 'admin') {
        $c = Db::one('SELECT c.access_until, p.id plan_id, p.name plan_name, p.price_cents FROM companies c LEFT JOIN plans p ON p.id=c.plan_id WHERE c.id=?', [$u['company_id']]);
        j(['kind' => 'empresa', 'enabled' => pb_cfg() !== null, 'access_until' => $c['access_until'], 'plan' => $c['plan_id'] ? ['id' => (int) $c['plan_id'], 'name' => $c['plan_name'], 'price_cents' => (int) $c['price_cents']] : null]);
    }
    fail('Você não tem permissão para isso.', 403);
}

function h_pay_create(array $p, array $u): void
{
    $in = body();
    $tax = valid_tax_id($in['tax_id'] ?? '');
    if ($u['role'] === 'aluno') {
        $plan = Db::one('SELECT * FROM company_plans WHERE id=? AND company_id=? AND active=1', [(int) ($in['plan_id'] ?? 0), $u['company_id']]);
        if (!$plan) fail('Escolha um plano.');
        $row = Db::one(USER_SELECT . 'WHERE u.id=?', [$u['id']]);
        j(['payment' => pay_create_pix($row, 'aluno', $plan, pay_quote($row, $plan), $tax)], 201);
    }
    if ($u['role'] === 'admin') {
        $pl = Db::one('SELECT p.* FROM companies c JOIN plans p ON p.id=c.plan_id WHERE c.id=?', [$u['company_id']]);
        if (!$pl || (int) $pl['price_cents'] < 100) fail('A sua empresa ainda não tem um plano com valor definido. Fale com o gestor.');
        $row = Db::one(USER_SELECT . 'WHERE u.id=?', [$u['id']]);
        $plan = ['id' => (int) $pl['id'], 'name' => 'Plataforma · ' . $pl['name'] . ' · 1 mês', 'months' => 1, 'price_cents' => (int) $pl['price_cents']];
        $q = ['list_cents' => (int) $pl['price_cents'], 'discount_cents' => 0, 'amount_cents' => (int) $pl['price_cents'], 'discount_note' => null, 'referral_id' => null, 'credit_ids' => [], 'commission_user_id' => null, 'commission_cents' => 0];
        j(['payment' => pay_create_pix($row, 'empresa', $plan, $q, $tax)], 201);
    }
    fail('Você não tem permissão para isso.', 403);
}

function h_pay_mine(array $p, array $u): void
{
    $rows = Db::all('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 20', [$u['id']]);
    j(['payments' => array_map('pay_public', $rows)]);
}

/** Acompanhar um pagamento (por um código secreto da própria cobrança). Consulta o PagBank no máximo a cada 3 segundos. */
function h_pay_status(array $p): void
{
    $t = is_string($_GET['t'] ?? null) ? $_GET['t'] : '';
    if (!preg_match('/^[a-f0-9]{32}$/', $t)) fail('Cobrança não encontrada.', 404);
    $pay = Db::one('SELECT * FROM payments WHERE token=?', [$t]);
    if (!$pay) fail('Cobrança não encontrada.', 404);
    if ($pay['status'] === 'pendente' && $pay['pb_order_id'] && (!$pay['checked_at'] || strtotime($pay['checked_at']) < time() - 3)) {
        $new = pb_sync($pay);
        $pay = Db::one('SELECT * FROM payments WHERE id=?', [$pay['id']]);
    }
    if ($pay['status'] === 'pendente' && $pay['expires_at'] && $pay['expires_at'] < now()) { Db::run("UPDATE payments SET status='expirado' WHERE id=? AND status='pendente'", [$pay['id']]); pay_release((int) $pay['id']); $pay['status'] = 'expirado'; }
    j(['payment' => pay_public($pay)]);
}

/** Renovação por quem já perdeu o acesso (não consegue entrar): confirma e-mail e senha, e só então mostra planos / gera o PIX. */
function h_pay_renew(array $p): void
{
    $in = body();
    $email = strtolower(trim(is_string($in['email'] ?? null) ? $in['email'] : ''));
    $pass = is_string($in['password'] ?? null) ? $in['password'] : '';
    if ($email === '' || $pass === '') fail('Informe e-mail e senha.');
    throttle_login($email);
    $row = Db::one(USER_SELECT . 'WHERE u.email=?', [$email]);
    $ok = password_verify($pass, $row['password_hash'] ?? DUMMY_HASH);
    if (!$row || !$ok) fail('E-mail ou senha incorretos.', 401);
    if (!can_self_renew($row)) fail('Não é possível renovar por aqui. Fale com o seu personal ou com a sua academia.', 403);
    unset($row['password_hash']);
    if (empty($in['plan_id'])) j(['enabled' => pb_cfg() !== null, 'name' => $row['name'], 'plans' => plan_options_for($row)]);
    $plan = Db::one('SELECT * FROM company_plans WHERE id=? AND company_id=? AND active=1', [(int) $in['plan_id'], $row['company_id']]);
    if (!$plan) fail('Escolha um plano.');
    j(['payment' => pay_create_pix($row, 'aluno', $plan, pay_quote($row, $plan), valid_tax_id($in['tax_id'] ?? ''))], 201);
}

/** Aviso do PagBank. Não confiamos no conteúdo: só usamos para saber QUAL cobrança conferir e então perguntamos ao PagBank. */
function h_pagbank_webhook(array $p): void
{
    $raw = (string) file_get_contents('php://input', false, null, 0, 200_000);
    $d = json_decode($raw, true);
    $ids = [];
    if (is_array($d)) {
        foreach (['id', 'reference_id'] as $k) if (is_string($d[$k] ?? null)) $ids[] = $d[$k];
        foreach (($d['charges'] ?? []) as $ch) if (is_array($ch) && is_string($ch['reference_id'] ?? null)) $ids[] = $ch['reference_id'];
    }
    foreach (array_slice(array_unique($ids), 0, 5) as $id) {
        if (!preg_match('/^[A-Za-z0-9_-]{6,64}$/', $id)) continue;
        $pay = Db::one("SELECT * FROM payments WHERE (pb_order_id=? OR reference=?) AND status<>'pago' LIMIT 1", [$id, $id]);
        if ($pay) { try { pb_sync($pay); } catch (Throwable $e) { error_log('[meus-treinos] webhook: ' . $e->getMessage()); } }
    }
    j(['ok' => true]);
}

function h_pagbank_status(array $p, array $u): void
{
    require_role($u, 'super');
    $c = pb_cfg(); $base = app_url();
    j(['configured' => $c !== null, 'env' => $c['env'] ?? null, 'app_url' => $base ?: null, 'webhook_url' => $base ? $base . '/api/pagbank/webhook' : null,
       'https' => str_starts_with($base, 'https://'), 'whatsapp' => is_array(cfg('whatsapp')) ? (cfg('whatsapp')['driver'] ?? null) : null,
       'pending' => (int) Db::val("SELECT COUNT(*) FROM payments WHERE status='pendente' AND method='pix'"), 'paid' => (int) Db::val("SELECT COUNT(*) FROM payments WHERE status='pago' AND method='pix'")]);
}

function h_pagbank_test(array $p, array $u): void
{
    require_role($u, 'super');
    if (!pb_cfg()) fail('Falta o token do PagBank no config.php (veja o INSTALACAO.md).', 422);
    try { [$st] = pb_call('GET', '/public-keys?type=webhook'); } catch (Throwable) { $st = 0; }
    if ($st === 0) fail('Não consegui falar com o PagBank (rede ou endereço).', 502);
    if ($st === 401 || $st === 403) fail('O PagBank recusou o token. Confira se é o token certo para o ambiente (sandbox ou produção).', 422);
    j(['ok' => $st >= 200 && $st < 300, 'status' => $st]);
}

/* ---------- Financeiro da empresa ---------- */
function fin_company(array $u): int
{
    require_role($u, 'admin', 'super');
    return (int) company_scope($u, $_GET['company_id'] ?? (body()['company_id'] ?? null));
}

function h_fin_settings_get(array $p, array $u): void
{
    $c = company_fin(fin_company($u));
    j(['settings' => ['commission_pct' => (float) $c['commission_pct'], 'commission_months' => (int) $c['commission_months'], 'discount_referred_pct' => (float) $c['discount_referred_pct'],
        'discount_referrer_pct' => (float) $c['discount_referrer_pct'], 'discount_cap_pct' => (float) $c['discount_cap_pct']]]);
}
function h_fin_settings_put(array $p, array $u): void
{
    $cid = fin_company($u); $in = body();
    Db::run('UPDATE companies SET commission_pct=?, commission_months=?, discount_referred_pct=?, discount_referrer_pct=?, discount_cap_pct=? WHERE id=?', [
        v_num($in['commission_pct'] ?? null, 'Comissão', 0, 100), v_int($in['commission_months'] ?? null, 'Meses de comissão', 1, 60), v_num($in['discount_referred_pct'] ?? null, 'Desconto de quem foi indicado', 0, 100),
        v_num($in['discount_referrer_pct'] ?? null, 'Desconto de quem indicou', 0, 100), v_num($in['discount_cap_pct'] ?? null, 'Teto de desconto', 0, 100), $cid]);
    h_fin_settings_get([], $u);
}

function cplans_out(int $cid): array
{
    return array_map(fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'months' => (int) $r['months'], 'price_cents' => (int) $r['price_cents'], 'monthly_cents' => (int) round($r['price_cents'] / max(1, $r['months'])), 'active' => (bool) $r['active']],
        Db::all('SELECT * FROM company_plans WHERE company_id=? ORDER BY active DESC, months, id', [$cid]));
}
function h_cplans(array $p, array $u): void { j(['plans' => cplans_out(fin_company($u))]); }
function h_cplan_save(array $p, array $u): void
{
    $cid = fin_company($u); $in = body();
    $name = v_str($in['name'] ?? null, 'Nome do plano', 2, 60); $months = v_int($in['months'] ?? null, 'Duração (meses)', 1, 36); $price = v_int($in['price_cents'] ?? null, 'Preço', 100, 10_000_000);
    $active = !array_key_exists('active', $in) || (bool) $in['active'];
    if (isset($p['id'])) {
        if (!Db::val('SELECT 1 FROM company_plans WHERE id=? AND company_id=?', [(int) $p['id'], $cid])) fail('Plano não encontrado.', 404);
        Db::run('UPDATE company_plans SET name=?, months=?, price_cents=?, active=? WHERE id=?', [$name, $months, $price, (int) $active, (int) $p['id']]);
    } else {
        if ((int) Db::val('SELECT COUNT(*) FROM company_plans WHERE company_id=?', [$cid]) >= 20) fail('Limite de 20 planos por empresa.');
        Db::run('INSERT INTO company_plans (company_id,name,months,price_cents,active,created_at) VALUES (?,?,?,?,?,?)', [$cid, $name, $months, $price, (int) $active, now()]);
    }
    j(['plans' => cplans_out($cid)], isset($p['id']) ? 200 : 201);
}
function h_cplan_delete(array $p, array $u): void
{
    $cid = fin_company($u);
    if (!Db::val('SELECT 1 FROM company_plans WHERE id=? AND company_id=?', [(int) $p['id'], $cid])) fail('Plano não encontrado.', 404);
    if (Db::val("SELECT 1 FROM payments WHERE plan_ref=? AND kind='aluno' AND company_id=?", [(int) $p['id'], $cid])) Db::run('UPDATE company_plans SET active=0 WHERE id=?', [(int) $p['id']]); // tem histórico: só desativa
    else Db::run('DELETE FROM company_plans WHERE id=?', [(int) $p['id']]);
    j(['plans' => cplans_out($cid)]);
}

/** Painel financeiro: receita, descontos, comissões, receita líquida, MRR, crescimento e série mensal. */
function h_fin_dashboard(array $p, array $u): void
{
    $cid = fin_company($u);
    $n = max(3, min(12, (int) ($_GET['months'] ?? 6)));
    $from = date('Y-m-01', strtotime('-' . ($n - 1) . ' months'));
    $rows = Db::all("SELECT DATE_FORMAT(paid_at,'%Y-%m') ym, SUM(list_cents) gross, SUM(discount_cents) disc, SUM(commission_cents) comm, SUM(amount_cents) received, COUNT(*) n
        FROM payments WHERE company_id=? AND kind='aluno' AND status='pago' AND paid_at >= ? GROUP BY ym ORDER BY ym", [$cid, $from]);
    $by = []; foreach ($rows as $r) $by[$r['ym']] = $r;
    $series = []; $tot = ['gross' => 0, 'discounts' => 0, 'commissions' => 0, 'net' => 0, 'payments' => 0];
    for ($i = $n - 1; $i >= 0; $i--) {
        $ym = date('Y-m', strtotime(date('Y-m-01') . " -$i months")); $r = $by[$ym] ?? null;
        $g = (int) ($r['gross'] ?? 0); $d = (int) ($r['disc'] ?? 0); $c = (int) ($r['comm'] ?? 0);
        $series[] = ['month' => $ym, 'gross' => $g, 'discounts' => $d, 'commissions' => $c, 'net' => $g - $d - $c, 'payments' => (int) ($r['n'] ?? 0)];
        $tot['gross'] += $g; $tot['discounts'] += $d; $tot['commissions'] += $c; $tot['net'] += $g - $d - $c; $tot['payments'] += (int) ($r['n'] ?? 0);
    }
    $cur = $series[$n - 1]['net']; $prev = $series[$n - 2]['net'];
    $mrr = (int) round((float) Db::val("SELECT COALESCE(SUM(p.amount_cents / p.months),0) FROM payments p WHERE p.company_id=? AND p.kind='aluno' AND p.status='pago' AND DATE_ADD(p.paid_at, INTERVAL p.months MONTH) > NOW()
        AND p.id = (SELECT MAX(q.id) FROM payments q WHERE q.user_id=p.user_id AND q.kind='aluno' AND q.status='pago')", [$cid]));
    $ativos = (int) Db::val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='aluno' AND status='ativo' AND (access_until IS NULL OR access_until >= CURDATE())", [$cid]);
    $novos = (int) Db::val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='aluno' AND approved_at >= ?", [$cid, date('Y-m-01')]);
    $vencidos = (int) Db::val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='aluno' AND status='ativo' AND access_until >= ? AND access_until < CURDATE()", [$cid, date('Y-m-01')]);
    $com = Db::all("SELECT p.commission_user_id uid, u.name, SUM(p.commission_cents) accrued, SUM(CASE WHEN p.commission_paid_at IS NOT NULL THEN p.commission_cents ELSE 0 END) paid, COUNT(*) n
        FROM payments p LEFT JOIN users u ON u.id=p.commission_user_id WHERE p.company_id=? AND p.kind='aluno' AND p.status='pago' AND p.commission_user_id IS NOT NULL GROUP BY p.commission_user_id, u.name ORDER BY accrued DESC LIMIT 20", [$cid]);
    $recent = Db::all("SELECT * FROM payments WHERE company_id=? AND kind='aluno' ORDER BY id DESC LIMIT 15", [$cid]);
    j(['months' => $n, 'series' => $series, 'totals' => $tot + ['avg_ticket' => $tot['payments'] ? (int) round(($tot['gross'] - $tot['discounts']) / $tot['payments']) : 0],
        'mrr' => $mrr, 'active_students' => $ativos, 'new_students' => $novos, 'expired_this_month' => $vencidos,
        'churn_pct' => ($ativos + $vencidos) ? round(100 * $vencidos / ($ativos + $vencidos), 1) : 0.0,
        'growth_pct' => $prev > 0 ? round(100 * ($cur - $prev) / $prev, 1) : null,
        'commissions' => array_map(fn($r) => ['user_id' => (int) $r['uid'], 'name' => $r['name'] ?? '(excluído)', 'accrued' => (int) $r['accrued'], 'paid' => (int) $r['paid'], 'pending' => (int) $r['accrued'] - (int) $r['paid'], 'payments' => (int) $r['n']], $com),
        'recent' => array_map(fn($r) => ['id' => (int) $r['id'], 'payer' => $r['payer_name'], 'plan' => $r['plan_name'], 'amount_cents' => (int) $r['amount_cents'], 'status' => $r['status'], 'method' => $r['method'], 'when' => iso($r['paid_at'] ?? $r['created_at'])], $recent),
        'pending_payments' => (int) Db::val("SELECT COUNT(*) FROM payments WHERE company_id=? AND kind='aluno' AND status='pendente'", [$cid])]);
}

function h_fin_commission_pay(array $p, array $u): void
{
    $cid = fin_company($u);
    $uid = v_int(body()['user_id'] ?? null, 'Personal', 1, PHP_INT_MAX);
    $n = Db::run("UPDATE payments SET commission_paid_at=? WHERE company_id=? AND commission_user_id=? AND status='pago' AND commission_paid_at IS NULL AND commission_cents > 0", [now(), $cid, $uid])->rowCount();
    if (!$n) fail('Não há comissão pendente para este personal.', 409);
    audit($u, $uid, 'comissao_repassada', $n . ' pagamentos');
    j(['ok' => true, 'payments' => $n]);
}

/** Pagamento recebido fora do app (dinheiro, PIX direto, maquininha): o administrador registra e o acesso é estendido igual. */
function h_fin_manual(array $p, array $u): void
{
    $cid = fin_company($u); $in = body();
    $stu = Db::one(USER_SELECT . "WHERE u.id=? AND u.company_id=? AND u.role='aluno' AND u.status='ativo'", [(int) ($in['user_id'] ?? 0), $cid]);
    if (!$stu) fail('Aluno não encontrado.', 404);
    $plan = Db::one('SELECT * FROM company_plans WHERE id=? AND company_id=?', [(int) ($in['plan_id'] ?? 0), $cid]);
    if (!$plan) fail('Escolha um plano.');
    unset($stu['password_hash']);
    $q = pay_quote($stu, $plan);
    $id = pay_insert($stu, 'aluno', $plan, $q, 'manual', $cid, (int) $u['id']);
    if ($q['credit_ids']) { $ph = implode(',', array_fill(0, count($q['credit_ids']), '?')); Db::run("UPDATE referrals SET credit_state='reservado', credit_payment_id=? WHERE credit_state='livre' AND id IN ($ph)", array_merge([$id], $q['credit_ids'])); }
    pay_apply_paid($id);
    audit($u, (int) $stu['id'], 'pagamento_manual', $plan['name'] . ' · ' . brl($q['amount_cents']));
    j(['payment' => pay_public(Db::one('SELECT * FROM payments WHERE id=?', [$id])), 'access_until' => Db::val('SELECT access_until FROM users WHERE id=?', [$stu['id']])], 201);
}

/* ---------- Indicação (aluno e personal) ---------- */
function h_referral_me(array $p, array $u): void
{
    require_role($u, 'aluno', 'personal');
    $code = referral_code_for((int) $u['id']);
    $c = company_fin((int) $u['company_id']);
    $list = Db::all("SELECT r.id, r.activated_at, r.credit_state, r.referred_discount_used, x.name, x.status FROM referrals r JOIN users x ON x.id=r.referred_id WHERE r.referrer_id=? ORDER BY r.id DESC LIMIT 100", [$u['id']]);
    $free = count(array_filter($list, fn($r) => $r['activated_at'] && $r['credit_state'] === 'livre'));
    $out = ['code' => $code, 'company' => $c['name'],
        'rules' => ['referred_pct' => (float) $c['discount_referred_pct'], 'referrer_pct' => (float) $c['discount_referrer_pct'], 'cap_pct' => (float) $c['discount_cap_pct'], 'commission_pct' => (float) $c['commission_pct'], 'commission_months' => (int) $c['commission_months']],
        'referrals' => array_map(fn($r) => ['name' => $r['name'], 'status' => $r['activated_at'] ? 'ativo' : ($r['status'] === 'bloqueado' ? 'bloqueado' : 'aguardando'), 'credit' => $r['credit_state']], $list)];
    if ($u['role'] === 'aluno') {
        $out['credits'] = $free; $out['next_discount_pct'] = min((float) $c['discount_cap_pct'], $free * (float) $c['discount_referrer_pct']);
        $out['was_referred'] = (bool) Db::val('SELECT 1 FROM referrals WHERE referred_id=? AND activated_at IS NOT NULL AND referred_discount_used=0', [$u['id']]);
    } else {
        $e = Db::one("SELECT COALESCE(SUM(commission_cents),0) accrued, COALESCE(SUM(CASE WHEN commission_paid_at IS NOT NULL THEN commission_cents ELSE 0 END),0) paid FROM payments WHERE commission_user_id=? AND status='pago'", [$u['id']]);
        $out['earnings'] = ['accrued' => (int) $e['accrued'], 'paid' => (int) $e['paid'], 'pending' => (int) $e['accrued'] - (int) $e['paid']];
        $out['payments'] = array_map(fn($r) => ['payer' => $r['payer_name'], 'plan' => $r['plan_name'], 'commission_cents' => (int) $r['commission_cents'], 'paid_out' => $r['commission_paid_at'] !== null, 'when' => iso($r['paid_at'])],
            Db::all("SELECT * FROM payments WHERE commission_user_id=? AND status='pago' ORDER BY id DESC LIMIT 30", [$u['id']]));
    }
    j($out);
}
