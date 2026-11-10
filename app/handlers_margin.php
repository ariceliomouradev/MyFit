<?php
declare(strict_types=1);

/* =====================================================================
 *  V3.1 · Margem da plataforma e indicação ENTRE EMPRESAS (nível A)
 *
 *  O desconto de indicação entre empresas sai do bolso da PLATAFORMA, então ele é limitado por um teto de margem:
 *     teto de desconto por mês = preço do plano − custo variável da conta − margem mínima (% do preço)
 *  O que a empresa cobra dos alunos (nível B) é dela e não passa por aqui.
 * ===================================================================== */

const PLATFORM_DEFAULTS = ['b2b_referred_pct' => 20.0, 'b2b_referred_months' => 2.0, 'b2b_referrer_pct' => 20.0, 'b2b_referrer_months' => 2.0];

function platform_cfg(): array
{
    $c = PLATFORM_DEFAULTS;
    foreach (Db::all('SELECT k,v FROM platform_settings') as $r) if (array_key_exists($r['k'], $c)) $c[$r['k']] = (float) $r['v'];
    return $c;
}

/** Custo, margem e teto de desconto de um plano da plataforma. */
function plan_ceiling(array $plan): array
{
    $price = (int) $plan['price_cents']; $cost = (int) ($plan['cost_cents'] ?? 0); $mm = (float) ($plan['min_margin_pct'] ?? 40);
    $floor = (int) round($price * $mm / 100);
    $max = max(0, $price - $cost - $floor);
    return ['price_cents' => $price, 'cost_cents' => $cost, 'min_margin_pct' => $mm, 'margin_cents' => $price - $cost, 'margin_pct' => $price ? round(100 * ($price - $cost) / $price, 1) : 0.0,
            'floor_cents' => $floor, 'max_discount_cents' => $max, 'max_discount_pct' => $price ? round(100 * $max / $price, 1) : 0.0];
}

function partner_code_new(): string
{
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do { $c = 'PAR-'; for ($i = 0; $i < 6; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)]; } while (Db::val('SELECT 1 FROM companies WHERE partner_code=?', [$c]));
    return $c;
}
function company_partner_code(int $cid): string
{
    $c = Db::val('SELECT partner_code FROM companies WHERE id=?', [$cid]);
    if ($c) return (string) $c;
    $c = partner_code_new(); Db::run('UPDATE companies SET partner_code=? WHERE id=? AND partner_code IS NULL', [$c, $cid]);
    return (string) Db::val('SELECT partner_code FROM companies WHERE id=?', [$cid]);
}

/**
 * Valor da mensalidade da plataforma para uma empresa, com os descontos de indicação que ainda restam,
 * limitados pelo teto de margem do plano. Devolve null se a empresa não tem plano.
 */
function platform_quote(int $cid): ?array
{
    $plan = Db::one('SELECT p.* FROM plans p JOIN companies c ON c.plan_id=p.id WHERE c.id=?', [$cid]);
    if (!$plan) return null;
    $cfg = platform_cfg(); $price = (int) $plan['price_cents']; $pct = 0.0; $refs = []; $notes = [];
    $as = Db::one('SELECT id FROM company_referrals WHERE referred_company_id=? AND referred_months_left>0', [$cid]);
    if ($as && $cfg['b2b_referred_pct'] > 0) { $pct += $cfg['b2b_referred_pct']; $refs[] = ['i' => (int) $as['id'], 's' => 'd']; $notes[] = 'indicação (sua empresa foi indicada): ' . fmt_pct($cfg['b2b_referred_pct']); }
    $rr = Db::all('SELECT id FROM company_referrals WHERE referrer_company_id=? AND referrer_months_left>0 ORDER BY id LIMIT 8', [$cid]);
    if ($rr && $cfg['b2b_referrer_pct'] > 0) {
        foreach ($rr as $r) { $pct += $cfg['b2b_referrer_pct']; $refs[] = ['i' => (int) $r['id'], 's' => 'r']; }
        $notes[] = count($rr) . ' ' . (count($rr) === 1 ? 'empresa indicada' : 'empresas indicadas') . ': ' . fmt_pct($cfg['b2b_referrer_pct'] * count($rr));
    }
    $ceil = plan_ceiling($plan);
    $want = (int) round($price * $pct / 100); $disc = min($want, $ceil['max_discount_cents']);
    $amount = max(100, $price - $disc); $disc = $price - $amount;
    return ['plan' => $plan, 'list_cents' => $price, 'discount_cents' => $disc, 'amount_cents' => $amount, 'discount_pct' => $price ? round(100 * $disc / $price, 2) : 0.0,
            'capped' => $want > $disc, 'discount_note' => $notes ? implode(' + ', $notes) . ($want > $disc ? ' (limitado pelo teto de margem do plano)' : '') : null,
            'refs_json' => $refs ? json_encode($refs) : null, 'ceiling' => $ceil];
}
function fmt_pct(float $n): string { return rtrim(rtrim(number_format($n, 2, ',', ''), '0'), ',') . '%'; }

/** Conta um mês de desconto usado para cada indicação aplicada em um pagamento da plataforma confirmado. */
function consume_company_referrals(?string $refsJson): void
{
    foreach ((json_decode((string) $refsJson, true) ?: []) as $r) {
        $id = (int) ($r['i'] ?? 0); if (!$id) continue;
        if (($r['s'] ?? '') === 'd') Db::run('UPDATE company_referrals SET referred_months_left=GREATEST(0, referred_months_left-1) WHERE id=?', [$id]);
        else Db::run('UPDATE company_referrals SET referrer_months_left=GREATEST(0, referrer_months_left-1) WHERE id=?', [$id]);
    }
}

/** Resumo financeiro da plataforma (só gestor): receita dos planos ativos, descontos em vigor, custo e margem. */
function platform_summary(): array
{
    $list = $disc = $rev = $cost = 0; $n = 0;
    foreach (Db::all("SELECT id FROM companies WHERE status='ativa' AND plan_id IS NOT NULL AND (access_until IS NULL OR access_until >= CURDATE())") as $c) {
        $q = platform_quote((int) $c['id']); if (!$q) continue;
        $n++; $list += $q['list_cents']; $disc += $q['discount_cents']; $rev += $q['amount_cents']; $cost += (int) $q['plan']['cost_cents'];
    }
    return ['companies' => $n, 'list_cents' => $list, 'discounts_cents' => $disc, 'revenue_cents' => $rev, 'cost_cents' => $cost, 'margin_cents' => $rev - $cost, 'margin_pct' => $rev ? round(100 * ($rev - $cost) / $rev, 1) : 0.0];
}

/** Código de parceiro da empresa, regras vigentes e as empresas que ela indicou (para o painel do administrador). */
function partner_info(int $cid): array
{
    $cfg = platform_cfg();
    $list = Db::all('SELECT r.referrer_months_left, c.name, c.status FROM company_referrals r JOIN companies c ON c.id=r.referred_company_id WHERE r.referrer_company_id=? ORDER BY r.id DESC LIMIT 50', [$cid]);
    $was = Db::one('SELECT r.referred_months_left, c.name FROM company_referrals r JOIN companies c ON c.id=r.referrer_company_id WHERE r.referred_company_id=?', [$cid]);
    return ['code' => company_partner_code($cid), 'referred_pct' => $cfg['b2b_referred_pct'], 'referred_months' => (int) $cfg['b2b_referred_months'], 'referrer_pct' => $cfg['b2b_referrer_pct'], 'referrer_months' => (int) $cfg['b2b_referrer_months'],
            'referred' => array_map(fn($r) => ['name' => $r['name'], 'status' => $r['status'], 'months_left' => (int) $r['referrer_months_left']], $list),
            'was_referred_by' => $was ? ['name' => $was['name'], 'months_left' => (int) $was['referred_months_left']] : null];
}

function h_platform_get(array $p, array $u): void
{
    require_role($u, 'super');
    $c = platform_cfg();
    j(['settings' => ['b2b_referred_pct' => $c['b2b_referred_pct'], 'b2b_referred_months' => (int) $c['b2b_referred_months'], 'b2b_referrer_pct' => $c['b2b_referrer_pct'], 'b2b_referrer_months' => (int) $c['b2b_referrer_months']],
       'plans' => plans_list(), 'summary' => platform_summary()]);
}

function h_platform_put(array $p, array $u): void
{
    require_role($u, 'super');
    $in = body();
    $vals = ['b2b_referred_pct' => v_num($in['b2b_referred_pct'] ?? null, 'Desconto de quem foi indicado', 0, 100), 'b2b_referred_months' => v_int($in['b2b_referred_months'] ?? null, 'Meses de desconto do indicado', 0, 24),
             'b2b_referrer_pct' => v_num($in['b2b_referrer_pct'] ?? null, 'Desconto de quem indicou', 0, 100), 'b2b_referrer_months' => v_int($in['b2b_referrer_months'] ?? null, 'Meses de desconto de quem indicou', 0, 24)];
    foreach ($vals as $k => $v) Db::run('INSERT INTO platform_settings (k,v,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v), updated_at=VALUES(updated_at)', [$k, (string) $v, now()]);
    h_platform_get($p, $u);
}
