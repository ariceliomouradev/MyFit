<?php
declare(strict_types=1);

/* =====================================================================
 *  V3.2 · Clientes diretos (estilo Netflix) e personal solo
 *
 *    kind 'empresa'  academia comum (administrador + personais + alunos)
 *    kind 'direta'   a empresa interna "Clientes diretos": guarda os ALUNOS SOLO, que pagam à plataforma
 *    kind 'solo'     empresa de um personal só: o próprio personal é o administrador e atende os alunos dele
 *
 *  Reaproveita tudo que já existe (limites de plano, financeiro, indicação, marca) em vez de criar um segundo sistema.
 * ===================================================================== */

function company_kind(int $cid): string
{
    return (string) (Db::val('SELECT kind FROM companies WHERE id=?', [$cid]) ?: 'empresa');
}

/** A empresa interna "Clientes diretos" (criada na primeira vez que for preciso). */
function direct_company_id(): int
{
    $id = Db::val("SELECT id FROM companies WHERE kind='direta' ORDER BY id LIMIT 1");
    if ($id) return (int) $id;
    Db::run("INSERT INTO companies (name,code,status,kind,access_until,partner_code,created_at) VALUES ('Clientes diretos',?, 'ativa','direta',NULL,?,?)", [company_code(), partner_code_new(), now()]);
    return Db::id();
}

/** Quem pode editar treino e ver fotos como personal: o personal, o gestor e o administrador de uma empresa SOLO (ele é o personal). */
function acts_as_personal(array $u): bool
{
    if (in_array($u['role'], ['personal', 'super'], true)) return true;
    return $u['role'] === 'admin' && !empty($u['company_id']) && company_kind((int) $u['company_id']) === 'solo';
}

/** Gestor cria um cliente individual: aluno solo (vai para "Clientes diretos") ou personal solo (vira uma empresa de um personal só). */
function h_direct_create(array $p, array $u): void
{
    require_role($u, 'super');
    $in = body();
    $type = $in['type'] ?? '';
    if (!in_array($type, ['aluno', 'personal'], true)) fail('Escolha o tipo: aluno solo ou personal solo.');
    $name = v_str($in['name'] ?? null, 'Nome', 2, 80);
    $email = valid_email($in['email'] ?? null);
    $pass = require_strong_password($in['password'] ?? '');
    $wa = norm_whatsapp($in['whatsapp'] ?? '');
    $until = period_to_date($in['period'] ?? null, $in['custom'] ?? null);
    if (Db::val('SELECT 1 FROM users WHERE email=?', [$email])) fail('Este e-mail já está cadastrado.', 409);

    if ($type === 'aluno') {
        $cid = direct_company_id();
        Db::run("INSERT INTO users (name,email,password_hash,whatsapp,role,status,company_id,access_until,created_at,approved_at,must_change_password) VALUES (?,?,?,?, 'aluno','ativo',?,?,?,?,1)",
            [$name, $email, hash_pw($pass), $wa, $cid, $until, now(), now()]);
        j(['user' => manage_user_row(Db::id()), 'company' => companies_query($cid)[0]], 201);
    }
    $plan = Db::one("SELECT id FROM plans WHERE id=? AND audience='solo' AND active=1", [(int) ($in['plan_id'] ?? 0)]);
    if (!$plan) fail('Escolha um plano de personal solo.');
    $pdo = Db::pdo(); $pdo->beginTransaction();
    try {
        Db::run("INSERT INTO companies (name,code,status,kind,access_until,plan_id,partner_code,created_at) VALUES (?,?, 'ativa','solo',?,?,?,?)", [mb_substr($name . ' · Personal', 0, 120), company_code(), $until, $plan['id'], partner_code_new(), now()]);
        $cid = Db::id();
        Db::run("INSERT INTO users (name,email,password_hash,whatsapp,role,status,company_id,created_at,approved_at,must_change_password) VALUES (?,?,?,?, 'admin','ativo',?,?,?,1)", [$name, $email, hash_pw($pass), $wa, $cid, now(), now()]);
        $uid = Db::id();
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    j(['user' => manage_user_row($uid), 'company' => companies_query($cid)[0]], 201);
}
