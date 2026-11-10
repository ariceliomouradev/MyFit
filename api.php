<?php
declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/lib.php';

// Cabeçalhos de segurança (nosniff, X-Frame-Options, Referrer-Policy...) vêm do .htaccess; o dev-router.php os repete no ambiente local.

if ($GLOBALS['CONFIG'] === null) fail('App ainda não instalado. Abra /install.php.', 503);

require __DIR__ . '/app/handlers.php';
require __DIR__ . '/app/Planner.php';
require __DIR__ . '/app/handlers_profile.php';
require __DIR__ . '/app/handlers_admin.php';
require __DIR__ . '/app/handlers_eval.php';
require __DIR__ . '/app/handlers_brand.php';
require __DIR__ . '/app/notify.php';
require __DIR__ . '/app/handlers_account.php';
require __DIR__ . '/app/handlers_finance.php';

// [método, rota, handler, exige login]
$routes = [
    ['GET',    'health',                     'h_health',               false],
    ['GET',    'me',                         'h_me',                   false],
    ['POST',   'register',                   'h_register',             false],
    ['POST',   'login',                      'h_login',                false],
    ['POST',   'logout',                     'h_logout',               false],
    ['PATCH',  'me',                         'h_me_update',            true],
    ['POST',   'password',                   'h_password',             true],
    ['DELETE', 'me',                         'h_me_delete',            true],

    ['GET',    'exercises',                  'h_exercises',            true],
    ['POST',   'exercises',                  'h_exercise_create',      true],
    ['GET',    'exercises/{id}',             'h_exercise_get',         true],
    ['PUT',    'exercises/{id}',             'h_exercise_update',      true],
    ['DELETE', 'exercises/{id}',             'h_exercise_delete',      true],

    ['GET',    'profile',                    'h_profile',              true],
    ['POST',   'analyze',                    'h_analyze',              true],
    ['POST',   'onboarding',                 'h_onboarding',           true],
    ['POST',   'plan/regenerate',            'h_plan_regenerate',      true],
    ['GET',    'measurements',               'h_measurements',         true],
    ['POST',   'measurements',               'h_measurement_save',     true],
    ['DELETE', 'measurements/{id}',          'h_measurement_delete',   true],

    ['GET',    'evaluations',                'h_evaluations',          true],
    ['POST',   'evaluations',                'h_evaluation_save',      true],
    ['DELETE', 'evaluations/{id}',           'h_evaluation_delete',    true],
    ['POST',   'photos',                     'h_photo_upload',         true],
    ['GET',    'photos/{id}',                'h_photo_get',            true],
    ['DELETE', 'photos/{id}',                'h_photo_delete',         true],

    // V2: gestão em rede
    ['GET',    'companies',                  'h_companies',            true],
    ['POST',   'companies',                  'h_company_create',       true],
    ['PATCH',  'companies/{id}',             'h_company_update',       true],
    ['GET',    'manage/summary',             'h_manage_summary',       true],
    ['GET',    'manage/users',               'h_users',                true],
    ['POST',   'manage/users',               'h_user_create',          true],
    ['PATCH',  'manage/users/{id}',          'h_user_update',          true],
    ['POST',   'manage/users/{id}/approve',  'h_user_approve',         true],
    ['DELETE', 'manage/users/{id}',          'h_user_delete',          true],
    ['GET',    'manage/export.csv',          'h_users_export',         true],
    ['GET',    'students',                   'h_students',             true],
    ['GET',    'students/{id}',              'h_student_get',          true],
    ['PUT',    'students/{id}/routines/{rid}', 'h_student_routine_update', true],
    ['POST',   'company/exercises',          'h_company_exercise_save', true],
    ['PUT',    'company/exercises/{id}',     'h_company_exercise_save', true],
    ['POST',   'exercises/{id}/media',       'h_exercise_media',       true],

    ['GET',    'privacy/log',                'h_privacy_log',          true],
    ['GET',    'manage/audit',               'h_manage_audit',         true],
    ['GET',    'brand',                      'h_brand_get',            true],
    ['PUT',    'brand',                      'h_brand_save',           true],
    ['POST',   'brand/logo',                 'h_brand_logo',           true],
    ['DELETE', 'brand/logo',                 'h_brand_logo_delete',    true],

    // V3: senha, planos, aprovação de exercícios, financeiro, indicação e pagamentos
    ['POST',   'password/forgot',            'h_password_forgot',      false],
    ['POST',   'password/reset',             'h_password_reset',       false],
    ['GET',    'manage/outbox',              'h_outbox',               true],
    ['POST',   'manage/outbox/{id}/done',    'h_outbox_done',          true],
    ['GET',    'plans',                      'h_plans',                true],
    ['POST',   'plans',                      'h_plan_save',            true],
    ['PUT',    'plans/{id}',                 'h_plan_save',            true],
    ['DELETE', 'plans/{id}',                 'h_plan_delete',          true],
    ['POST',   'company/exercises/{id}/submit', 'h_exercise_submit',   true],
    ['GET',    'approvals',                  'h_approvals',            true],
    ['POST',   'approvals/{id}',             'h_approval_decide',      true],
    ['GET',    'finance/settings',           'h_fin_settings_get',     true],
    ['PUT',    'finance/settings',           'h_fin_settings_put',     true],
    ['GET',    'finance/plans',              'h_cplans',               true],
    ['POST',   'finance/plans',              'h_cplan_save',           true],
    ['PUT',    'finance/plans/{id}',         'h_cplan_save',           true],
    ['DELETE', 'finance/plans/{id}',         'h_cplan_delete',         true],
    ['GET',    'finance/dashboard',          'h_fin_dashboard',        true],
    ['POST',   'finance/commissions/pay',    'h_fin_commission_pay',   true],
    ['POST',   'finance/manual',             'h_fin_manual',           true],
    ['GET',    'referral/me',                'h_referral_me',          true],
    ['GET',    'pay/options',                'h_pay_options',          true],
    ['POST',   'pay/create',                 'h_pay_create',           true],
    ['GET',    'pay/mine',                   'h_pay_mine',             true],
    ['GET',    'pay/status',                 'h_pay_status',           false],
    ['POST',   'pay/renew',                  'h_pay_renew',            false],
    ['POST',   'pagbank/webhook',            'h_pagbank_webhook',      false],
    ['GET',    'pagbank/status',             'h_pagbank_status',       true],
    ['POST',   'pagbank/test',               'h_pagbank_test',         true],

    ['GET',    'routines',                   'h_routines',             true],
    ['POST',   'routines',                   'h_routine_create',       true],
    ['PUT',    'routines/{id}',              'h_routine_update',       true],
    ['DELETE', 'routines/{id}',              'h_routine_delete',       true],

    ['GET',    'workouts',                   'h_workouts',             true],
    ['GET',    'workouts/active',            'h_workout_active',       true],
    ['POST',   'workouts',                   'h_workout_start',        true],
    ['GET',    'workouts/{id}',              'h_workout_get',          true],
    ['DELETE', 'workouts/{id}',              'h_workout_delete',       true],
    ['PATCH',  'workouts/{id}',              'h_workout_notes',        true],
    ['POST',   'workouts/{id}/finish',       'h_workout_finish',       true],
    ['POST',   'workouts/{id}/exercises',    'h_workout_add_exercise', true],
    ['DELETE', 'workouts/{id}/exercises/{exid}', 'h_workout_remove_exercise', true],
    ['POST',   'workouts/{id}/sets',         'h_set_save',             true],
    ['DELETE', 'workouts/{id}/sets/{exid}/{no}', 'h_set_delete',       true],

    ['GET',    'stats/overview',             'h_stats_overview',       true],
    ['GET',    'stats/exercise/{id}',        'h_stats_exercise',       true],

    ['GET',    'body-weight',                'h_bw_list',              true],
    ['POST',   'body-weight',                'h_bw_save',              true],
    ['DELETE', 'body-weight/{id}',           'h_bw_delete',            true],

    ['GET',    'export.json',                'h_export_json',          true],
    ['GET',    'export.csv',                 'h_export_csv',           true],
];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = isset($_GET['route']) ? trim((string) $_GET['route'], '/') : (static function (): string {
    $p = rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH));
    $i = strpos($p, '/api/');
    return $i === false ? '' : trim(substr($p, $i + 5), '/');
})();

try {
    $pathKnown = false;
    foreach ($routes as [$m, $pattern, $handler, $auth]) {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>\d+)', $pattern) . '$#';
        if (!preg_match($regex, $path, $mm)) continue;
        $pathKnown = true;
        if ($m !== $method) continue;
        $params = array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY);
        if ($method !== 'GET' && $path !== 'pagbank/webhook') csrf_check(); // o aviso do PagBank vem de fora (sem sessão); ele é conferido perguntando ao PagBank
        $user = $auth ? require_user() : null;
        // Senha provisória: enquanto não trocar, só pode ver o próprio perfil, trocar a senha e sair.
        if ($user && $user['must_change_password'] && !in_array($method . ' ' . $path, ['GET me', 'POST password', 'POST logout'], true)) fail('Troque a senha provisória para continuar.', 403);
        // Leituras não precisam segurar o arquivo de sessão: libera para não serializar as requisições do mesmo usuário.
        if ($user && $method === 'GET' && session_status() === PHP_SESSION_ACTIVE) session_write_close();
        $auth ? $handler($params, $user) : $handler($params);
        exit;
    }
    fail($pathKnown ? 'Método não permitido.' : 'Rota não encontrada.', $pathKnown ? 405 : 404);
} catch (PDOException $e) {
    error_log('[meus-treinos] ' . $e->getMessage());
    fail(cfg('debug') ? $e->getMessage() : 'Erro no banco de dados. Tente novamente.', 500);
} catch (Throwable $e) {
    error_log('[meus-treinos] ' . $e->getMessage());
    fail(cfg('debug') ? $e->getMessage() : 'Erro inesperado.', 500);
}
