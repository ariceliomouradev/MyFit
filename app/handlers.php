<?php
declare(strict_types=1);

/* =====================================================================
 *  Autenticação e conta
 * ===================================================================== */
function h_me(array $p): void
{
    $u = current_user();
    j(['user' => $u ? user_public($u) : null, 'profile' => ($u && $u['role'] === 'aluno') ? profile_row((int) $u['id']) : null, 'csrf' => csrf_token(),
       'denied' => $u ? null : ($GLOBALS['ACCESS_DENIED'] ?? null),
       'brand' => brand_effective($u['company_id'] ?? null),
       'registration' => (bool) cfg('allow_registration', true), 'version' => APP_VERSION]);
}

/**
 * Limites de tentativas de login (cada tentativa é gravada ANTES de conferir a senha, então rajadas paralelas também contam):
 *   por IP: 15 / 15 min  ·  por IP + e-mail: 8 / 15 min  ·  por e-mail (de qualquer IP): 60 / 15 min.
 * O limite "fino" é por IP + e-mail: quem erra a senha de outra pessoa trava só o próprio IP, não a vítima.
 */
function throttle_login(string $email): void
{
    Db::run('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 1 DAY)');
    $ip = client_ip();
    Db::run('INSERT INTO login_attempts (ip,email,created_at) VALUES (?,?,?)', [$ip, mb_substr($email, 0, 190), now()]);
    $w = 'created_at > (NOW() - INTERVAL 15 MINUTE)';
    $byIp = (int) Db::val("SELECT COUNT(*) FROM login_attempts WHERE ip=? AND email <> '__register__' AND $w", [$ip]);
    $byPair = (int) Db::val("SELECT COUNT(*) FROM login_attempts WHERE ip=? AND email=? AND $w", [$ip, mb_substr($email, 0, 190)]);
    $byEmail = (int) Db::val("SELECT COUNT(*) FROM login_attempts WHERE email=? AND $w", [mb_substr($email, 0, 190)]);
    if ($byIp > 15 || $byPair > 8 || $byEmail > 60) fail('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429);
}

function login_session(int $uid, int $pwdVersion = 0): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = $uid;
    $_SESSION['pv'] = $pwdVersion;
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
}

function norm_whatsapp(mixed $v, bool $required = true): ?string
{
    $d = preg_replace('/\D+/', '', (string) $v) ?? '';
    if ($d === '') { if ($required) fail('Informe o WhatsApp com DDD.'); return null; }
    if (strlen($d) < 10 || strlen($d) > 15) fail('WhatsApp inválido: informe DDD e número (ex.: 85 98888-7777).');
    return $d;
}

/** Cadastro do aluno: precisa do código da empresa e fica PENDENTE até o administrador aprovar. */
/** Máx. 10 cadastros por IP por hora (evita spam de cadastros pendentes e adivinhação de código de empresa). */
function throttle_register(): void
{
    if ((int) Db::val("SELECT COUNT(*) FROM login_attempts WHERE ip=? AND email='__register__' AND created_at > (NOW() - INTERVAL 1 HOUR)", [client_ip()]) >= 10) fail('Muitas tentativas de cadastro. Tente de novo mais tarde.', 429);
    Db::run("INSERT INTO login_attempts (ip,email,created_at) VALUES (?, '__register__', ?)", [client_ip(), now()]);
}

function h_register(array $p): void
{
    throttle_register();
    if (!cfg('allow_registration', true)) fail('O auto-cadastro está fechado. Peça à sua empresa para criar o seu acesso.', 403);
    $in = body();
    $name  = v_str($in['name'] ?? null, 'Nome', 2, 80);
    $email = strtolower(v_str($in['email'] ?? null, 'E-mail', 5, 190));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('E-mail inválido.');
    $wa = norm_whatsapp($in['whatsapp'] ?? '');
    $pass = $in['password'] ?? '';
    if (!is_string($pass) || strlen($pass) < 8 || strlen($pass) > 200) fail('A senha precisa ter pelo menos 8 caracteres.');
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', is_string($in['company_code'] ?? null) ? $in['company_code'] : '') ?? '');
    $company = $code === '' ? null : Db::one("SELECT id,name,status FROM companies WHERE code=?", [$code]);
    if (!$company || $company['status'] !== 'ativa') fail('Código da empresa inválido. Peça o código ao seu personal ou à academia.');
    if (Db::val('SELECT 1 FROM users WHERE email=?', [$email])) fail('Este e-mail já está cadastrado.', 409);
    Db::run("INSERT INTO users (name,email,password_hash,whatsapp,role,status,company_id,created_at) VALUES (?,?,?,?, 'aluno','pendente',?,?)",
        [$name, $email, hash_pw($pass), $wa, $company['id'], now()]);
    j(['pending' => true, 'company' => $company['name'], 'message' => 'Cadastro enviado! Assim que a ' . $company['name'] . ' aprovar, você poderá entrar.'], 201);
}

function h_login(array $p): void
{
    $in = body();
    $email = strtolower(trim(is_string($in['email'] ?? null) ? $in['email'] : ''));
    $pass  = is_string($in['password'] ?? null) ? $in['password'] : '';
    if ($email === '' || $pass === '') fail('Informe e-mail e senha.');
    throttle_login($email);
    $row = Db::one(USER_SELECT . 'WHERE u.email=?', [$email]);
    // Sempre confere um hash, mesmo sem usuário: a resposta demora igual e não revela se o e-mail existe.
    $okPass = password_verify($pass, $row['password_hash'] ?? DUMMY_HASH);
    if (!$row || !$okPass) fail('E-mail ou senha incorretos.', 401);
    // A senha está certa: agora conferimos aprovação, bloqueio e validade (e dizemos o motivo).
    if ($reason = access_denied_reason($row)) fail($reason, 403);
    if (password_needs_rehash($row['password_hash'], PASSWORD_BCRYPT, ['cost' => PW_COST])) {
        Db::run('UPDATE users SET password_hash=? WHERE id=?', [hash_pw($pass), $row['id']]);
    }
    Db::run('DELETE FROM login_attempts WHERE ip=? AND email=?', [client_ip(), mb_substr($email, 0, 190)]);
    Db::run('UPDATE users SET last_login=? WHERE id=?', [now(), $row['id']]);
    login_session((int) $row['id'], (int) $row['pwd_version']);
    unset($row['password_hash']);
    j(['user' => user_public($row), 'csrf' => csrf_token()]);
}

function h_logout(array $p): void
{
    start_session();
    $_SESSION = [];
    session_destroy();
    j(['ok' => true]);
}

function h_me_update(array $p, array $u): void
{
    $in = body();
    $name = v_str($in['name'] ?? $u['name'], 'Nome', 2, 80);
    $unit = ($in['unit'] ?? $u['unit']) === 'lb' ? 'lb' : 'kg';
    $ws   = v_int($in['week_start'] ?? $u['week_start'], 'Início da semana', 0, 1);
    $wa = array_key_exists('whatsapp', $in) ? norm_whatsapp($in['whatsapp'], $u['role'] === 'aluno') : $u['whatsapp'];
    $every = v_int($in['eval_every_days'] ?? $u['eval_every_days'], 'Intervalo das avaliações', 7, 120);
    Db::run('UPDATE users SET name=?, unit=?, week_start=?, whatsapp=?, eval_every_days=? WHERE id=?', [$name, $unit, $ws, $wa, $every, $u['id']]);
    j(['user' => user_public(array_merge($u, ['name' => $name, 'unit' => $unit, 'week_start' => $ws, 'whatsapp' => $wa, 'eval_every_days' => $every]))]);
}

function h_password(array $p, array $u): void
{
    $in = body();
    $row = Db::one('SELECT password_hash FROM users WHERE id=?', [$u['id']]);
    if (!password_verify(is_string($in['current'] ?? null) ? $in['current'] : '', $row['password_hash'])) fail('Senha atual incorreta.', 403);
    $new = $in['new'] ?? '';
    if (!is_string($new) || strlen($new) < 8 || strlen($new) > 200) fail('A nova senha precisa ter pelo menos 8 caracteres.');
    if (hash_equals(is_string($in['current'] ?? null) ? $in['current'] : '', $new)) fail('A nova senha precisa ser diferente da atual.');
    Db::run('UPDATE users SET password_hash=?, must_change_password=0, pwd_version=pwd_version+1 WHERE id=?', [hash_pw($new), $u['id']]);
    start_session(); $_SESSION['pv'] = (int) Db::val('SELECT pwd_version FROM users WHERE id=?', [$u['id']]);
    session_regenerate_id(true);
    j(['ok' => true]);
}

function h_me_delete(array $p, array $u): void
{
    $row = Db::one('SELECT password_hash FROM users WHERE id=?', [$u['id']]);
    if (!password_verify(is_string(body()['password'] ?? null) ? body()['password'] : '', $row['password_hash'])) fail('Senha incorreta.', 403);
    Db::run('UPDATE users SET personal_id=NULL WHERE personal_id=?', [$u['id']]);
    purge_user_files((int) $u['id']);
    Db::run('DELETE FROM users WHERE id=?', [$u['id']]);
    h_logout([]);
}

/* =====================================================================
 *  Exercícios
 * ===================================================================== */
const MUSCLES = ['peito', 'costas', 'ombros', 'biceps', 'triceps', 'antebracos', 'abdomen', 'quadriceps', 'posteriores', 'gluteos', 'panturrilhas', 'cardio', 'corpo_inteiro'];
const EQUIPMENT = ['barra', 'halteres', 'maquina', 'cabo', 'peso_corporal', 'kettlebell', 'elastico', 'outro'];

function ex_out(array $r, bool $full = false): array
{
    $o = ['id' => (int) $r['id'], 'name' => $r['name'], 'muscle' => $r['muscle'], 'equipment' => $r['equipment'],
          'type' => $r['type'], 'mine' => $r['user_id'] !== null, 'shared' => $r['company_id'] !== null && $r['user_id'] === null, 'media' => $r['media'] ?? null,
          'level' => (int) ($r['level'] ?? 1), 'environment' => $r['environment'] ?? 'ambos', 'role' => $r['role'] ?? 'composto',
          'impact' => $r['impact'] ?? 'baixo', 'target' => $r['target'] ?? null,
          'secondary' => ($r['secondary'] ?? '') === '' || ($r['secondary'] ?? null) === null ? [] : explode(',', $r['secondary'])];
    if ($full) {
        $dec = static fn($v) => $v ? (json_decode($v, true) ?: []) : [];
        $o += ['pace' => $r['pace'] ?? null, 'rep_def' => $r['rep_def'] ?? null, 'hold_sec' => isset($r['hold_sec']) ? (int) $r['hold_sec'] : null,
               'steps' => $dec($r['steps'] ?? null), 'tips' => $dec($r['tips'] ?? null), 'mistakes' => $dec($r['mistakes'] ?? null)];
    }
    return $o;
}
/** Exercício visível para o usuário: catálogo geral, os da própria empresa e os que ele mesmo criou. */
function ex_accessible(int $exId, int $uid): ?array
{
    $cid = current_user()['company_id'] ?? null;
    return Db::one('SELECT * FROM exercises WHERE id=? AND (user_id=? OR (user_id IS NULL AND (company_id IS NULL OR company_id=?)))', [$exId, $uid, $cid]);
}
/** Quem pode editar/apagar: o dono, ou personal/administrador da empresa dona. O gestor geral edita qualquer um. */
function ex_manageable(array $row, array $u): bool
{
    if ($u['role'] === 'super') return true;
    if ($row['user_id'] !== null) return (int) $row['user_id'] === (int) $u['id'];
    return $row['company_id'] !== null && (int) $row['company_id'] === (int) $u['company_id'] && in_array($u['role'], ['admin', 'personal'], true);
}

function h_exercise_get(array $p, array $u): void
{
    $r = ex_accessible((int) $p['id'], (int) $u['id']);
    if (!$r) fail('Exercício não encontrado.', 404);
    j(['exercise' => ex_out($r, true)]);
}

function h_exercises(array $p, array $u): void
{
    $rows = Db::all('SELECT * FROM exercises WHERE user_id=? OR (user_id IS NULL AND (company_id IS NULL OR company_id=?)) ORDER BY name', [$u['id'], $u['company_id']]);
    j(['exercises' => array_map('ex_out', $rows)]);
}

function ex_input(): array
{
    $in = body();
    $name = v_str($in['name'] ?? null, 'Nome', 2, 120);
    $muscle = $in['muscle'] ?? '';
    $equip  = $in['equipment'] ?? 'outro';
    if (!in_array($muscle, MUSCLES, true)) fail('Grupo muscular inválido.');
    if (!in_array($equip, EQUIPMENT, true)) fail('Equipamento inválido.');
    $type = ($in['type'] ?? 'reps') === 'time' ? 'time' : 'reps';
    return [$name, $muscle, $equip, $type];
}

function h_exercise_create(array $p, array $u): void
{
    [$name, $muscle, $equip, $type] = ex_input();
    if ((int) Db::val('SELECT COUNT(*) FROM exercises WHERE user_id=?', [$u['id']]) >= 30) fail('Você já tem 30 exercícios próprios. Exclua algum para criar outro.', 422);
    if (Db::val('SELECT 1 FROM exercises WHERE name=? AND (user_id=? OR (user_id IS NULL AND (company_id IS NULL OR company_id=?)))', [$name, $u['id'], $u['company_id']])) fail('Já existe um exercício com esse nome.', 409);
    Db::run('INSERT INTO exercises (user_id,name,muscle,equipment,type,created_at) VALUES (?,?,?,?,?,?)', [$u['id'], $name, $muscle, $equip, $type, now()]);
    j(['exercise' => ex_out(Db::one('SELECT * FROM exercises WHERE id=?', [Db::id()]))], 201);
}

function h_exercise_update(array $p, array $u): void
{
    $row = Db::one('SELECT * FROM exercises WHERE id=?', [(int) $p['id']]);
    if (!$row || !ex_manageable($row, $u)) fail('Exercício não encontrado (só os seus podem ser editados).', 404);
    [$name, $muscle, $equip, $type] = ex_input();
    Db::run('UPDATE exercises SET name=?, muscle=?, equipment=?, type=? WHERE id=?', [$name, $muscle, $equip, $type, $row['id']]);
    j(['exercise' => ex_out(Db::one('SELECT * FROM exercises WHERE id=?', [$row['id']]))]);
}

function h_exercise_delete(array $p, array $u): void
{
    $row = Db::one('SELECT * FROM exercises WHERE id=?', [(int) $p['id']]);
    if (!$row || !ex_manageable($row, $u) || ($row['user_id'] === null && $row['company_id'] === null && $u['role'] !== 'super')) fail('Exercício não encontrado (só os seus podem ser removidos).', 404);
    if ($row['user_id'] === null) { // geral ou da empresa: pode estar no histórico de outras pessoas
        $uses = (int) Db::val('SELECT (SELECT COUNT(*) FROM routine_exercises WHERE exercise_id=?) + (SELECT COUNT(*) FROM workout_exercises WHERE exercise_id=?) + (SELECT COUNT(*) FROM workout_sets WHERE exercise_id=?)', [$row['id'], $row['id'], $row['id']]);
        if ($uses > 0) fail('Este exercício está em uso nos treinos ou no histórico de alunos e não pode ser excluído (apagaria o histórico deles). Edite-o ou deixe de usá-lo nas rotinas.', 409);
    }
    Db::run('DELETE FROM exercises WHERE id=?', [$row['id']]);
    if (!empty($row['media']) && str_starts_with($row['media'], 'uploads/')) @unlink(APP_ROOT . '/' . strtok($row['media'], '?'));
    j(['ok' => true]);
}

/* =====================================================================
 *  Rotinas
 * ===================================================================== */
function routines_for(int $uid, ?int $only = null): array
{
    $sql = 'SELECT id,name,weekday,generated,description FROM routines WHERE user_id=?' . ($only ? ' AND id=?' : '') . ' ORDER BY (weekday IS NULL), weekday, position, id';
    $rs = Db::all($sql, $only ? [$uid, $only] : [$uid]);
    if (!$rs) return [];
    $ids = array_column($rs, 'id');
    $in = implode(',', array_fill(0, count($ids), '?'));
    $items = Db::all("SELECT re.routine_id, re.exercise_id, re.sets, re.reps_min, re.reps_max, re.rest_sec, e.name, e.muscle, e.type, e.media, e.role, e.equipment
                      FROM routine_exercises re JOIN exercises e ON e.id=re.exercise_id
                      WHERE re.routine_id IN ($in) ORDER BY re.position, re.id", $ids);
    $by = [];
    foreach ($items as $it) {
        $rid = $it['routine_id'];
        unset($it['routine_id']);
        $by[$rid][] = numify($it, [], ['exercise_id', 'sets', 'reps_min', 'reps_max', 'rest_sec']);
    }
    return array_map(fn($r) => [
        'id' => (int) $r['id'], 'name' => $r['name'],
        'weekday' => $r['weekday'] === null ? null : (int) $r['weekday'],
        'generated' => (bool) $r['generated'], 'description' => $r['description'],
        'exercises' => $by[$r['id']] ?? [],
    ], $rs);
}

function h_routines(array $p, array $u): void { j(['routines' => routines_for((int) $u['id'])]); }

function routine_save(?int $id, array $u): int
{
    $in = body();
    $name = v_str($in['name'] ?? null, 'Nome da rotina', 2, 80);
    $wd = $in['weekday'] ?? null;
    $wd = ($wd === null || $wd === '') ? null : v_int($wd, 'Dia da semana', 0, 6);
    $items = $in['exercises'] ?? [];
    if (!is_array($items) || count($items) > 40) fail('Lista de exercícios inválida.');
    $pdo = Db::pdo();
    $pdo->beginTransaction();
    try {
        if ($id) {
            if (!Db::val('SELECT 1 FROM routines WHERE id=? AND user_id=?', [$id, $u['id']])) { $pdo->rollBack(); fail('Rotina não encontrada.', 404); }
            Db::run('UPDATE routines SET name=?, weekday=? WHERE id=?', [$name, $wd, $id]);
            Db::run('DELETE FROM routine_exercises WHERE routine_id=?', [$id]);
        } else {
            Db::run('INSERT INTO routines (user_id,name,weekday,position) VALUES (?,?,?,?)', [$u['id'], $name, $wd, (int) Db::val('SELECT COUNT(*) FROM routines WHERE user_id=?', [$u['id']])]);
            $id = Db::id();
        }
        $pos = 0;
        foreach ($items as $it) {
            if (!is_array($it)) continue;
            $exId = v_int($it['exercise_id'] ?? 0, 'Exercício', 1, PHP_INT_MAX);
            if (!ex_accessible($exId, (int) $u['id'])) { $pdo->rollBack(); fail('Exercício inválido.'); }
            $rmin = v_int($it['reps_min'] ?? 8, 'Repetições mínimas', 1, 300);
            $rmax = max($rmin, v_int($it['reps_max'] ?? 12, 'Repetições máximas', 1, 300));
            Db::run('INSERT INTO routine_exercises (routine_id,exercise_id,sets,reps_min,reps_max,rest_sec,position) VALUES (?,?,?,?,?,?,?)',
                [$id, $exId, v_int($it['sets'] ?? 3, 'Séries', 1, 20), $rmin, $rmax, v_int($it['rest_sec'] ?? 90, 'Descanso', 0, 900), $pos++]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return $id;
}

function h_routine_create(array $p, array $u): void { $id = routine_save(null, $u); j(['routine' => routines_for((int) $u['id'], $id)[0]], 201); }
function h_routine_update(array $p, array $u): void { $id = routine_save((int) $p['id'], $u); j(['routine' => routines_for((int) $u['id'], $id)[0]]); }
function h_routine_delete(array $p, array $u): void
{
    if (!Db::run('DELETE FROM routines WHERE id=? AND user_id=?', [(int) $p['id'], $u['id']])->rowCount()) fail('Rotina não encontrada.', 404);
    j(['ok' => true]);
}

/* =====================================================================
 *  Treinos
 * ===================================================================== */
function suggest(array $last, array $we, string $unit, string $type): array
{
    $reps = (int) $we['reps_min'];
    if (!$last) return ['weight' => null, 'reps' => $reps];
    if ($type === 'time') return ['weight' => 0.0, 'reps' => (int) $last[0]['reps']];
    $top = max(array_column($last, 'weight'));
    $atTop = array_values(array_filter($last, fn($s) => (float) $s['weight'] === (float) $top));
    $needed = min((int) $we['sets_planned'], count($last));
    $allMax = count($atTop) >= $needed && !array_filter($atTop, fn($s) => (int) $s['reps'] < (int) $we['reps_max']);
    if ($allMax && $top > 0) return ['weight' => $top + ($unit === 'lb' ? 5.0 : 2.5), 'reps' => $reps];
    $lastTopReps = (int) ($atTop[0]['reps'] ?? $reps);
    return ['weight' => (float) $top, 'reps' => max($reps, min((int) $we['reps_max'], $lastTopReps + ($top > 0 ? 0 : 1)))];
}

function last_sets(int $uid, int $exId, int $exceptWorkout, string $before): array
{
    $wid = Db::val('SELECT ws.workout_id FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id
                    WHERE w.user_id=? AND ws.exercise_id=? AND w.id<>? AND w.started_at<=? AND ws.reps>0
                    ORDER BY w.started_at DESC, w.id DESC LIMIT 1', [$uid, $exId, $exceptWorkout, $before]);
    if (!$wid) return [];
    $rows = Db::all('SELECT set_no,weight,reps FROM workout_sets WHERE workout_id=? AND exercise_id=? AND reps>0 ORDER BY set_no', [$wid, $exId]);
    return array_map(fn($r) => numify($r, ['weight'], ['set_no', 'reps']), $rows);
}

function workout_detail(int $id, array $u): array
{
    $w = Db::one('SELECT * FROM workouts WHERE id=? AND user_id=?', [$id, $u['id']]);
    if (!$w) fail('Treino não encontrado.', 404);
    $exs = Db::all('SELECT we.*, e.name, e.muscle, e.equipment, e.type, e.media, e.role, e.pace, e.rep_def FROM workout_exercises we
                    JOIN exercises e ON e.id=we.exercise_id WHERE we.workout_id=? ORDER BY we.position, we.id', [$id]);
    $sets = Db::all('SELECT exercise_id,set_no,weight,reps,rpe,is_pr FROM workout_sets WHERE workout_id=? ORDER BY exercise_id,set_no', [$id]);
    $bySet = [];
    foreach ($sets as $s) $bySet[$s['exercise_id']][] = numify($s, ['weight', 'rpe'], ['exercise_id', 'set_no'], ['is_pr']);
    $out = [];
    foreach ($exs as $we) {
        $last = last_sets((int) $u['id'], (int) $we['exercise_id'], $id, $w['started_at']);
        $out[] = [
            'exercise_id' => (int) $we['exercise_id'], 'name' => $we['name'], 'muscle' => $we['muscle'],
            'equipment' => $we['equipment'], 'type' => $we['type'], 'media' => $we['media'], 'role' => $we['role'], 'pace' => $we['pace'], 'rep_def' => $we['rep_def'],
            'sets_planned' => (int) $we['sets_planned'], 'reps_min' => (int) $we['reps_min'], 'reps_max' => (int) $we['reps_max'],
            'rest_sec' => (int) $we['rest_sec'],
            'last' => $last, 'suggestion' => suggest($last, $we, $u['unit'], $we['type']),
            'sets' => $bySet[$we['exercise_id']] ?? [],
        ];
    }
    return ['workout' => [
        'id' => (int) $w['id'], 'name' => $w['name'], 'routine_id' => $w['routine_id'] === null ? null : (int) $w['routine_id'],
        'started_at' => iso($w['started_at']), 'finished_at' => iso($w['finished_at']), 'notes' => $w['notes'],
    ], 'exercises' => $out];
}

function h_workout_active(array $p, array $u): void
{
    $id = Db::val('SELECT id FROM workouts WHERE user_id=? AND finished_at IS NULL ORDER BY id DESC LIMIT 1', [$u['id']]);
    j(['active' => $id ? workout_detail((int) $id, $u) : null]);
}

function h_workout_start(array $p, array $u): void
{
    $exist = Db::val('SELECT id FROM workouts WHERE user_id=? AND finished_at IS NULL ORDER BY id DESC LIMIT 1', [$u['id']]);
    if ($exist) j(workout_detail((int) $exist, $u) + ['resumed' => true]);
    $in = body();
    $rid = isset($in['routine_id']) && $in['routine_id'] !== null ? v_int($in['routine_id'], 'Rotina', 1, PHP_INT_MAX) : null;
    $name = 'Treino livre';
    $items = [];
    if ($rid) {
        $r = routines_for((int) $u['id'], $rid)[0] ?? null;
        if (!$r) fail('Rotina não encontrada.', 404);
        $name = $r['name'];
        $items = $r['exercises'];
    }
    Db::run('INSERT INTO workouts (user_id,routine_id,name,started_at) VALUES (?,?,?,?)', [$u['id'], $rid, $name, now()]);
    $wid = Db::id();
    foreach ($items as $i => $it) {
        Db::run('INSERT INTO workout_exercises (workout_id,exercise_id,position,sets_planned,reps_min,reps_max,rest_sec) VALUES (?,?,?,?,?,?,?)',
            [$wid, $it['exercise_id'], $i, $it['sets'], $it['reps_min'], $it['reps_max'], $it['rest_sec']]);
    }
    j(workout_detail($wid, $u) + ['resumed' => false], 201);
}

function h_workout_get(array $p, array $u): void { j(workout_detail((int) $p['id'], $u)); }

function own_workout(int $id, array $u): array
{
    $w = Db::one('SELECT * FROM workouts WHERE id=? AND user_id=?', [$id, $u['id']]);
    if (!$w) fail('Treino não encontrado.', 404);
    return $w;
}

function h_workout_add_exercise(array $p, array $u): void
{
    $w = own_workout((int) $p['id'], $u);
    $exId = v_int(body()['exercise_id'] ?? 0, 'Exercício', 1, PHP_INT_MAX);
    if (!ex_accessible($exId, (int) $u['id'])) fail('Exercício inválido.');
    if (!Db::val('SELECT 1 FROM workout_exercises WHERE workout_id=? AND exercise_id=?', [$w['id'], $exId])) {
        $pos = (int) Db::val('SELECT COALESCE(MAX(position),-1)+1 FROM workout_exercises WHERE workout_id=?', [$w['id']]);
        Db::run('INSERT INTO workout_exercises (workout_id,exercise_id,position) VALUES (?,?,?)', [$w['id'], $exId, $pos]);
    }
    j(workout_detail((int) $w['id'], $u));
}

function h_workout_remove_exercise(array $p, array $u): void
{
    $w = own_workout((int) $p['id'], $u);
    Db::run('DELETE FROM workout_sets WHERE workout_id=? AND exercise_id=?', [$w['id'], (int) $p['exid']]);
    Db::run('DELETE FROM workout_exercises WHERE workout_id=? AND exercise_id=?', [$w['id'], (int) $p['exid']]);
    j(['ok' => true]);
}

function h_set_save(array $p, array $u): void
{
    $w = own_workout((int) $p['id'], $u);
    $in = body();
    $exId = v_int($in['exercise_id'] ?? 0, 'Exercício', 1, PHP_INT_MAX);
    $ex = ex_accessible($exId, (int) $u['id']);
    if (!$ex) fail('Exercício inválido.');
    if (!Db::val('SELECT 1 FROM workout_exercises WHERE workout_id=? AND exercise_id=?', [$w['id'], $exId])) fail('Exercício não faz parte deste treino.');
    $no   = v_int($in['set_no'] ?? 1, 'Série', 1, 50);
    $weight = round(v_num($in['weight'] ?? 0, 'Carga', 0, 2000), 2);
    $reps = v_int($in['reps'] ?? 0, 'Repetições', 0, 5000);
    $rpe  = isset($in['rpe']) && $in['rpe'] !== '' && $in['rpe'] !== null ? round(v_num($in['rpe'], 'RPE', 1, 10) * 2) / 2 : null;

    // Recorde: comparado com todas as séries anteriores do usuário neste exercício.
    $pr = 0;
    if ($reps > 0) {
        if ($weight > 0) {
            $prev = Db::val('SELECT MAX(ws.weight*(1+ws.reps/30)) FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id
                             WHERE w.user_id=? AND ws.exercise_id=? AND ws.weight>0 AND ws.reps>0
                             AND NOT (ws.workout_id=? AND ws.set_no=?)', [$u['id'], $exId, $w['id'], $no]);
            $pr = ($prev !== null && epley($weight, $reps) > (float) $prev + 0.0001) ? 1 : 0;
        } else {
            $prev = Db::val('SELECT MAX(ws.reps) FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id
                             WHERE w.user_id=? AND ws.exercise_id=? AND ws.weight=0 AND ws.reps>0
                             AND NOT (ws.workout_id=? AND ws.set_no=?)', [$u['id'], $exId, $w['id'], $no]);
            $pr = ($prev !== null && $reps > (int) $prev) ? 1 : 0;
        }
    }
    Db::run('INSERT INTO workout_sets (workout_id,exercise_id,set_no,weight,reps,rpe,is_pr) VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE weight=VALUES(weight), reps=VALUES(reps), rpe=VALUES(rpe), is_pr=VALUES(is_pr)',
        [$w['id'], $exId, $no, $weight, $reps, $rpe, $pr]);
    j(['set' => ['exercise_id' => $exId, 'set_no' => $no, 'weight' => $weight, 'reps' => $reps, 'rpe' => $rpe, 'is_pr' => (bool) $pr]]);
}

function h_set_delete(array $p, array $u): void
{
    $w = own_workout((int) $p['id'], $u);
    Db::run('DELETE FROM workout_sets WHERE workout_id=? AND exercise_id=? AND set_no=?', [$w['id'], (int) $p['exid'], (int) $p['no']]);
    j(['ok' => true]);
}

function h_workout_finish(array $p, array $u): void
{
    $w = own_workout((int) $p['id'], $u);
    $in = body();
    $notes = isset($in['notes']) && is_string($in['notes']) && trim($in['notes']) !== '' ? mb_substr(trim($in['notes']), 0, 500) : null;
    $count = (int) Db::val('SELECT COUNT(*) FROM workout_sets WHERE workout_id=? AND reps>0', [$w['id']]);
    if ($count === 0 && $w['finished_at'] === null) { // só treino em andamento e vazio é descartado
        Db::run('DELETE FROM workouts WHERE id=?', [$w['id']]);
        j(['deleted' => true]);
    }
    if ($w['finished_at'] === null) Db::run('UPDATE workouts SET finished_at=?, notes=? WHERE id=?', [now(), $notes, $w['id']]);
    elseif ($notes !== null) Db::run('UPDATE workouts SET notes=? WHERE id=?', [$notes, $w['id']]);
    $s = Db::one('SELECT COUNT(*) sets, COALESCE(SUM(weight*reps),0) volume, COALESCE(SUM(is_pr),0) prs FROM workout_sets WHERE workout_id=? AND reps>0', [$w['id']]);
    j(['deleted' => false, 'summary' => numify($s, ['volume'], ['sets', 'prs'])]);
}

function h_workout_notes(array $p, array $u): void
{
    $w = own_workout((int) $p['id'], $u);
    $n = body()['notes'] ?? '';
    $notes = is_string($n) && trim($n) !== '' ? mb_substr(trim($n), 0, 500) : null;
    Db::run('UPDATE workouts SET notes=? WHERE id=?', [$notes, $w['id']]);
    j(['notes' => $notes]);
}

function h_workout_delete(array $p, array $u): void
{
    own_workout((int) $p['id'], $u);
    Db::run('DELETE FROM workouts WHERE id=?', [(int) $p['id']]);
    j(['ok' => true]);
}

function h_workouts(array $p, array $u): void
{
    $limit = min(60, max(1, (int) ($_GET['limit'] ?? 30)));
    $off = max(0, (int) ($_GET['offset'] ?? 0));
    $rows = Db::all("SELECT w.id, w.name, w.started_at, w.finished_at,
                       COUNT(ws.id) sets, COALESCE(SUM(ws.weight*ws.reps),0) volume,
                       COUNT(DISTINCT ws.exercise_id) exercises, COALESCE(SUM(ws.is_pr),0) prs
                     FROM workouts w LEFT JOIN workout_sets ws ON ws.workout_id=w.id AND ws.reps>0
                     WHERE w.user_id=? AND w.finished_at IS NOT NULL
                     GROUP BY w.id ORDER BY w.started_at DESC, w.id DESC LIMIT $limit OFFSET $off", [$u['id']]);
    j(['workouts' => array_map(function ($r) {
        $r = numify($r, ['volume'], ['id', 'sets', 'exercises', 'prs']);
        $r['started_at'] = iso($r['started_at']);
        $r['finished_at'] = iso($r['finished_at']);
        return $r;
    }, $rows)]);
}

/* =====================================================================
 *  Estatísticas
 * ===================================================================== */
function week_start_of(string $date, int $weekStart): string
{
    $dow = (int) date('w', strtotime($date));
    $diff = ($dow - $weekStart + 7) % 7;
    return date('Y-m-d', strtotime("$date -$diff days"));
}

function h_stats_overview(array $p, array $u): void { j(overview_data($u)); }

function overview_data(array $u): array
{
    $uid = (int) $u['id'];
    $tot = numify(Db::one("SELECT COUNT(DISTINCT w.id) workouts, COUNT(ws.id) sets, COALESCE(SUM(ws.weight*ws.reps),0) volume
        FROM workouts w LEFT JOIN workout_sets ws ON ws.workout_id=w.id AND ws.reps>0 WHERE w.user_id=? AND w.finished_at IS NOT NULL", [$uid]), ['volume'], ['workouts', 'sets']);

    $days = Db::all('SELECT DATE(started_at) d, COUNT(*) n FROM workouts WHERE user_id=? AND finished_at IS NOT NULL AND started_at >= (CURDATE() - INTERVAL 371 DAY) GROUP BY d', [$uid]);
    $heat = [];
    foreach ($days as $r) $heat[$r['d']] = (int) $r['n'];

    $ws = (int) $u['week_start'];
    $thisWeek = week_start_of(date('Y-m-d'), $ws);
    $weekCount = (int) Db::val('SELECT COUNT(*) FROM workouts WHERE user_id=? AND finished_at IS NOT NULL AND DATE(started_at) >= ?', [$uid, $thisWeek]);
    $weekVol = (float) Db::val('SELECT COALESCE(SUM(ws.weight*ws.reps),0) FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id WHERE w.user_id=? AND w.finished_at IS NOT NULL AND DATE(w.started_at) >= ?', [$uid, $thisWeek]);

    $weeks = [];
    foreach (Db::all('SELECT DISTINCT DATE(started_at) d FROM workouts WHERE user_id=? AND finished_at IS NOT NULL AND started_at >= (CURDATE() - INTERVAL 800 DAY)', [$uid]) as $r) {
        $weeks[week_start_of($r['d'], $ws)] = true;
    }
    $streak = 0;
    $cursor = $thisWeek;
    if (!isset($weeks[$cursor])) $cursor = date('Y-m-d', strtotime("$cursor -7 days")); // semana atual ainda em aberto não quebra a sequência
    while (isset($weeks[$cursor])) { $streak++; $cursor = date('Y-m-d', strtotime("$cursor -7 days")); }

    $muscles = Db::all('SELECT e.muscle, COUNT(*) sets FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id JOIN exercises e ON e.id=ws.exercise_id
        WHERE w.user_id=? AND w.finished_at IS NOT NULL AND ws.reps>0 AND w.started_at >= (NOW() - INTERVAL 30 DAY) GROUP BY e.muscle ORDER BY sets DESC', [$uid]);
    $prs = Db::all('SELECT e.name, e.type, ws.exercise_id, ws.weight, ws.reps, w.started_at FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id JOIN exercises e ON e.id=ws.exercise_id
        WHERE w.user_id=? AND ws.is_pr=1 ORDER BY w.started_at DESC, ws.id DESC LIMIT 6', [$uid]);

    return (['totals' => $tot, 'week' => ['workouts' => $weekCount, 'volume' => $weekVol], 'streak_weeks' => $streak, 'heat' => $heat,
       'muscles' => array_map(fn($r) => ['muscle' => $r['muscle'], 'sets' => (int) $r['sets']], $muscles),
       'prs' => array_map(fn($r) => ['name' => $r['name'], 'type' => $r['type'], 'exercise_id' => (int) $r['exercise_id'], 'weight' => (float) $r['weight'], 'reps' => (int) $r['reps'], 'at' => iso($r['started_at'])], $prs)]);
}

function h_stats_exercise(array $p, array $u): void
{
    $ex = ex_accessible((int) $p['id'], (int) $u['id']);
    if (!$ex) fail('Exercício não encontrado.', 404);
    $rows = Db::all('SELECT w.id, DATE(w.started_at) day, MAX(ws.weight*(1+ws.reps/30)) e1rm, MAX(ws.weight) maxw,
                       SUM(ws.weight*ws.reps) vol, SUM(ws.reps) reps, MAX(ws.reps) maxreps
                     FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id
                     WHERE w.user_id=? AND ws.exercise_id=? AND ws.reps>0 AND w.finished_at IS NOT NULL
                     GROUP BY w.id, day ORDER BY w.started_at DESC LIMIT 120', [$u['id'], $ex['id']]);
    $series = array_reverse(array_map(fn($r) => [
        'day' => $r['day'], 'e1rm' => round((float) $r['e1rm'], 1), 'maxw' => (float) $r['maxw'],
        'vol' => (float) $r['vol'], 'reps' => (int) $r['reps'], 'maxreps' => (int) $r['maxreps'],
    ], $rows));
    $rec = ['e1rm' => 0.0, 'maxw' => 0.0, 'maxreps' => 0];
    foreach ($series as $s) { $rec['e1rm'] = max($rec['e1rm'], $s['e1rm']); $rec['maxw'] = max($rec['maxw'], $s['maxw']); $rec['maxreps'] = max($rec['maxreps'], $s['maxreps']); }
    j(['exercise' => ex_out($ex), 'series' => $series, 'records' => $rec]);
}

/* =====================================================================
 *  Peso corporal
 * ===================================================================== */
function h_bw_list(array $p, array $u): void
{
    $rows = Db::all('SELECT id, day, weight FROM body_weights WHERE user_id=? ORDER BY day DESC LIMIT 400', [$u['id']]);
    j(['entries' => array_map(fn($r) => ['id' => (int) $r['id'], 'day' => $r['day'], 'weight' => (float) $r['weight']], $rows)]);
}
function h_bw_save(array $p, array $u): void
{
    $in = body();
    $day = v_date($in['day'] ?? date('Y-m-d'));
    if ($day > date('Y-m-d')) fail('A data não pode estar no futuro.');
    $w = round(v_num($in['weight'] ?? null, 'Peso', 20, 500), 1);
    Db::run('INSERT INTO body_weights (user_id,day,weight) VALUES (?,?,?) ON DUPLICATE KEY UPDATE weight=VALUES(weight)', [$u['id'], $day, $w]);
    h_bw_list([], $u);
}
function h_bw_delete(array $p, array $u): void
{
    Db::run('DELETE FROM body_weights WHERE id=? AND user_id=?', [(int) $p['id'], $u['id']]);
    h_bw_list([], $u);
}

/* =====================================================================
 *  Exportação
 * ===================================================================== */
function csv_cell(mixed $v): string
{
    $s = (string) $v;
    if ($s !== '' && strpos("=+-@\t\r", $s[0]) !== false) $s = "'" . $s; // evita injeção de fórmula no Excel
    return '"' . str_replace('"', '""', $s) . '"';
}

function h_export_json(array $p, array $u): void
{
    $uid = (int) $u['id'];
    $workouts = Db::all('SELECT id,name,started_at,finished_at,notes FROM workouts WHERE user_id=? ORDER BY started_at', [$uid]);
    foreach ($workouts as &$w) {
        $w['sets'] = Db::all('SELECT e.name exercise, ws.set_no, ws.weight, ws.reps, ws.rpe, ws.is_pr FROM workout_sets ws JOIN exercises e ON e.id=ws.exercise_id WHERE ws.workout_id=? ORDER BY ws.exercise_id, ws.set_no', [$w['id']]);
    }
    unset($w);
    $data = [
        'app' => APP_NAME, 'exported_at' => iso(now()),
        'user' => ['name' => $u['name'], 'email' => $u['email'], 'unit' => $u['unit']],
        'routines' => routines_for($uid), 'workouts' => $workouts,
        'body_weights' => Db::all('SELECT day, weight FROM body_weights WHERE user_id=? ORDER BY day', [$uid]),
    ];
    header('Content-Disposition: attachment; filename="meus-treinos-' . date('Y-m-d') . '.json"');
    j($data);
}

function h_export_csv(array $p, array $u): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="meus-treinos-' . date('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    echo "\xEF\xBB\xBF", "data;treino;exercicio;serie;carga;repeticoes;rpe;recorde\r\n";
    $st = Db::run('SELECT w.started_at, w.name wname, e.name ename, ws.set_no, ws.weight, ws.reps, ws.rpe, ws.is_pr
                   FROM workout_sets ws JOIN workouts w ON w.id=ws.workout_id JOIN exercises e ON e.id=ws.exercise_id
                   WHERE w.user_id=? ORDER BY w.started_at, ws.exercise_id, ws.set_no', [$u['id']]);
    while ($r = $st->fetch()) {
        echo implode(';', [csv_cell($r['started_at']), csv_cell($r['wname']), csv_cell($r['ename']), $r['set_no'], $r['weight'], $r['reps'], $r['rpe'] ?? '', $r['is_pr'] ? 'sim' : '']), "\r\n";
    }
    exit;
}
