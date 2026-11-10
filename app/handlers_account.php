<?php
declare(strict_types=1);

/* =====================================================================
 *  V3 · Recuperação de senha, fila de envio e planos da plataforma
 * ===================================================================== */

const RESET_MINUTES = 30;
const RESET_OK_MSG = 'Se este e-mail estiver cadastrado, enviamos o link de redefinição para ele. Confira também a caixa de spam. O link vale por 30 minutos.';

function throttle_marker(string $marker, int $perHour): void
{
    Db::run('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 1 DAY)');
    if ((int) Db::val('SELECT COUNT(*) FROM login_attempts WHERE ip=? AND email=? AND created_at > (NOW() - INTERVAL 1 HOUR)', [client_ip(), $marker]) >= $perHour) fail('Muitas tentativas. Tente de novo mais tarde.', 429);
    Db::run('INSERT INTO login_attempts (ip,email,created_at) VALUES (?,?,?)', [client_ip(), $marker, now()]);
}

/** E-mail de teste (gestor): manda uma mensagem para o próprio e-mail do gestor e diz se o servidor aceitou, com o motivo se falhar. */
function h_mail_test(array $p, array $u): void
{
    require_role($u, 'super');
    $mode = smtp_cfg() ? 'smtp' : 'mail()';
    $ok = send_email((string) $u['email'], 'Teste de e-mail do ' . brand_effective(null)['app_name'], "Se você recebeu esta mensagem, o envio de e-mail do aplicativo está funcionando.\nEnviada em " . date('d/m/Y H:i') . '.');
    j(['ok' => $ok, 'mode' => $mode, 'to' => $u['email'], 'error' => $ok ? null : (mail_last_error() ?: 'não foi possível enviar')]);
}

/** "Esqueci a senha": manda o link por e-mail (se falhar, vai para a fila do administrador). A resposta é sempre a mesma. */
function h_password_forgot(array $p): void
{
    throttle_marker('__forgot__', 8);
    $in = body();
    $email = strtolower(trim(is_string($in['email'] ?? null) ? $in['email'] : ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Informe o e-mail cadastrado, no formato nome@dominio.com.');
    respond_then_continue(['ok' => true, 'message' => RESET_OK_MSG]); // a resposta é igual e imediata; o envio acontece depois
    $u = Db::one(USER_SELECT . 'WHERE u.email=?', [$email]);
    $recent = $u ? (int) Db::val('SELECT COUNT(*) FROM password_resets WHERE user_id=? AND created_at > (NOW() - INTERVAL 1 HOUR)', [$u['id']]) : 0;
    $base = app_url();
    if ($u && $u['status'] !== 'pendente' && $recent < 3 && $base !== '') {
        $token = bin2hex(random_bytes(32));
        Db::run('INSERT INTO password_resets (user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?)',
            [$u['id'], hash('sha256', $token), date('Y-m-d H:i:s', time() + RESET_MINUTES * 60), now()]);
        $rid = Db::id();
        $app = brand_effective($u['company_id'] ? (int) $u['company_id'] : null)['app_name'];
        $text = "$app: para criar uma nova senha, abra o link (vale " . RESET_MINUTES . " minutos e só funciona uma vez):\n$base/#/redefinir/$token\nSe não foi você, ignore esta mensagem.";
        $channel = deliver_message($u, "$app: redefinição de senha", $text, 'reset');
        Db::run('UPDATE password_resets SET channel=? WHERE id=?', [$channel, $rid]);
    }
    exit;
}

/** Troca a senha com o link recebido. Uso único; encerra as outras sessões. */
function h_password_reset(array $p): void
{
    throttle_marker('__reset__', 20);
    $in = body();
    $token = is_string($in['token'] ?? null) ? $in['token'] : '';
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) fail('Link inválido ou expirado. Peça um novo em "Esqueci minha senha".', 410);
    $new = require_strong_password($in['password'] ?? '');
    $row = Db::one('SELECT r.id, r.user_id FROM password_resets r WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at > NOW()', [hash('sha256', $token)]);
    if (!$row) fail('Link inválido ou expirado. Peça um novo em "Esqueci minha senha".', 410);
    // consumir primeiro (condição no UPDATE garante uso único mesmo com duas requisições ao mesmo tempo)
    if (!Db::run('UPDATE password_resets SET used_at=? WHERE id=? AND used_at IS NULL', [now(), $row['id']])->rowCount()) fail('Link inválido ou expirado. Peça um novo em "Esqueci minha senha".', 410);
    Db::run('UPDATE users SET password_hash=?, must_change_password=0, pwd_version=pwd_version+1 WHERE id=?', [hash_pw($new), $row['user_id']]);
    Db::run('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL', [now(), $row['user_id']]); // invalida outros links pendentes
    Db::run("UPDATE outbox SET status='enviado' WHERE user_id=? AND kind='reset'", [$row['user_id']]);
    $u = Db::one('SELECT id, company_id FROM users WHERE id=?', [$row['user_id']]);
    audit($u, (int) $u['id'], 'senha_recuperada', 'pelo link enviado');
    Db::run('DELETE FROM login_attempts WHERE email=(SELECT email FROM users WHERE id=?)', [$row['user_id']]);
    j(['ok' => true, 'message' => 'Senha criada. Agora é só entrar.']);
}

/* ---------- Fila de envio (o app não conseguiu mandar sozinho) ---------- */
function h_outbox(array $p, array $u): void
{
    require_role($u, 'admin', 'super');
    Db::run("DELETE FROM outbox WHERE kind='reset' AND created_at < (NOW() - INTERVAL 1 DAY)");
    $cid = company_scope($u, null, false);
    $rows = Db::all("SELECT o.id,o.body,o.whatsapp,o.email,o.created_at,o.status, us.name FROM outbox o JOIN users us ON us.id=o.user_id WHERE o.status='pendente'" . ($cid ? ' AND o.company_id=?' : '') . ' ORDER BY o.id DESC LIMIT 30', $cid ? [$cid] : []);
    j(['items' => array_map(fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'whatsapp' => $r['whatsapp'], 'email' => $r['email'], 'text' => $r['body'], 'when' => iso($r['created_at'])], $rows)]);
}
function h_outbox_done(array $p, array $u): void
{
    require_role($u, 'admin', 'super');
    $row = Db::one('SELECT * FROM outbox WHERE id=?', [(int) $p['id']]);
    if (!$row || ($u['role'] === 'admin' && (int) $row['company_id'] !== (int) $u['company_id'])) fail('Item não encontrado.', 404);
    Db::run("UPDATE outbox SET status='enviado' WHERE id=?", [$row['id']]);
    audit($u, (int) $row['user_id'], 'envio_manual', 'link de senha');
    j(['ok' => true]);
}

/* ---------- Planos da plataforma (gestor geral) ---------- */
function plans_list(): array
{
    $rows = Db::all('SELECT p.*, (SELECT COUNT(*) FROM companies c WHERE c.plan_id=p.id) n_companies FROM plans p ORDER BY p.position, p.id');
    return array_map(fn($r) => ['id' => (int) $r['id'], 'name' => $r['name'], 'price_cents' => (int) $r['price_cents'], 'max_personals' => $r['max_personals'] === null ? null : (int) $r['max_personals'],
        'max_students' => $r['max_students'] === null ? null : (int) $r['max_students'], 'active' => (bool) $r['active'], 'companies' => (int) $r['n_companies'],
        'audience' => $r['audience'] ?? 'empresa', 'cost_cents' => (int) ($r['cost_cents'] ?? 0), 'min_margin_pct' => (float) ($r['min_margin_pct'] ?? 40), 'ceiling' => plan_ceiling($r)], $rows);
}
function h_plans(array $p, array $u): void { require_role($u, 'super'); j(['plans' => plans_list()]); }

function plan_input(): array
{
    $in = body();
    $lim = static function (mixed $v, string $label): ?int {
        if ($v === null || $v === '' || $v === false) return null; // vazio = ilimitado
        return v_int($v, $label, 1, 1_000_000);
    };
    return [v_str($in['name'] ?? null, 'Nome do plano', 2, 60), v_int($in['price_cents'] ?? 0, 'Preço', 0, 100_000_00), $lim($in['max_personals'] ?? null, 'Limite de personais'), $lim($in['max_students'] ?? null, 'Limite de alunos'), !array_key_exists('active', $in) || (bool) $in['active'],
        array_key_exists('cost_cents', $in) ? v_int($in['cost_cents'], 'Custo por conta', 0, 100_000_00) : null, array_key_exists('min_margin_pct', $in) ? v_num($in['min_margin_pct'], 'Margem mínima', 0, 95) : null,
        in_array($in['audience'] ?? 'empresa', ['empresa', 'solo'], true) ? ($in['audience'] ?? 'empresa') : fail('Público do plano inválido (academia ou personal solo).')];
}
function h_plan_save(array $p, array $u): void
{
    require_role($u, 'super');
    [$name, $price, $mp, $ms, $active, $cost, $mm, $aud] = plan_input();
    if ($cost !== null && $cost > $price) fail('O custo por conta não pode ser maior que o preço do plano.');
    if (isset($p['id'])) {
        $old = Db::one('SELECT cost_cents, min_margin_pct FROM plans WHERE id=?', [(int) $p['id']]);
        if (!$old) fail('Plano não encontrado.', 404);
        $cost ??= (int) $old['cost_cents']; $mm ??= (float) $old['min_margin_pct'];
        $oldAud = (string) Db::val('SELECT audience FROM plans WHERE id=?', [(int) $p['id']]);
        if ($oldAud !== $aud && Db::val('SELECT 1 FROM companies WHERE plan_id=?', [(int) $p['id']])) fail('Há empresas neste plano: não dá para trocar o público dele.', 409);
        if ($cost > $price) fail('O custo por conta não pode ser maior que o preço do plano.');
        Db::run('UPDATE plans SET name=?, price_cents=?, max_personals=?, max_students=?, active=?, cost_cents=?, min_margin_pct=?, audience=? WHERE id=?', [$name, $price, $mp, $ms, (int) $active, $cost, $mm, $aud, (int) $p['id']]);
        $id = (int) $p['id'];
    } else {
        Db::run('INSERT INTO plans (name,price_cents,max_personals,max_students,active,cost_cents,min_margin_pct,audience,position,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [$name, $price, $mp, $ms, (int) $active, $cost ?? 0, $mm ?? 40, $aud, (int) Db::val('SELECT COALESCE(MAX(position),0)+1 FROM plans'), now()]);
        $id = Db::id();
    }
    j(['plans' => plans_list(), 'id' => $id], isset($p['id']) ? 200 : 201);
}
function h_plan_delete(array $p, array $u): void
{
    require_role($u, 'super');
    if (Db::val('SELECT 1 FROM companies WHERE plan_id=?', [(int) $p['id']])) fail('Há empresas neste plano. Mude o plano delas antes de excluir.', 409);
    Db::run('DELETE FROM plans WHERE id=?', [(int) $p['id']]);
    j(['plans' => plans_list()]);
}
