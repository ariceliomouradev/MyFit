<?php
declare(strict_types=1);

/* =====================================================================
 *  Perfil, medidas, análise (IMC) e geração do plano de treino
 *  A lógica de verdade está em app/Planner.php; aqui só validação e banco.
 * ===================================================================== */

const MEASURE_LIMITS = [ // [mínimo, máximo] em cm
    'chest' => [50, 200], 'waist' => [40, 200], 'hip' => [50, 200], 'thigh' => [25, 120],
    'calf' => [15, 80], 'arm' => [10, 80], 'forearm' => [10, 60],
];

/** Lê e valida sexo, idade, altura, peso e medidas (todas as medidas são opcionais). */
function body_input(array $in): array
{
    $sex = $in['sex'] ?? '';
    if (!in_array($sex, ['M', 'F'], true)) fail('Escolha o sexo.');
    $age = ($in['age'] ?? '') === '' || $in['age'] === null ? null : v_int($in['age'], 'Idade', 10, 100);
    $measures = [];
    foreach (MEASURE_LIMITS as $k => [$lo, $hi]) {
        $v = $in['measures'][$k] ?? null;
        $measures[$k] = ($v === null || $v === '') ? null : round(v_num($v, 'Medida', $lo, $hi), 1);
    }
    return [
        'sex' => $sex, 'age' => $age,
        'height_cm' => round(v_num($in['height_cm'] ?? null, 'Altura (cm)', 100, 250), 1),
        'weight' => round(v_num($in['weight'] ?? null, 'Peso (kg)', 20, 400), 1),
        'measures' => $measures,
    ];
}

function profile_row(int $uid): ?array
{
    $p = Db::one('SELECT * FROM profiles WHERE user_id=?', [$uid]);
    return $p ? numify($p, ['height_cm'], ['user_id', 'age', 'days_per_week', 'level']) : null;
}

function latest_measure(int $uid): ?array
{
    $m = Db::one('SELECT * FROM measurements WHERE user_id=? ORDER BY day DESC LIMIT 1', [$uid]);
    return $m ? numify($m, ['weight', 'chest', 'waist', 'hip', 'thigh', 'calf', 'arm', 'forearm'], ['id']) : null;
}

function analysis_for(array $profile, array $m): array
{
    return Planner::analyze([
        'sex' => $profile['sex'], 'height_cm' => $profile['height_cm'], 'weight' => $m['weight'],
        'measures' => array_intersect_key($m, MEASURE_LIMITS),
    ]);
}

function h_profile(array $p, array $u): void
{
    $uid = (int) $u['id'];
    $profile = profile_row($uid);
    $m = latest_measure($uid);
    j(['profile' => $profile, 'measure' => $m,
       'analysis' => ($profile && $m) ? analysis_for($profile, $m) : null,
       'generated_routines' => (int) Db::val('SELECT COUNT(*) FROM routines WHERE user_id=? AND generated=1', [$uid])]);
}

/** Só calcula (não grava): usado na tela de resultado do IMC antes de escolher o objetivo. */
function h_analyze(array $p, array $u): void
{
    $b = body_input(body());
    j(['analysis' => Planner::analyze($b)]);
}

function save_measurement(int $uid, string $day, float $weight, array $measures): void
{
    Db::run('INSERT INTO measurements (user_id,day,weight,chest,waist,hip,thigh,calf,arm,forearm) VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE weight=VALUES(weight),chest=VALUES(chest),waist=VALUES(waist),hip=VALUES(hip),
             thigh=VALUES(thigh),calf=VALUES(calf),arm=VALUES(arm),forearm=VALUES(forearm)',
        [$uid, $day, $weight, $measures['chest'] ?? null, $measures['waist'] ?? null, $measures['hip'] ?? null,
         $measures['thigh'] ?? null, $measures['calf'] ?? null, $measures['arm'] ?? null, $measures['forearm'] ?? null]);
    Db::run('INSERT INTO body_weights (user_id,day,weight) VALUES (?,?,?) ON DUPLICATE KEY UPDATE weight=VALUES(weight)', [$uid, $day, $weight]);
}

/** Apaga os planos gerados antes e grava os novos (as rotinas feitas à mão ficam intactas). */
function generate_plan(array $u, array $profile, array $m): array
{
    $uid = (int) $u['id'];
    $analysis = analysis_for($profile, $m);
    $catalog = Db::all('SELECT id,slug,muscle,equipment,environment,role,level,impact,type,target FROM exercises WHERE user_id IS NULL AND (company_id IS NULL OR company_id=?) AND NOT (user_id IS NULL AND company_id IS NULL AND slug IS NOT NULL AND media IS NULL)', [$u['company_id']]);
    $plan = Planner::build($profile, $analysis, $catalog, $uid);

    $pdo = Db::pdo();
    $pdo->beginTransaction();
    try {
        Db::run('DELETE FROM routines WHERE user_id=? AND generated=1', [$uid]);
        $pos = (int) Db::val('SELECT COALESCE(MAX(position),-1)+1 FROM routines WHERE user_id=?', [$uid]);
        foreach ($plan['routines'] as $r) {
            Db::run('INSERT INTO routines (user_id,name,weekday,position,generated,description) VALUES (?,?,?,?,1,?)',
                [$uid, $r['name'], $r['weekday'], $pos++, $r['description']]);
            $rid = Db::id();
            foreach ($r['items'] as $i => $it) {
                Db::run('INSERT INTO routine_exercises (routine_id,exercise_id,sets,reps_min,reps_max,rest_sec,position) VALUES (?,?,?,?,?,?,?)',
                    [$rid, $it['exercise_id'], $it['sets'], $it['reps_min'], $it['reps_max'], $it['rest_sec'], $i]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['analysis' => $analysis, 'coverage' => $plan['coverage'], 'routines' => routines_for($uid)];
}

/** Assistente completo: grava perfil + medidas, calcula o IMC e já monta o plano. */
function h_onboarding(array $p, array $u): void
{
    $in = body();
    $b = body_input($in);
    $goal = $in['goal'] ?? '';
    $env = $in['environment'] ?? '';
    if (!in_array($goal, ['perder_peso', 'ganhar_massa'], true)) fail('Escolha o objetivo.');
    if (!in_array($env, ['casa', 'academia'], true)) fail('Escolha onde você vai treinar.');
    $days = v_int($in['days_per_week'] ?? 3, 'Dias por semana', 2, 5);
    $level = v_int($in['level'] ?? 1, 'Experiência', 1, 3);
    if (!empty($in['name'])) Db::run('UPDATE users SET name=? WHERE id=?', [v_str($in['name'], 'Nome', 2, 80), $u['id']]);

    Db::run('INSERT INTO profiles (user_id,sex,age,height_cm,goal,environment,days_per_week,level,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE sex=VALUES(sex),age=VALUES(age),height_cm=VALUES(height_cm),goal=VALUES(goal),
             environment=VALUES(environment),days_per_week=VALUES(days_per_week),level=VALUES(level),updated_at=VALUES(updated_at)',
        [$u['id'], $b['sex'], $b['age'], $b['height_cm'], $goal, $env, $days, $level, now()]);
    save_measurement((int) $u['id'], date('Y-m-d'), $b['weight'], $b['measures']);

    $profile = profile_row((int) $u['id']);
    j(generate_plan($u, $profile, latest_measure((int) $u['id'])) + ['profile' => $profile], 201);
}

/** Refaz o plano com o perfil salvo (opcionalmente trocando objetivo, local, dias ou experiência). */
function h_plan_regenerate(array $p, array $u): void
{
    $uid = (int) $u['id'];
    $profile = profile_row($uid);
    $m = latest_measure($uid);
    if (!$profile || !$m) fail('Responda as perguntas iniciais primeiro.', 409);
    $in = body();
    if (isset($in['goal']) && in_array($in['goal'], ['perder_peso', 'ganhar_massa'], true)) $profile['goal'] = $in['goal'];
    if (isset($in['environment']) && in_array($in['environment'], ['casa', 'academia'], true)) $profile['environment'] = $in['environment'];
    if (isset($in['days_per_week'])) $profile['days_per_week'] = v_int($in['days_per_week'], 'Dias por semana', 2, 5);
    if (isset($in['level'])) $profile['level'] = v_int($in['level'], 'Experiência', 1, 3);
    Db::run('UPDATE profiles SET goal=?,environment=?,days_per_week=?,level=?,updated_at=? WHERE user_id=?',
        [$profile['goal'], $profile['environment'], $profile['days_per_week'], $profile['level'], now(), $uid]);
    j(generate_plan($u, $profile, $m) + ['profile' => $profile]);
}

/* ---- Medidas ao longo do tempo ---- */
function h_measurements(array $p, array $u): void
{
    $rows = Db::all('SELECT * FROM measurements WHERE user_id=? ORDER BY day DESC LIMIT 200', [$u['id']]);
    $profile = profile_row((int) $u['id']);
    $m = $rows ? numify($rows[0], ['weight', 'chest', 'waist', 'hip', 'thigh', 'calf', 'arm', 'forearm'], ['id']) : null;
    j(['entries' => array_map(fn($r) => numify($r, ['weight', 'chest', 'waist', 'hip', 'thigh', 'calf', 'arm', 'forearm'], ['id']), $rows),
        'profile' => $profile, 'analysis' => ($profile && $m) ? analysis_for($profile, $m) : null]);
}

function h_measurement_save(array $p, array $u): void
{
    $in = body();
    $profile = profile_row((int) $u['id']);
    $b = body_input($in + ['sex' => $profile['sex'] ?? '', 'height_cm' => $profile['height_cm'] ?? null]);
    $day = v_date($in['day'] ?? date('Y-m-d'));
    if ($day > date('Y-m-d')) fail('A data não pode estar no futuro.');
    save_measurement((int) $u['id'], $day, $b['weight'], $b['measures']);
    h_measurements([], $u);
}

function h_measurement_delete(array $p, array $u): void
{
    Db::run('DELETE FROM measurements WHERE id=? AND user_id=?', [(int) $p['id'], $u['id']]);
    h_measurements([], $u);
}
