<?php
declare(strict_types=1);

/* =====================================================================
 *  V2: gestão em rede (de cima para baixo)
 *
 *    super    (gestor geral)   -> cria empresas, define a validade de cada empresa, vê tudo
 *    admin    (da empresa)     -> aprova cadastros, cria usuários, define a validade de cada um
 *    personal (da empresa)     -> acompanha os alunos dele e ajusta exercícios e repetições
 *    aluno                     -> treina e acompanha a própria evolução
 *
 *  Regra de ouro: toda consulta é filtrada pela empresa de quem pede.
 *  O front nunca decide permissão; ela é conferida aqui, em cada rota.
 * ===================================================================== */

const PERIODS = ['30d', '2m', '3m', '6m', '12m', '24m', 'custom'];

/* ---------- Empresas (só o gestor geral) ---------- */
function company_code(): string
{
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 para não confundir
    do {
        $c = '';
        for ($i = 0; $i < 8; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)];
    } while (Db::val('SELECT 1 FROM companies WHERE code=?', [$c]));
    return $c;
}

function company_out(array $c): array
{
    $until = $c['access_until'];
    return ['id' => (int) $c['id'], 'name' => $c['name'], 'code' => $c['code'], 'status' => $c['status'], 'access_until' => $until,
            'days_left' => $until ? (int) floor((strtotime($until) - strtotime(date('Y-m-d'))) / 86400) : null,
            'users' => (int) ($c['n_users'] ?? 0), 'pending' => (int) ($c['n_pending'] ?? 0), 'alunos' => (int) ($c['n_alunos'] ?? 0),
            'personals' => (int) ($c['n_personals'] ?? 0), 'admins' => $c['admins'] ?? [],
            'plan_id' => isset($c['plan_id']) ? (int) $c['plan_id'] : null, 'plan_name' => $c['plan_name'] ?? null, 'partner_code' => $c['partner_code'] ?? null, 'kind' => $c['kind'] ?? 'empresa', 'code_direct' => null,
            'max_personals' => isset($c['max_personals']) ? (int) $c['max_personals'] : null, 'max_students' => isset($c['max_students']) ? (int) $c['max_students'] : null,
            'alunos_ativos' => (int) ($c['n_alunos_ativos'] ?? 0)];
}

/** Garante que a empresa não passe do limite do plano (NULL = sem plano definido ou ilimitado). */
function plan_limit_check(int $cid, string $role, ?int $ignoreUserId = null): void
{
    $kind = company_kind($cid);
    if ($kind === 'solo' && $role === 'personal') fail('Esta é uma empresa de um personal só: quem atende os alunos é o próprio dono. Não há outros personais.', 409);
    if ($kind === 'direta' && $role !== 'aluno') fail('A empresa de clientes diretos só tem alunos.', 409);
    $c = Db::one('SELECT p.name, p.max_personals, p.max_students FROM companies c LEFT JOIN plans p ON p.id=c.plan_id WHERE c.id=?', [$cid]);
    if (!$c || $c['name'] === null) return;
    if ($role === 'personal' && $c['max_personals'] !== null) {
        $n = (int) Db::val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='personal' AND status<>'bloqueado' AND id<>?", [$cid, $ignoreUserId ?? 0]);
        if ($n >= (int) $c['max_personals']) fail("O plano {$c['name']} permite {$c['max_personals']} " . ((int) $c['max_personals'] === 1 ? 'personal' : 'personais') . ' e o limite foi atingido. Fale com o gestor para trocar de plano.', 409);
    }
    if ($role === 'aluno' && $c['max_students'] !== null) {
        $n = (int) Db::val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='aluno' AND status='ativo' AND id<>?", [$cid, $ignoreUserId ?? 0]);
        if ($n >= (int) $c['max_students']) fail("O plano {$c['name']} permite {$c['max_students']} alunos ativos e o limite foi atingido. Fale com o gestor para trocar de plano.", 409);
    }
}

function companies_query(?int $only = null): array
{
    $rows = Db::all("SELECT c.*, pl.name plan_name, pl.max_personals, pl.max_students,
        (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id AND u.role='aluno' AND u.status='ativo') n_alunos_ativos,
        (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id) n_users,
        (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id AND u.status='pendente') n_pending,
        (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id AND u.role='aluno') n_alunos,
        (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id AND u.role='personal') n_personals
        FROM companies c LEFT JOIN plans pl ON pl.id=c.plan_id" . ($only ? ' WHERE c.id=?' : '') . ' ORDER BY c.name', $only ? [$only] : []);
    foreach ($rows as &$r) {
        $r['admins'] = Db::all("SELECT id,name,email,whatsapp FROM users WHERE company_id=? AND role='admin' ORDER BY id", [$r['id']]);
    }
    return array_map('company_out', $rows);
}

function plan_id_or_null(mixed $v, string $audience = 'empresa'): ?int
{
    if ($v === null || $v === '' || $v === 0 || $v === '0') return null;
    $id = (int) $v;
    if (!Db::val('SELECT 1 FROM plans WHERE id=?', [$id])) fail('Plano não encontrado.');
    if (!Db::val('SELECT 1 FROM plans WHERE id=? AND audience=?', [$id, $audience])) fail($audience === 'solo' ? 'Este plano é para academias. Escolha um plano de personal solo.' : 'Este plano é para personal solo. Escolha um plano de academia.');
    return $id;
}

function h_companies(array $p, array $u): void { require_role($u, 'super'); j(['companies' => companies_query(), 'plans' => plans_list(), 'direct_company_id' => direct_company_id()]); }

function h_company_create(array $p, array $u): void
{
    require_role($u, 'super');
    $in = body();
    $name = v_str($in['name'] ?? null, 'Nome da empresa', 2, 120);
    $until = period_to_date($in['period'] ?? null, $in['custom'] ?? null);
    $a = $in['admin'] ?? [];
    $aname = v_str($a['name'] ?? null, 'Nome do administrador', 2, 80);
    $aemail = valid_email($a['email'] ?? null, 'E-mail do administrador');
    $apass = require_strong_password($a['password'] ?? '');
    $awa = norm_whatsapp($a['whatsapp'] ?? '');
    $planId = plan_id_or_null($in['plan_id'] ?? null);
    $refCode = strtoupper(trim(is_string($in['referred_by'] ?? null) ? $in['referred_by'] : ''));
    $refCo = null;
    if ($refCode !== '') { $refCo = Db::one("SELECT id FROM companies WHERE partner_code=? AND status='ativa'", [$refCode]); if (!$refCo) fail('Código de parceiro inválido, ou a empresa indicadora está suspensa.'); }
    if (Db::val('SELECT 1 FROM users WHERE email=?', [$aemail])) fail('Já existe um usuário com o e-mail do administrador.', 409);

    $pdo = Db::pdo();
    $pdo->beginTransaction();
    try {
        Db::run("INSERT INTO companies (name,code,status,access_until,plan_id,partner_code,created_at) VALUES (?,?, 'ativa',?,?,?,?)", [$name, company_code(), $until, $planId, partner_code_new(), now()]);
        $cid = Db::id();
        if ($refCo) { $pc = platform_cfg(); Db::run('INSERT INTO company_referrals (referrer_company_id,referred_company_id,referred_months_left,referrer_months_left,created_at) VALUES (?,?,?,?,?)', [$refCo['id'], $cid, (int) $pc['b2b_referred_months'], (int) $pc['b2b_referrer_months'], now()]); }
        Db::run("INSERT INTO users (name,email,password_hash,whatsapp,role,status,company_id,created_at,approved_at,must_change_password) VALUES (?,?,?,?, 'admin','ativo',?,?,?,1)",
            [$aname, $aemail, hash_pw($apass), $awa, $cid, now(), now()]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    j(['company' => companies_query($cid)[0]], 201);
}

function h_company_update(array $p, array $u): void
{
    require_role($u, 'super');
    $c = Db::one('SELECT * FROM companies WHERE id=?', [(int) $p['id']]);
    if (!$c) fail('Empresa não encontrada.', 404);
    $in = body();
    $name = isset($in['name']) ? v_str($in['name'], 'Nome da empresa', 2, 120) : $c['name'];
    $status = in_array($in['status'] ?? $c['status'], ['ativa', 'suspensa'], true) ? ($in['status'] ?? $c['status']) : $c['status'];
    $until = $c['access_until'];
    if (!empty($in['period'])) $until = period_to_date($in['period'], $in['custom'] ?? null, !empty($in['extend']) ? $c['access_until'] : null);
    $code = !empty($in['new_code']) ? company_code() : $c['code'];
    $planId = array_key_exists('plan_id', $in) ? plan_id_or_null($in['plan_id'], ($c['kind'] ?? 'empresa') === 'solo' ? 'solo' : 'empresa') : $c['plan_id'];
    if (($c['kind'] ?? 'empresa') === 'direta' && $planId) fail('A empresa de clientes diretos não tem plano da plataforma.');
    Db::run('UPDATE companies SET name=?, status=?, access_until=?, code=?, plan_id=? WHERE id=?', [$name, $status, $until, $code, $planId, $c['id']]);
    j(['company' => companies_query((int) $c['id'])[0]]);
}

/* ---------- Usuários da empresa (administrador da empresa e gestor geral) ---------- */
/** Empresa em que a pessoa atua: o admin só enxerga a própria; o gestor geral escolhe com company_id. */
function company_scope(array $u, mixed $explicit = null, bool $required = true): ?int
{
    if ($u['role'] === 'admin') return (int) $u['company_id'];
    if ($u['role'] === 'super') {
        $cid = (int) ($explicit ?? $_GET['company_id'] ?? 0);
        if ($cid && !Db::val('SELECT 1 FROM companies WHERE id=?', [$cid])) fail('Empresa não encontrada.', 404);
        if (!$cid && $required) fail('Escolha a empresa.');
        return $cid ?: null;
    }
    fail('Você não tem permissão para isso.', 403);
}

const MANAGE_SELECT = "SELECT u.id,u.name,u.email,u.whatsapp,u.role,u.status,u.company_id,u.personal_id,u.access_until,u.created_at,u.last_login,u.week_start,u.eval_every_days,u.unit,
        c.name company_name, c.access_until company_until, c.status company_status, pe.name personal_name,
        pr.goal, pr.environment, pr.height_cm, pr.days_per_week, pr.level, pr.sex, pr.age,
        (SELECT m.weight FROM measurements m WHERE m.user_id=u.id ORDER BY m.day DESC LIMIT 1) weight,
        (SELECT m.day FROM measurements m WHERE m.user_id=u.id ORDER BY m.day DESC LIMIT 1) last_eval,
        (SELECT w.started_at FROM workouts w WHERE w.user_id=u.id AND w.finished_at IS NOT NULL ORDER BY w.started_at DESC LIMIT 1) last_workout
    FROM users u LEFT JOIN companies c ON c.id=u.company_id LEFT JOIN users pe ON pe.id=u.personal_id LEFT JOIN profiles pr ON pr.user_id=u.id ";

/** Linha de usuário para as telas de gestão. Nunca inclui a senha. */
function manage_user_out(array $r): array
{
    $until = array_filter([$r['access_until'], $r['company_until']]);
    $eff = $until ? min($until) : null;
    $bmi = ($r['weight'] && $r['height_cm']) ? round((float) $r['weight'] / (((float) $r['height_cm'] / 100) ** 2), 1) : null;
    return [
        'id' => (int) $r['id'], 'name' => $r['name'], 'email' => $r['email'], 'whatsapp' => $r['whatsapp'], 'role' => $r['role'], 'status' => $r['status'],
        'company_id' => $r['company_id'] === null ? null : (int) $r['company_id'], 'company_name' => $r['company_name'],
        'personal_id' => $r['personal_id'] === null ? null : (int) $r['personal_id'], 'personal_name' => $r['personal_name'],
        'access_until' => $r['access_until'], 'effective_until' => $eff,
        'days_left' => $eff ? (int) floor((strtotime($eff) - strtotime(date('Y-m-d'))) / 86400) : null,
        'created_at' => iso($r['created_at']), 'last_login' => iso($r['last_login']),
        'goal' => $r['goal'], 'environment' => $r['environment'], 'weight' => $r['weight'] === null ? null : (float) $r['weight'], 'bmi' => $bmi,
        'last_eval' => $r['last_eval'], 'last_workout' => iso($r['last_workout']), 'eval_every_days' => (int) ($r['eval_every_days'] ?? 30),
    ];
}

function h_users(array $p, array $u): void
{
    require_role($u, 'admin', 'super');
    $cid = company_scope($u, null, false);
    $w = []; $args = [];
    if ($cid) { $w[] = 'u.company_id=?'; $args[] = $cid; } else $w[] = "u.role <> 'super'";
    if (!empty($_GET['status']) && in_array($_GET['status'], ['pendente', 'ativo', 'bloqueado'], true)) { $w[] = 'u.status=?'; $args[] = $_GET['status']; }
    if (!empty($_GET['role']) && in_array($_GET['role'], ['admin', 'personal', 'aluno'], true)) { $w[] = 'u.role=?'; $args[] = $_GET['role']; }
    if (!empty($_GET['q'])) { $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_substr((string) $_GET['q'], 0, 60)) . '%'; $w[] = '(u.name LIKE ? OR u.email LIKE ? OR u.whatsapp LIKE ?)'; array_push($args, $q, $q, $q); }
    $rows = Db::all(MANAGE_SELECT . 'WHERE ' . implode(' AND ', $w) . " ORDER BY (u.status='pendente') DESC, u.name LIMIT 500", $args);
    j(['users' => array_map('manage_user_out', $rows)]);
}

function h_manage_summary(array $p, array $u): void
{
    require_role($u, 'admin', 'super');
    $cid = company_scope($u, null, false);
    $w = $cid ? 'company_id=?' : "role <> 'super'"; $a = $cid ? [$cid] : [];
    $row = Db::one("SELECT SUM(status='pendente') pendentes, SUM(status='ativo' AND role='aluno') alunos, SUM(role='personal') personals,
        SUM(status='ativo' AND access_until IS NOT NULL AND access_until BETWEEN CURDATE() AND (CURDATE() + INTERVAL 7 DAY)) expirando,
        SUM(access_until IS NOT NULL AND access_until < CURDATE()) expirados FROM users WHERE $w", $a);
    $company = $cid ? companies_query($cid)[0] : null;
    j(['summary' => array_map('intval', array_map(fn($v) => $v ?? 0, $row)), 'company' => $company,
       'personals' => $cid ? Db::all("SELECT id,name FROM users WHERE company_id=? AND role='personal' AND status='ativo' ORDER BY name", [$cid]) : []]);
}

/** Usuário que o ator pode gerir: admin só os da própria empresa (aluno/personal); gestor geral qualquer um, menos outro gestor. */
function manageable_target(array $u, int $id): array
{
    require_role($u, 'admin', 'super');
    $t = Db::one('SELECT * FROM users WHERE id=?', [$id]);
    if (!$t || $t['role'] === 'super') fail('Usuário não encontrado.', 404);
    if ($u['role'] === 'admin' && ((int) $t['company_id'] !== (int) $u['company_id'] || !in_array($t['role'], ['aluno', 'personal'], true))) fail('Usuário não encontrado.', 404);
    return $t;
}

function valid_personal(?int $pid, int $cid): ?int
{
    if (!$pid) return null;
    if (!Db::val("SELECT 1 FROM users WHERE id=? AND company_id=? AND role='personal'", [$pid, $cid])) fail('Personal inválido para esta empresa.');
    return $pid;
}

function manage_user_row(int $id): array { return manage_user_out(Db::one(MANAGE_SELECT . 'WHERE u.id=?', [$id])); }

function h_user_create(array $p, array $u): void
{
    require_role($u, 'admin', 'super');
    $in = body();
    $cid = company_scope($u, $in['company_id'] ?? null);
    $role = $in['role'] ?? 'aluno';
    $allowed = $u['role'] === 'super' ? ['aluno', 'personal', 'admin'] : ['aluno', 'personal'];
    if (!in_array($role, $allowed, true)) fail('Perfil inválido.');
    $kind = company_kind($cid);
    if ($kind === 'direta' && $role !== 'aluno') fail('A empresa de clientes diretos só tem alunos.', 409);
    if ($kind === 'solo' && $role === 'admin') fail('Uma empresa de um personal só tem um único administrador (o próprio dono).', 409);
    $name = v_str($in['name'] ?? null, 'Nome', 2, 80);
    $email = valid_email($in['email'] ?? null);
    $pass = require_strong_password($in['password'] ?? '');
    $wa = norm_whatsapp($in['whatsapp'] ?? '');
    $until = $role === 'admin' ? null : period_to_date($in['period'] ?? null, $in['custom'] ?? null);
    $pid = $role === 'aluno' ? valid_personal(isset($in['personal_id']) && $in['personal_id'] !== '' ? (int) $in['personal_id'] : null, $cid) : null; // personal e administrador nunca têm "personal responsável"
    if (Db::val('SELECT 1 FROM users WHERE email=?', [$email])) fail('Este e-mail já está cadastrado.', 409);
    if (in_array($role, ['aluno', 'personal'], true)) plan_limit_check($cid, $role);
    Db::run("INSERT INTO users (name,email,password_hash,whatsapp,role,status,company_id,personal_id,access_until,created_at,approved_at,must_change_password) VALUES (?,?,?,?,?, 'ativo',?,?,?,?,?,1)",
        [$name, $email, hash_pw($pass), $wa, $role, $cid, $pid, $until, now(), now()]);
    j(['user' => manage_user_row(Db::id())], 201);
}

function h_user_approve(array $p, array $u): void
{
    $t = manageable_target($u, (int) $p['id']);
    if ($t['status'] !== 'pendente') fail('Este cadastro já foi analisado.', 409);
    $in = body();
    $until = period_to_date($in['period'] ?? null, $in['custom'] ?? null);
    plan_limit_check((int) $t['company_id'], $t['role']);
    $pid = valid_personal(isset($in['personal_id']) && $in['personal_id'] !== '' ? (int) $in['personal_id'] : null, (int) $t['company_id']);
    // Aluno que veio pelo código de um personal fica com ele, se o administrador não escolher outro.
    $ref = Db::one("SELECT r.id, r.referrer_id, u.role FROM referrals r JOIN users u ON u.id=r.referrer_id WHERE r.referred_id=?", [$t['id']]);
    if (!$pid && $ref && $ref['role'] === 'personal') $pid = valid_personal((int) $ref['referrer_id'], (int) $t['company_id']);
    Db::run("UPDATE users SET status='ativo', access_until=?, approved_at=?, personal_id=? WHERE id=?", [$until, now(), $pid, $t['id']]);
    if ($ref) Db::run('UPDATE referrals SET activated_at=? WHERE id=? AND activated_at IS NULL', [now(), $ref['id']]); // a indicação passa a valer: desconto para quem indicou
    audit($u, (int) $t['id'], 'aprovado', 'validade até ' . $until . ($pid ? ', personal #' . $pid : ''));
    j(['user' => manage_user_row((int) $t['id'])]);
}

function h_user_update(array $p, array $u): void
{
    $t = manageable_target($u, (int) $p['id']);
    $in = body();
    $self = (int) $t['id'] === (int) $u['id'];
    $name = isset($in['name']) ? v_str($in['name'], 'Nome', 2, 80) : $t['name'];
    $wa = array_key_exists('whatsapp', $in) ? norm_whatsapp($in['whatsapp']) : $t['whatsapp'];
    $status = $t['status'];
    if (isset($in['status'])) {
        if (!in_array($in['status'], ['ativo', 'bloqueado'], true)) fail('Status inválido.');
        if ($self && $in['status'] !== 'ativo') fail('Você não pode bloquear a si mesmo.');
        if ($t['status'] === 'pendente') fail('Use "Aprovar" para liberar um cadastro pendente: é lá que se escolhe o período de acesso.');
        if ($t['status'] === 'bloqueado' && $in['status'] === 'ativo') plan_limit_check((int) $t['company_id'], $t['role'], (int) $t['id']);
        $status = $in['status'];
    }
    $role = $t['role'];
    if (isset($in['role']) && $in['role'] !== $t['role']) {
        if ($t['role'] === 'aluno') fail('O perfil de um aluno não pode ser alterado. Para ter um personal, crie outro cadastro.');
        $allowed = $u['role'] === 'super' ? ['personal', 'admin'] : ['personal'];
        if ($self || !in_array($in['role'], $allowed, true)) fail('Perfil inválido.');
        $role = $in['role'];
    }
    $until = $t['access_until'];
    if (!empty($in['period'])) $until = period_to_date($in['period'], $in['custom'] ?? null, !empty($in['extend']) ? $t['access_until'] : null);
    $pid = $t['personal_id'];
    if (array_key_exists('personal_id', $in)) $pid = $role === 'aluno' ? valid_personal($in['personal_id'] === '' || $in['personal_id'] === null ? null : (int) $in['personal_id'], (int) $t['company_id']) : null;
    if ($role !== 'aluno') $pid = null;
    Db::run('UPDATE users SET name=?, whatsapp=?, status=?, role=?, access_until=?, personal_id=? WHERE id=?', [$name, $wa, $status, $role, $until, $pid, $t['id']]);
    if ($role !== 'personal' && $t['role'] === 'personal') Db::run('UPDATE users SET personal_id=NULL WHERE personal_id=?', [$t['id']]);
    if ((int) $pid !== (int) $t['personal_id']) audit($u, (int) $t['id'], 'personal_alterado', $pid ? 'novo personal: ' . Db::val('SELECT name FROM users WHERE id=?', [$pid]) : 'sem personal');
    if ($status !== $t['status']) audit($u, (int) $t['id'], 'status_alterado', $status);
    if ($until !== $t['access_until']) audit($u, (int) $t['id'], 'validade_alterada', 'até ' . ($until ?? 'sem prazo'));
    if (!empty($in['new_password'])) {
        require_strong_password($in['new_password']);
        Db::run('UPDATE users SET password_hash=?, must_change_password=1, pwd_version=pwd_version+1 WHERE id=?', [hash_pw($in['new_password']), $t['id']]);
        audit($u, (int) $t['id'], 'senha_redefinida', 'pelo ' . ($u['role'] === 'super' ? 'gestor' : 'administrador'));
    }
    j(['user' => manage_user_row((int) $t['id'])]);
}

function purge_user_files(int $uid): void
{
    $dir = APP_ROOT . '/storage/photos/' . $uid;
    if (is_dir($dir)) { foreach (glob($dir . '/*') ?: [] as $f) @unlink($f); @rmdir($dir); }
}

function h_user_delete(array $p, array $u): void
{
    $t = manageable_target($u, (int) $p['id']);
    if ((int) $t['id'] === (int) $u['id']) fail('Você não pode excluir a si mesmo.');
    if ($t['role'] === 'admin' && (int) Db::val("SELECT COUNT(*) FROM users WHERE company_id=? AND role='admin'", [$t['company_id']]) <= 1) fail('A empresa precisa ter pelo menos um administrador.');
    audit($u, null, 'usuario_excluido', $t['name'] . ' (' . $t['role'] . ')');
    Db::run('UPDATE users SET personal_id=NULL WHERE personal_id=?', [$t['id']]);
    purge_user_files((int) $t['id']);
    Db::run('DELETE FROM users WHERE id=?', [$t['id']]);
    j(['ok' => true]);
}

/** Lista de contatos (leads) em CSV: nome, e-mail, WhatsApp, perfil, validade, objetivo. Sem senha. */
function h_users_export(array $p, array $u): void
{
    require_role($u, 'admin', 'super');
    $cid = company_scope($u, null, false);
    $rows = Db::all(MANAGE_SELECT . ($cid ? 'WHERE u.company_id=?' : "WHERE u.role <> 'super'") . ' ORDER BY c.name, u.name', $cid ? [$cid] : []);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="contatos-' . date('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    echo "\xEF\xBB\xBF", "empresa;nome;email;whatsapp;perfil;status;valido_ate;objetivo;local;imc;personal;cadastro\r\n";
    foreach ($rows as $r) {
        $o = manage_user_out($r);
        echo implode(';', array_map('csv_cell', [$o['company_name'] ?? '', $o['name'], $o['email'], $o['whatsapp'] ?? '', $o['role'], $o['status'], $o['effective_until'] ?? '',
            $o['goal'] ?? '', $o['environment'] ?? '', $o['bmi'] ?? '', $o['personal_name'] ?? '', substr((string) $o['created_at'], 0, 10)])), "\r\n";
    }
    exit;
}

/* ---------- Alunos (personal, administrador e gestor geral) ---------- */
function students_where(array $u): array
{
    return match ($u['role']) {
        'personal' => ["u.role='aluno' AND u.personal_id=? AND u.company_id=?", [$u['id'], $u['company_id']]],
        'admin'    => ["u.role='aluno' AND u.company_id=?", [$u['company_id']]],
        'super'    => ["u.role='aluno'", []],
        default    => fail('Você não tem permissão para isso.', 403),
    };
}

function h_students(array $p, array $u): void
{
    [$w, $args] = students_where($u);
    if ($u['role'] === 'super' && !empty($_GET['company_id'])) { $w .= ' AND u.company_id=?'; $args[] = (int) $_GET['company_id']; }
    if (!empty($_GET['q'])) { $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_substr((string) $_GET['q'], 0, 60)) . '%'; $w .= ' AND (u.name LIKE ? OR u.email LIKE ?)'; array_push($args, $q, $q); }
    $rows = Db::all(MANAGE_SELECT . "WHERE $w AND u.status='ativo' ORDER BY u.name LIMIT 500", $args);
    j(['students' => array_map('manage_user_out', $rows)]);
}

/** Aluno que o ator pode acompanhar. Retorna a linha completa (com dados da empresa). */
function student_target(array $u, int $id): array
{
    [$w, $args] = students_where($u);
    $r = Db::one(USER_SELECT . "WHERE u.id=? AND $w", array_merge([$id], $args));
    if (!$r) fail('Aluno não encontrado.', 404);
    unset($r['password_hash']);
    return $r;
}

/** Só o próprio aluno, o personal dele e o gestor geral veem as fotos. O administrador da empresa vê números, não imagens. */
function can_view_photos(array $viewer, array $owner): bool
{
    if ((int) $viewer['id'] === (int) $owner['id'] || $viewer['role'] === 'super') return true;
    if ($viewer['role'] === 'admin' && (int) $owner['company_id'] === (int) $viewer['company_id'] && acts_as_personal($viewer)) return true; // empresa solo: ele é o personal
    return $viewer['role'] === 'personal' && (int) $owner['personal_id'] === (int) $viewer['id'] && (int) $owner['company_id'] === (int) $viewer['company_id'];
}

function h_student_get(array $p, array $u): void
{
    $t = student_target($u, (int) $p['id']);
    $uid = (int) $t['id'];
    audit($u, $uid, 'ficha_vista', '', 60);
    $profile = profile_row($uid);
    $m = latest_measure($uid);
    $workouts = Db::all("SELECT w.id,w.name,w.started_at,w.finished_at, COUNT(ws.id) sets, COALESCE(SUM(ws.weight*ws.reps),0) volume, COALESCE(SUM(ws.is_pr),0) prs
        FROM workouts w LEFT JOIN workout_sets ws ON ws.workout_id=w.id AND ws.reps>0 WHERE w.user_id=? AND w.finished_at IS NOT NULL
        GROUP BY w.id ORDER BY w.started_at DESC LIMIT 15", [$uid]);
    j(['student' => manage_user_row($uid), 'profile' => $profile, 'measure' => $m,
       'analysis' => ($profile && $m) ? analysis_for($profile, $m) : null,
       'evaluations' => evaluations_for($uid, can_view_photos($u, $t)),
       'photos_visible' => can_view_photos($u, $t),
       'routines' => routines_for($uid),
       'can_edit' => acts_as_personal($u),
       'workouts' => array_map(fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'started_at' => iso($r['started_at']), 'finished_at' => iso($r['finished_at']),
                                          'sets' => (int) $r['sets'], 'volume' => (float) $r['volume'], 'prs' => (int) $r['prs']], $workouts),
       'overview' => overview_data($t)]);
}

/** O personal troca exercícios, séries, repetições e descanso das rotinas do aluno. Nome e dia da rotina não mudam. */
function h_student_routine_update(array $p, array $u): void
{
    require_role($u, 'personal', 'admin', 'super');
    if (!acts_as_personal($u)) fail('Você não tem permissão para isso.', 403);
    $t = student_target($u, (int) $p['id']);
    $rid = (int) $p['rid'];
    if (!Db::val('SELECT 1 FROM routines WHERE id=? AND user_id=?', [$rid, $t['id']])) fail('Rotina não encontrada.', 404);
    $items = body()['exercises'] ?? [];
    if (!is_array($items) || count($items) > 40) fail('Lista de exercícios inválida.');
    $pdo = Db::pdo();
    $pdo->beginTransaction();
    try {
        Db::run('DELETE FROM routine_exercises WHERE routine_id=?', [$rid]);
        foreach (array_values($items) as $i => $it) {
            if (!is_array($it)) continue;
            $exId = v_int($it['exercise_id'] ?? 0, 'Exercício', 1, PHP_INT_MAX);
            // o exercício precisa existir para a empresa DO ALUNO (geral ou da empresa dele)
            if (!Db::val('SELECT 1 FROM exercises WHERE id=? AND user_id IS NULL AND (company_id IS NULL OR company_id=?)', [$exId, $t['company_id']])) { $pdo->rollBack(); fail('Exercício inválido.'); }
            $rmin = v_int($it['reps_min'] ?? 8, 'Repetições mínimas', 1, 300);
            $rmax = max($rmin, v_int($it['reps_max'] ?? 12, 'Repetições máximas', 1, 300));
            Db::run('INSERT INTO routine_exercises (routine_id,exercise_id,sets,reps_min,reps_max,rest_sec,position) VALUES (?,?,?,?,?,?,?)',
                [$rid, $exId, v_int($it['sets'] ?? 3, 'Séries', 1, 20), $rmin, $rmax, v_int($it['rest_sec'] ?? 90, 'Descanso', 0, 900), $i]);
        }
        Db::run('UPDATE routines SET generated=0 WHERE id=?', [$rid]); // ajustada à mão: o "refazer plano" não apaga mais
        audit($u, (int) $t['id'], 'treino_editado', (string) Db::val('SELECT name FROM routines WHERE id=?', [$rid]));
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    j(['routine' => routines_for((int) $t['id'], $rid)[0]]);
}

/* ---------- Exercícios da empresa (personal, administrador e gestor geral) ---------- */
function lines(mixed $v, int $max = 8, int $len = 300): array
{
    $a = is_array($v) ? $v : preg_split('/\R+/', (string) $v);
    $out = [];
    foreach ($a as $x) { $x = trim((string) $x); if ($x !== '') $out[] = mb_substr($x, 0, $len); }
    return array_slice($out, 0, $max);
}

function company_ex_input(array $u): array
{
    $in = body();
    $muscle = $in['muscle'] ?? '';
    if (!in_array($muscle, array_merge(MUSCLES, ['mobilidade']), true)) fail('Grupo muscular inválido.');
    $equip = $in['equipment'] ?? 'outro';
    if (!in_array($equip, EQUIPMENT, true)) fail('Equipamento inválido.');
    $env = in_array($in['environment'] ?? '', ['casa', 'academia', 'ambos'], true) ? $in['environment'] : 'ambos';
    $role = in_array($in['role'] ?? '', ['composto', 'isolado', 'core', 'cardio', 'aquecimento', 'alongamento'], true) ? $in['role'] : 'composto';
    $steps = lines($in['steps'] ?? '');
    if (count($steps) < 2) fail('Escreva pelo menos 2 passos de como fazer.');
    return [
        'name' => v_str($in['name'] ?? null, 'Nome', 2, 120), 'muscle' => $muscle, 'equipment' => $equip,
        'type' => ($in['type'] ?? 'reps') === 'time' ? 'time' : 'reps', 'environment' => $env, 'role' => $role,
        'level' => v_int($in['level'] ?? 1, 'Nível', 1, 3), 'impact' => ($in['impact'] ?? 'baixo') === 'alto' ? 'alto' : 'baixo',
        'pace' => isset($in['pace']) && trim((string) $in['pace']) !== '' ? mb_substr(trim((string) $in['pace']), 0, 190) : null,
        'rep_def' => isset($in['rep_def']) && trim((string) $in['rep_def']) !== '' ? mb_substr(trim((string) $in['rep_def']), 0, 300) : null,
        'steps' => json_encode($steps, JSON_UNESCAPED_UNICODE), 'tips' => json_encode(lines($in['tips'] ?? ''), JSON_UNESCAPED_UNICODE),
        'mistakes' => json_encode(lines($in['mistakes'] ?? ''), JSON_UNESCAPED_UNICODE),
    ];
}

function h_company_exercise_save(array $p, array $u): void
{
    require_role($u, 'personal', 'admin', 'super');
    $d = company_ex_input($u);
    $id = isset($p['id']) ? (int) $p['id'] : 0;
    if ($id) {
        $row = Db::one('SELECT * FROM exercises WHERE id=?', [$id]);
        if (!$row || $row['user_id'] !== null || !ex_manageable($row, $u)) fail('Exercício não encontrado.', 404);
        Db::run("UPDATE exercises SET share_status=IF(share_status='pendente','privado',share_status), name=?,muscle=?,equipment=?,type=?,environment=?,role=?,level=?,impact=?,pace=?,rep_def=?,steps=?,tips=?,mistakes=? WHERE id=?",
            [$d['name'], $d['muscle'], $d['equipment'], $d['type'], $d['environment'], $d['role'], $d['level'], $d['impact'], $d['pace'], $d['rep_def'], $d['steps'], $d['tips'], $d['mistakes'], $id]);
    } else {
        $cid = $u['role'] === 'super' ? null : (int) $u['company_id'];
        if (Db::val('SELECT 1 FROM exercises WHERE name=? AND user_id IS NULL AND (company_id IS NULL OR company_id=?)', [$d['name'], $cid ?? 0])) fail('Já existe um exercício com esse nome.', 409);
        Db::run('INSERT INTO exercises (user_id,company_id,name,muscle,equipment,type,environment,role,level,impact,pace,rep_def,steps,tips,mistakes,author_id,created_at) VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$cid, $d['name'], $d['muscle'], $d['equipment'], $d['type'], $d['environment'], $d['role'], $d['level'], $d['impact'], $d['pace'], $d['rep_def'], $d['steps'], $d['tips'], $d['mistakes'], $u['id'], now()]);
        $id = Db::id();
    }
    j(['exercise' => ex_out(Db::one('SELECT * FROM exercises WHERE id=?', [$id]), true)], isset($p['id']) ? 200 : 201);
}

/* ---------- Lista geral do app: o exercício da empresa só entra depois que o gestor geral aprova ---------- */
function h_exercise_submit(array $p, array $u): void
{
    require_role($u, 'personal', 'admin');
    $row = Db::one('SELECT * FROM exercises WHERE id=? AND user_id IS NULL AND company_id=?', [(int) $p['id'], $u['company_id']]);
    if (!$row) fail('Exercício não encontrado.', 404);
    if ($row['share_status'] === 'pendente') fail('Este exercício já está aguardando a aprovação do gestor.', 409);
    if (empty($row['media'])) fail('Antes de enviar, adicione a animação do exercício.');
    Db::run("UPDATE exercises SET share_status='pendente', share_note=NULL WHERE id=?", [$row['id']]);
    audit($u, null, 'exercicio_enviado', $row['name']);
    j(['exercise' => ex_out(Db::one('SELECT * FROM exercises WHERE id=?', [$row['id']]), true)]);
}

function h_approvals(array $p, array $u): void
{
    require_role($u, 'super');
    $rows = Db::all("SELECT e.*, c.name company_name, a.name author_name FROM exercises e LEFT JOIN companies c ON c.id=e.company_id LEFT JOIN users a ON a.id=e.author_id
        WHERE e.share_status='pendente' AND e.company_id IS NOT NULL AND e.user_id IS NULL ORDER BY e.id");
    j(['exercises' => array_map(fn($r) => ex_out($r, true) + ['company' => $r['company_name'], 'author' => $r['author_name']], $rows)]);
}

function h_approval_decide(array $p, array $u): void
{
    require_role($u, 'super');
    $row = Db::one("SELECT * FROM exercises WHERE id=? AND share_status='pendente' AND company_id IS NOT NULL AND user_id IS NULL", [(int) $p['id']]);
    if (!$row) fail('Exercício não encontrado ou já analisado.', 404);
    $in = body();
    if (($in['decision'] ?? '') === 'aprovar') {
        if (Db::val('SELECT 1 FROM exercises WHERE name=? AND user_id IS NULL AND company_id IS NULL', [$row['name']])) fail('Já existe um exercício geral com esse nome. Peça para o autor renomear.', 409);
        Db::run("UPDATE exercises SET origin_company_id=company_id, company_id=NULL, share_status='aprovado', share_note=NULL WHERE id=?", [$row['id']]);
        audit($u, null, 'exercicio_aprovado', $row['name']);
    } else {
        $why = v_str($in['reason'] ?? null, 'Motivo', 3, 200);
        Db::run("UPDATE exercises SET share_status='recusado', share_note=? WHERE id=?", [$why, $row['id']]);
        audit($u, null, 'exercicio_recusado', $row['name']);
    }
    j(['ok' => true]);
}

/** Animação do exercício (GIF, WebP, PNG ou JPG até 4 MB). Vale para exercício próprio ou da empresa. */
function h_exercise_media(array $p, array $u): void
{
    $row = Db::one('SELECT * FROM exercises WHERE id=?', [(int) $p['id']]);
    if (!$row || !ex_manageable($row, $u)) fail('Exercício não encontrado.', 404);
    if (!isset($_FILES['file'])) fail('Escolha um arquivo.');
    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) fail($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE ? 'O arquivo passa do limite do servidor. Use um de até 4 MB.' : 'Não consegui receber o arquivo. Tente de novo.');
    if ($f['size'] > 4 * 1024 * 1024) fail('O arquivo passa de 4 MB. Reduza o tamanho e tente de novo.');
    $info = @getimagesize($f['tmp_name']);
    $ext = ['image/gif' => 'gif', 'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'][$info['mime'] ?? ''] ?? null;
    if (!$info || !$ext) fail('Formato não aceito. Envie GIF, WebP, PNG ou JPG.');
    if ($info[0] * $info[1] > 16_000_000) fail('Imagem grande demais.');
    if ($row['user_id'] !== null && empty($row['media']) && (int) Db::val("SELECT COUNT(*) FROM exercises WHERE user_id=? AND media IS NOT NULL", [$u['id']]) >= 20) fail('Você já usou animação em 20 exercícios. Remova uma para enviar outra.', 422);
    $bytes = (string) file_get_contents($f['tmp_name']);
    if (preg_match('/<\?|<script|<html|javascript:/i', $bytes)) fail('O arquivo contém conteúdo suspeito e foi recusado.');
    if (in_array($ext, ['png', 'jpg'], true) && function_exists('imagecreatefromstring')) { // regrava: descarta qualquer coisa escondida no arquivo
        $im = @imagecreatefromstring($bytes);
        if (!$im) fail('Não consegui ler essa imagem.');
        $w = imagesx($im); $h = imagesy($im); $k = min(1, 800 / max($w, $h));
        $d = imagecreatetruecolor(max(1, (int) round($w * $k)), max(1, (int) round($h * $k)));
        imagealphablending($d, false); imagesavealpha($d, true); imagefill($d, 0, 0, imagecolorallocatealpha($d, 255, 255, 255, 127));
        imagecopyresampled($d, $im, 0, 0, 0, 0, imagesx($d), imagesy($d), $w, $h);
        $tmp = tempnam(sys_get_temp_dir(), 'mt'); imagepng($d, $tmp, 6); $bytes = (string) file_get_contents($tmp); @unlink($tmp); $ext = 'png';
    }
    $dir = APP_ROOT . '/uploads/exercicios';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $name = 'ex' . $row['id'] . '-' . bin2hex(random_bytes(6)) . '.' . $ext;
    if (file_put_contents("$dir/$name", $bytes) === false) fail('Não consegui salvar o arquivo (permissão da pasta uploads).', 500);
    if (!empty($row['media']) && str_starts_with($row['media'], 'uploads/')) @unlink(APP_ROOT . '/' . strtok($row['media'], '?'));
    Db::run('UPDATE exercises SET media=? WHERE id=?', ["uploads/exercicios/$name", $row['id']]);
    j(['exercise' => ex_out(Db::one('SELECT * FROM exercises WHERE id=?', [$row['id']]))]);
}


/* ---------- Registro de atividades ---------- */
const AUDIT_TEXT = ['pagbank_cartao' => 'mudou os cartões aceitos', 'pagbank_conectado' => 'conectou a conta PagBank', 'pagbank_removido' => 'desconectou a conta PagBank', 'fotos_vistas' => 'viu as fotos', 'ficha_vista' => 'abriu a ficha', 'treino_editado' => 'editou o treino', 'personal_alterado' => 'trocou o personal', 'senha_redefinida' => 'redefiniu a senha',
    'status_alterado' => 'mudou o acesso para', 'validade_alterada' => 'mudou a validade', 'aprovado' => 'aprovou o cadastro', 'usuario_excluido' => 'excluiu',
    'exercicio_enviado' => 'enviou para aprovação', 'exercicio_aprovado' => 'aprovou na lista geral', 'exercicio_recusado' => 'recusou na lista geral',
    'pagamento' => 'pagamento confirmado', 'pagamento_manual' => 'registrou pagamento', 'comissao_repassada' => 'repassou comissão', 'senha_recuperada' => 'redefiniu a própria senha', 'envio_manual' => 'copiou o link de senha', 'login_liberado' => 'liberou as tentativas de login'];
function audit_out(array $r): array
{
    return ['when' => iso($r['created_at']), 'action' => $r['action'], 'text' => (AUDIT_TEXT[$r['action']] ?? $r['action']) . ($r['detail'] ? ': ' . $r['detail'] : ''),
            'actor' => $r['actor_name'] ?? 'sistema', 'actor_role' => $r['actor_role'] ?? null, 'target' => $r['target_name'] ?? null];
}
const AUDIT_SELECT = 'SELECT l.*, a.name actor_name, a.role actor_role, t.name target_name FROM audit_log l LEFT JOIN users a ON a.id=l.actor_id LEFT JOIN users t ON t.id=l.target_id ';
/** O próprio aluno vê quem acessou os dados dele (transparência). */
function h_privacy_log(array $p, array $u): void
{
    $rows = Db::all(AUDIT_SELECT . "WHERE l.target_id=? AND l.actor_id <> ? ORDER BY l.id DESC LIMIT 40", [$u['id'], $u['id']]);
    j(['log' => array_map('audit_out', $rows)]);
}
function h_manage_audit(array $p, array $u): void
{
    require_role($u, 'admin', 'super');
    $cid = company_scope($u, null, false);
    $rows = Db::all(AUDIT_SELECT . ($cid ? 'WHERE l.company_id=? ' : '') . 'ORDER BY l.id DESC LIMIT 100', $cid ? [$cid] : []);
    j(['log' => array_map('audit_out', $rows)]);
}
