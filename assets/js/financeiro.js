/* Meus Treinos V3 · acesso (olho da senha, máscaras, recuperação), planos, financeiro, indicação e pagamento PIX (PagBank).
 * A tela só mostra o que cada perfil pode fazer; quem decide de verdade é o servidor (api/). */
'use strict';

Object.assign(ICON, {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.8 10.8 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.1-5.9M9.9 5.1A10.7 10.7 0 0 1 12 5c7 0 11 7 11 7a19.9 19.9 0 0 1-3.2 4.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-4v4"/><circle cx="16.5" cy="14" r="1.2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8C9 8 7 7 7 5.5S9 3 12 8zM12 8c3 0 5-1 5-2.5S15 3 12 8z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>',
});

const money = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pctTxt = n => `${fmtNum(n, 2)}%`;
const toCents = v => { const n = parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const centsToInput = c => (c / 100).toFixed(2).replace('.', ',');
const ymLabel = ym => new Date(ym + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

/* =====================================================================
 *  Campos: máscaras (e-mail, WhatsApp, CPF/CNPJ), olho da senha e regras de senha
 * ===================================================================== */
const waFormat = v => {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '').slice(0, 11);
  if (!d) return '';
  let o = '(' + d.slice(0, 2);
  if (d.length > 2) o += ') ' + d.slice(2, 3);
  if (d.length > 3) o += ' ' + d.slice(3, 7);
  if (d.length > 7) o += '-' + d.slice(7);
  return o;
};
const taxFormat = v => {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const emailField = (name, label = 'E-mail', value = '', { req = true, auto = 'email' } = {}) =>
  html`<label class="f">${label}<input class="in" type="email" name="${name}" value="${value}" inputmode="email" autocomplete="${auto}" autocapitalize="off" spellcheck="false" maxlength="190" placeholder="nome@dominio.com" data-mask="email" ${req ? raw('required') : ''}></label>`;
const waField = (name = 'whatsapp', label = 'WhatsApp (obrigatório)', value = '', { req = true } = {}) =>
  html`<label class="f">${label}<input class="in" type="tel" name="${name}" value="${waFormat(value)}" inputmode="numeric" autocomplete="tel-national" maxlength="16" placeholder="(85) 9 8888-7777" data-mask="wa" ${req ? raw('required') : ''}></label>`;
const taxField = (value = '') =>
  html`<label class="f">CPF ou CNPJ de quem paga<input class="in" name="tax_id" value="${taxFormat(value)}" inputmode="numeric" maxlength="18" placeholder="000.000.000-00" autocomplete="off" data-mask="tax" required><span class="hint">Exigido pelo PagBank para gerar o PIX. Não ficamos com ele.</span></label>`;

const PW_RULES = [['len', 'No mínimo 12 caracteres'], ['low', 'Uma letra minúscula'], ['up', 'Uma letra MAIÚSCULA'], ['num', 'Um número'], ['sym', 'Um símbolo: # @ ! $ % & * ?']];
const PW_TESTS = { len: v => v.length >= 12, low: v => /[a-z]/.test(v), up: v => /[A-Z]/.test(v), num: v => /\d/.test(v), sym: v => /[^A-Za-z0-9]/.test(v) };
const pwError = v => !PW_TESTS.len(v) ? 'A senha precisa ter no mínimo 12 caracteres.' : v.length > 72 ? 'A senha pode ter no máximo 72 caracteres.' : /\s|[^\x21-\x7E]/.test(v) ? 'Use só letras sem acento, números e símbolos (sem espaços).'
  : !PW_TESTS.low(v) ? 'A senha precisa ter uma letra minúscula.' : !PW_TESTS.up(v) ? 'A senha precisa ter uma letra MAIÚSCULA.' : !PW_TESTS.num(v) ? 'A senha precisa ter um número.' : !PW_TESTS.sym(v) ? 'A senha precisa ter um símbolo, como # @ ! $ % & * ?' : null;
const pwRules = () => html`<ul class="pwrules" data-pwrules aria-live="polite"><li class="pwr-t">Sua senha precisa ter</li>${PW_RULES.map(([k, t]) => raw(html`<li data-r="${k}"><i aria-hidden="true">${raw(ICON.check)}</i>${t}</li>`))}</ul>`;
/** Campo de senha com botão de olho. rules=true mostra a lista de regras (cadastro e troca de senha). */
const pwField = (name, label, { auto = 'current-password', rules = false, req = true } = {}) =>
  html`<label class="f">${label}<span class="pw"><input class="in" type="password" name="${name}" autocomplete="${auto}" maxlength="72" autocapitalize="off" spellcheck="false" ${req ? raw('required') : ''} ${rules ? raw('data-policy') : ''}><button type="button" class="eye" data-act="pw-toggle" aria-label="Mostrar senha" aria-pressed="false">${raw(ICON.eye)}</button></span></label>${rules ? raw(pwRules()) : ''}`;

document.addEventListener('input', e => {
  const el = e.target; if (!el.matches) return;
  if (el.matches('[data-mask=wa]')) el.value = waFormat(el.value);
  else if (el.matches('[data-mask=tax]')) el.value = taxFormat(el.value);
  else if (el.matches('[data-mask=email]')) el.value = el.value.toLowerCase().replace(/[^a-z0-9@._+\-]/g, '');
  else if (el.matches('[data-policy]')) {
    const ul = el.closest('form')?.querySelector('[data-pwrules]'); if (!ul) return;
    for (const li of $$('[data-r]', ul)) li.classList.toggle('ok', PW_TESTS[li.dataset.r](el.value));
  }
});
/** Confere e-mail, WhatsApp e senha antes de enviar (o servidor confere de novo). */
document.addEventListener('submit', e => {
  const f = e.target.closest?.('form[data-form]'); if (!f) return;
  let msg = null;
  for (const el of $$('[data-mask=email]', f)) if (el.value && !EMAIL_RE.test(el.value)) msg = 'Digite um e-mail válido, como nome@dominio.com.';
  for (const el of $$('[data-mask=wa]', f)) { const d = el.value.replace(/\D/g, ''); if ((el.required || d) && !/^[1-9][1-9]9\d{8}$/.test(d)) msg = 'Digite o WhatsApp com DDD e o 9, como (85) 9 8888-7777.'; }
  for (const el of $$('[data-policy]', f)) if (el.value && pwError(el.value)) msg = pwError(el.value);
  const again = f.querySelector('[name=again]'), np = f.querySelector('[name=new],[name=password]');
  if (!msg && again && np && again.value !== np.value) msg = 'As duas senhas não são iguais.';
  if (!msg) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const box = $('#auth-err'); if (box) box.innerHTML = `<div class="err" role="alert">${esc(msg)}</div>`; else toast(msg, true);
}, true);

/* =====================================================================
 *  Telas de acesso: entrar, cadastro, esqueci a senha, redefinir
 * ===================================================================== */
const authHead = (title, sub) => html`<img class="logo ${S.brand?.logo ? 'custom' : 'sm'}" src="${S.brand?.logo || 'assets/img/logo-icone.svg'}" alt="${S.brand?.app_name || ''}"><h1>${title}</h1><p class="sub">${sub}</p>`;
const authFoot = () => html`<div class="credit"><a href="https://ariceliomoura.com.br/" target="_blank" rel="noopener">Desenvolvido por Aricelio Moura</a></div>`;

function authViewV3(mode, token = '') {
  if (mode === 'pending') return html`<div class="auth">
    <img class="logo sm" src="${S.brand?.logo || 'assets/img/logo-icone.svg'}" alt="">
    <div class="card hl center"><div class="eyebrow">Cadastro enviado</div><h2 style="margin:6px 0 8px">Falta pouco!</h2><p class="muted" style="margin:0">${S.pendingMsg}</p></div>
    <button class="btn block" data-act="auth-toggle" data-mode="login">Voltar para o login</button></div>`;
  if (mode === 'forgot') return html`<div class="auth">
    ${raw(authHead('Esqueceu a senha?', 'Digite o e-mail do seu cadastro. Enviamos o link para ele (confira também a caixa de spam).'))}
    <div id="auth-err"></div>
    <form data-form="forgot" novalidate>${raw(emailField('email', 'E-mail cadastrado'))}<button class="btn primary block" type="submit">Enviar link por e-mail</button></form>
    <p class="center small" style="margin-top:18px"><a href="#" data-act="auth-toggle" data-mode="login">Voltar para o login</a></p>${raw(authFoot())}</div>`;
  if (mode === 'forgot-sent') return html`<div class="auth">
    ${raw(authHead('Link enviado', ''))}
    <div class="card hl center"><p style="margin:0">${S.forgotMsg}</p></div>
    <button class="btn block" data-act="forgot-email">Não chegou? Reenviar o link</button>
    <button class="btn primary block" data-act="auth-toggle" data-mode="login" style="margin-top:10px">Voltar para o login</button>${raw(authFoot())}</div>`;
  if (mode === 'reset') return html`<div class="auth">
    ${raw(authHead('Criar nova senha', 'Escolha uma senha forte. Este link só funciona uma vez.'))}
    <div id="auth-err"></div>
    <form data-form="reset" data-token="${token}" novalidate>${raw(pwField('password', 'Nova senha', { auto: 'new-password', rules: true }))}${raw(pwField('again', 'Repita a nova senha', { auto: 'new-password' }))}
      <button class="btn primary block" type="submit">Salvar nova senha</button></form>${raw(authFoot())}</div>`;
  const reg = mode === 'register';
  return html`<div class="auth">
    ${raw(authHead(reg ? 'Criar conta' : (S.brand?.app_name || 'Meus Treinos'), reg ? 'Use o código que a sua academia ou o seu personal te passou.' : (S.brand?.slogan || '')))}
    ${S.denied ? raw(html`<div class="err" role="alert">${S.denied}</div>`) : ''}
    <div id="auth-err"></div>
    <form data-form="${reg ? 'register' : 'login'}" novalidate>
      ${reg ? raw(html`<label class="f">Código da empresa<input class="in" name="company_code" autocomplete="off" autocapitalize="characters" maxlength="12" required placeholder="Ex.: K7M2QX9P"></label>
        <label class="f">Nome completo<input class="in" name="name" autocomplete="name" required maxlength="80"></label>`) : ''}
      ${raw(emailField('email'))}
      ${reg ? raw(waField()) : ''}
      ${reg ? raw(html`<div class="infobox">${raw(ICON.whats)}<span>Usamos o WhatsApp para a sua academia ou o seu personal falarem com você. A redefinição de senha chega pelo e-mail cadastrado.</span></div>`) : ''}
      ${raw(pwField('password', 'Senha', { auto: reg ? 'new-password' : 'current-password', rules: reg }))}
      ${reg ? raw(html`<div class="refbox"><div class="row" style="gap:8px"><span class="ic">${raw(ICON.gift)}</span><b>Foi indicado por alguém?</b></div><p class="small muted" style="margin:4px 0 8px">Digite o código de quem indicou e ganhe desconto na primeira renovação.</p>
        <label class="f" style="margin:0">Código de indicação (opcional)<input class="in" name="referral_code" autocomplete="off" autocapitalize="characters" maxlength="16" placeholder="IND-XXXXXX"></label></div>`) : raw(html`<p class="right small" style="margin:-6px 0 14px"><a href="#" data-act="auth-toggle" data-mode="forgot">Esqueci minha senha</a></p>`)}
      <button class="btn primary block" type="submit">${reg ? 'Enviar cadastro' : 'Entrar'}</button>
      ${reg ? raw('<p class="small muted center" style="margin-top:10px">Seu cadastro será aprovado pelo administrador da academia antes do primeiro acesso.</p>') : ''}
    </form>
    ${S.registration ? raw(html`<p class="center small" style="margin-top:18px">${reg ? 'Já tem conta?' : 'Primeira vez?'} <a href="#" data-act="auth-toggle" data-mode="${reg ? 'login' : 'register'}">${reg ? 'Entrar' : 'Criar conta'}</a></p>`) : ''}
    ${raw(authFoot())}
  </div>`;
}
route(/^#\/redefinir\/([a-f0-9]{64})$/, token => authViewV3('reset', token), { public: true, bare: true });

/* =====================================================================
 *  Pagamento PIX (PagBank): escolher plano, gerar o PIX, acompanhar até confirmar
 * ===================================================================== */
const quoteTxt = q => q.discount_cents > 0
  ? html`<s class="muted">${money(q.list_cents)}</s> <b>${money(q.amount_cents)}</b><span class="small" style="display:block;color:var(--ok,#3ecf8e)">Desconto de ${money(q.discount_cents)} · ${q.discount_note}</span>`
  : html`<b>${money(q.amount_cents)}</b>`;

function planCards(plans) {
  if (!plans.length) return html`<div class="empty">Sua academia ainda não cadastrou planos. Fale com ela para renovar.</div>`;
  return html`<div class="choices plan-choices">${plans.map((p, i) => raw(html`<label class="plancard"><input type="radio" name="plan_id" value="${p.id}" ${i === 0 ? raw('checked') : ''}>
    <span class="pc-main"><b>${p.name}</b><span class="small muted">${p.months} ${pl(p.months, 'mês', 'meses')} · equivale a ${money(p.quote.monthly_cents)}/mês</span></span>
    <span class="pc-price">${raw(quoteTxt({ ...p.quote }))}</span></label>`))}</div>`;
}

function showPix(pay, { onPaid } = {}) {
  let timer = null, alive = true;
  const m = openModal(pixHtml(pay), null, () => { alive = false; clearInterval(timer); });
  const paint = p => { const box = $('.modal [data-pix]'); if (box) box.innerHTML = pixInner(p); };
  const tick = async () => {
    if (!alive || !$('.modal [data-pix]')) { clearInterval(timer); return; }
    try {
      const { payment } = await api('GET', `pay/status?t=${pay.token}`);
      if (payment.status !== 'pendente') { clearInterval(timer); paint(payment); if (payment.status === 'pago') onPaid?.(payment); }
      else { const left = $('.modal [data-left]'); if (left && payment.expires_at) left.textContent = mmss(Math.max(0, Math.round((new Date(payment.expires_at) - Date.now()) / 1000))); }
    } catch { /* tenta de novo no próximo ciclo */ }
  };
  timer = setInterval(tick, 4000);
  return m;
}
const pixHtml = pay => html`<div class="row between" style="margin-bottom:6px"><h2>Pagar com PIX</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div><div data-pix>${raw(pixInner(pay))}</div>`;
function pixInner(p) {
  if (p.status === 'pago') return html`<div class="center" style="padding:10px 0"><div class="okmark">${raw(ICON.check)}</div><h3>Pagamento confirmado!</h3><p class="muted">${p.plan_name} · ${money(p.amount_cents)}. Seu acesso foi renovado.</p>
    <button class="btn primary block" data-act="pay-done">Continuar</button></div>`;
  if (p.status !== 'pendente') return html`<div class="center" style="padding:10px 0"><h3>${p.status === 'expirado' || p.status === 'cancelado' ? 'Este PIX venceu' : 'Não foi possível concluir'}</h3><p class="muted">Gere um novo PIX para tentar de novo.</p><button class="btn primary block" data-close>Fechar</button></div>`;
  return html`<p class="muted" style="margin:0 0 8px">${p.plan_name} · <b>${money(p.amount_cents)}</b>${p.discount_cents ? ` (com desconto de ${money(p.discount_cents)})` : ''}</p>
    ${p.pix_qr ? raw(html`<div class="qrbox"><img src="${p.pix_qr}" alt="QR Code do PIX" width="220" height="220"></div>`) : ''}
    <p class="small muted center" style="margin:6px 0">Abra o app do seu banco, escolha PIX e leia o QR Code, ou use o copia e cola:</p>
    <textarea class="in mono" readonly rows="4" id="pix-text" aria-label="PIX copia e cola">${p.pix_text}</textarea>
    <button class="btn primary block" style="margin-top:10px" data-act="pix-copy">${raw(ICON.copy)} Copiar código PIX</button>
    <p class="small muted center" style="margin:10px 0 0">Vence em <b data-left>${p.expires_at ? mmss(Math.max(0, Math.round((new Date(p.expires_at) - Date.now()) / 1000))) : '30:00'}</b> · esta tela confirma sozinha quando o pagamento cair.</p>`;
}

/* ---- Renovar quando já perdeu o acesso (tela de login) ---- */
async function renewOpen() {
  const cred = S.renew; if (!cred) return;
  const r = await api('POST', 'pay/renew', cred);
  openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Renovar assinatura</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <p class="muted" style="margin-top:0">Olá, ${r.name}. Escolha o plano e pague com PIX. O acesso volta assim que o pagamento for confirmado.</p>
    ${r.enabled ? '' : raw('<div class="err">O pagamento online ainda não está ativo na sua academia. Fale com ela para renovar.</div>')}
    <div class="scroll"><form data-form="pay-renew">${raw(planCards(r.plans))}${raw(taxField())}<button class="btn primary block" type="submit" ${r.enabled && r.plans.length ? '' : raw('disabled')}>Gerar PIX</button></form></div>`);
}

/** Cartão "Indique outra empresa": código, regra e quem a empresa já indicou (o desconto sai da plataforma, com teto de margem). */
function partnerCard(pt) {
  return html`<div class="card"><h3>Indique outra empresa</h3>
    <p class="small muted" style="margin:4px 0 8px">Quando uma empresa criada com o seu código pagar a mensalidade, <b>você ganha ${fmtNum(pt.referrer_pct, 0)}% de desconto (no máximo 10% no total) por ${pt.referrer_months} ${pl(pt.referrer_months, 'mês', 'meses')}</b> na sua mensalidade da plataforma, e ela ganha ${fmtNum(pt.referred_pct, 0)}% por ${pt.referred_months} ${pl(pt.referred_months, 'mês', 'meses')}. Passe o código ao gestor ao indicar.</p>
    <div class="refcode">${pt.code}</div><button class="btn sm" data-act="copy-text" data-v="${pt.code}">${raw(ICON.copy)} Copiar código</button>
    ${pt.was_referred_by ? raw(html`<p class="small muted" style="margin:10px 0 0">Sua empresa foi indicada por <b>${pt.was_referred_by.name}</b>${pt.was_referred_by.months_left ? ' · restam ' + pt.was_referred_by.months_left + ' ' + pl(pt.was_referred_by.months_left, 'mês', 'meses') + ' de desconto' : ''}.</p>`) : ''}
    ${pt.referred.length ? raw(html`<ul class="list" style="margin-top:10px">${pt.referred.map(x => raw(html`<li><div class="grow"><div class="t">${x.name}</div><div class="s">${x.months_left ? 'seu desconto continua por ' + x.months_left + ' ' + pl(x.months_left, 'mês', 'meses') : 'desconto já usado'}</div></div><span class="badge ${x.status === 'ativa' ? 'tone-ok' : 'tone-bad'}">${x.status}</span></li>`))}</ul>`) : ''}</div>`;
}

/* ---- Assinatura dentro do app (aluno renova; administrador paga a plataforma) ---- */
route(/^#\/assinatura$/, async () => {
  const o = await api('GET', 'pay/options');
  const until = o.access_until ? fmtD(o.access_until) : 'sem prazo';
  if (o.kind === 'empresa') return html`<div class="page-title"><div><div class="eyebrow">Plataforma</div><h1>Mensalidade da empresa</h1></div></div>
    <div class="card"><p class="muted" style="margin:0 0 8px">Acesso da empresa até <b>${until}</b>.</p>
      ${o.plan ? raw(html`<h3>${o.plan.name} · ${o.quote && o.quote.discount_cents ? '' : money(o.plan.price_cents) + ' por mês'}</h3>${o.quote && o.quote.discount_cents ? raw(html`<p style="margin:0"><s class="muted">${money(o.quote.list_cents)}</s> <b style="font-size:1.3rem">${money(o.quote.amount_cents)}</b> por mês</p><p class="small" style="color:var(--ok);margin:4px 0 0">Desconto de ${money(o.quote.discount_cents)} · ${o.quote.discount_note}</p>`) : ''}`) : raw('<p>Sua empresa ainda não tem um plano definido. Fale com o gestor.</p>')}
      ${o.enabled && o.plan ? raw(html`<form data-form="pay-create" style="margin-top:12px">${raw(taxField())}<button class="btn primary block" type="submit">Pagar 1 mês com PIX</button></form>`) : raw('<p class="hint">O pagamento online ainda não está ativo.</p>')}</div>
    ${o.partner ? raw(partnerCard(o.partner)) : ''}`;
  return html`<div class="page-title"><div><div class="eyebrow">Assinatura</div><h1>Renovar meu acesso</h1></div></div>
    <div class="card"><p class="muted" style="margin:0">Seu acesso vale até <b>${until}</b>. Ao pagar, o novo período soma ao que ainda resta.</p></div>
    ${o.enabled ? '' : raw('<div class="card note">O pagamento online ainda não está ativo. Fale com a sua academia para renovar.</div>')}
    <form data-form="pay-create">${raw(planCards(o.plans))}${o.plans.length && o.enabled ? raw(html`${raw(taxField())}<button class="btn primary block" type="submit">Gerar PIX</button>`) : ''}</form>`;
});

/* =====================================================================
 *  Indicar amigos (aluno) e Ganhos (personal)
 * ===================================================================== */
const refShareText = (code, app) => `Venha treinar comigo no ${app}! Use o meu código de indicação ${code} no cadastro e ganhe desconto na primeira renovação: ${location.origin}${location.pathname}`;
route(/^#\/indicar$/, async () => {
  const r = await api('GET', 'referral/me');
  const ru = r.rules;
  return html`<div class="page-title"><div><div class="eyebrow">Indique e ganhe</div><h1>Indicar amigos</h1></div></div>
    <div class="card hl center"><span class="ic big">${raw(ICON.gift)}</span><div class="small muted">Seu código de indicação</div><div class="refcode">${r.code}</div>
      <div class="row wrap" style="justify-content:center;margin-top:8px"><button class="btn sm" data-act="copy-text" data-v="${r.code}">${raw(ICON.copy)} Copiar código</button>
      <a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(refShareText(r.code, S.brand?.app_name || 'Meus Treinos'))}">${raw(ICON.whats)} Enviar pelo WhatsApp</a></div></div>
    <div class="card"><h3>Como funciona</h3><ol class="how"><li>Seu amigo se cadastra com o seu código.</li><li>Ele ganha <b>${pctTxt(ru.referred_pct)}</b> de desconto na primeira renovação.</li><li>Você ganha <b>${pctTxt(ru.referrer_pct)}</b> a cada amigo que a academia aprovar (até ${pctTxt(ru.cap_pct)}).</li><li>O desconto é sobre o valor de <b>um mês</b> do plano e vale só na próxima renovação, nunca no período que já está pago.</li></ol></div>
    <div class="card"><h3>Seus descontos</h3><ul class="list sum"><li><span class="muted">Amigos aprovados</span><b>${r.referrals.filter(x => x.status === 'ativo').length}</b></li><li><span class="muted">Desconto para a próxima renovação</span><b>${pctTxt(r.next_discount_pct)}</b></li>${r.was_referred ? raw(`<li><span class="muted">Você foi indicado</span><b>+${pctTxt(ru.referred_pct)} na 1ª renovação</b></li>`) : ''}</ul>
      <a class="btn primary block" style="margin-top:10px" href="#/assinatura">Renovar com desconto</a></div>
    ${r.referrals.length ? raw(html`<div class="day-h">Quem você indicou</div><div class="card"><ul class="list">${r.referrals.map(x => raw(html`<li><div class="grow"><div class="t">${x.name}</div></div><span class="badge ${x.status === 'ativo' ? 'tone-ok' : 'tone-warn'}">${x.status === 'ativo' ? 'aprovado' : x.status}</span></li>`))}</ul></div>`) : ''}`;
});

route(/^#\/ganhos$/, async () => {
  const r = await api('GET', 'referral/me'), e = r.earnings, ru = r.rules;
  return html`<div class="page-title"><div><div class="eyebrow">Indicações</div><h1>Meus ganhos</h1></div></div>
    <div class="card hl"><div class="small muted">Comissão a receber</div><div class="bigmoney">${money(e.pending)}</div><div class="small muted">${pctTxt(ru.commission_pct)} sobre o que os alunos indicados por você pagam, por ${ru.commission_months} meses. Já repassado: ${money(e.paid)}.</div></div>
    <div class="card"><div class="small muted">Seu código de indicação</div><div class="refcode">${r.code}</div>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="copy-text" data-v="${r.code}">${raw(ICON.copy)} Copiar</button>
      <a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(refShareText(r.code, S.brand?.app_name || 'Meus Treinos'))}">${raw(ICON.whats)} Divulgar no WhatsApp</a></div>
      <p class="hint">Quem se cadastrar com este código e for aprovado fica na sua lista de alunos.</p></div>
    <div class="day-h">Alunos que você indicou</div>${r.referrals.length ? raw(html`<div class="card"><ul class="list">${r.referrals.map(x => raw(html`<li><div class="grow"><div class="t">${x.name}</div></div><span class="badge ${x.status === 'ativo' ? 'tone-ok' : 'tone-warn'}">${x.status === 'ativo' ? 'aprovado' : x.status}</span></li>`))}</ul></div>`) : raw('<div class="empty">Ninguém se cadastrou com o seu código ainda.</div>')}
    ${r.payments.length ? raw(html`<div class="day-h">Comissões</div><div class="card"><ul class="list">${r.payments.map(x => raw(html`<li><div class="grow"><div class="t">${x.payer}</div><div class="s">${x.plan} · ${fmtDate(x.when)}</div></div><b class="mono">${money(x.commission_cents)}</b><span class="badge ${x.paid_out ? 'tone-ok' : 'tone-warn'}">${x.paid_out ? 'repassada' : 'a receber'}</span></li>`))}</ul></div>`) : ''}`;
});

/* =====================================================================
 *  Financeiro da empresa (administrador; gestor geral escolhe a empresa)
 * ===================================================================== */
let FIN = { tab: 'painel', cid: 0, d: null, plans: [], settings: null, students: [] };
const finQs = () => S.user.role === 'super' && FIN.cid ? `?company_id=${FIN.cid}` : '';

route(/^#\/financeiro$/, async () => {
  let companies = [];
  if (S.user.role === 'super') {
    companies = (await api('GET', 'companies')).companies;
    if (!FIN.cid || !companies.some(c => c.id === FIN.cid)) FIN.cid = companies[0]?.id || 0;
    if (!FIN.cid) return html`<div class="empty">Crie uma empresa para ver o financeiro.</div>`;
  }
  const [d, pl2, st] = await Promise.all([api('GET', `finance/dashboard${finQs()}`), api('GET', `finance/plans${finQs()}`), api('GET', `finance/settings${finQs()}`)]);
  FIN = { ...FIN, d, plans: pl2.plans, settings: st.settings, companies };
  return finHtml();
});

function finHtml() {
  const tabs = [['painel', 'Painel'], ['planos', 'Planos'], ['indic', 'Indicações'], ['receber', 'Receber']];
  return html`<div class="page-title"><div><div class="eyebrow">${S.user.role === 'super' ? 'Gestor geral' : 'Administrador'}</div><h1>Financeiro</h1></div>${S.user.role === 'admin' ? raw('<a class="btn sm" href="#/assinatura">Mensalidade da plataforma</a>') : ''}</div>
    ${S.user.role === 'super' ? raw(html`<label class="f">Empresa<select class="in" data-fin-company>${FIN.companies.map(c => raw(html`<option value="${c.id}" ${c.id === FIN.cid ? raw('selected') : ''}>${c.name}</option>`))}</select></label>`) : ''}
    <div class="seg" role="tablist">${tabs.map(([k, l]) => raw(html`<button role="tab" aria-selected="${FIN.tab === k}" data-act="fin-tab" data-t="${k}">${l}</button>`))}</div>
    <div id="fin-body">${raw(finTab())}</div>`;
}
document.addEventListener('change', async e => {
  if (!e.target.matches?.('[data-fin-company]')) return;
  FIN.cid = +e.target.value; render();
});

function finTab() {
  const d = FIN.d, t = d.totals;
  if (FIN.tab === 'planos') return html`
    <div class="row between" style="margin-bottom:8px"><p class="hint" style="margin:0">Você define o nome, a duração e o valor de cada plano que vende aos alunos.</p><button class="btn primary sm" data-act="cplan-edit" data-id="">${raw(ICON.plus)} Plano</button></div>
    ${FIN.plans.length ? raw(html`<div class="card"><ul class="list">${FIN.plans.map(p => raw(html`<li><div class="grow"><div class="t">${p.name} ${p.active ? '' : raw('<span class="badge tone-bad">desativado</span>')}</div><div class="s">${p.months} ${pl(p.months, 'mês', 'meses')} · ${money(p.monthly_cents)} por mês</div></div><b class="mono">${money(p.price_cents)}</b><button class="icon-btn" data-act="cplan-edit" data-id="${p.id}" aria-label="Editar ${p.name}">${raw(ICON.edit)}</button></li>`))}</ul></div>`) : raw('<div class="empty">Cadastre o primeiro plano (por exemplo Mensal, Trimestral, Anual) para os alunos pagarem pelo app.</div>')}`;
  if (FIN.tab === 'indic') {
    const s = FIN.settings;
    return html`<div class="card"><h3>Programa de indicação</h3><p class="hint">Todo desconto é sobre o valor de <b>um mês</b> do plano e vale só na próxima renovação (nunca no período já pago).</p>
      <form data-form="fin-settings">
        <div class="grid2"><label class="f">Desconto de quem foi indicado (%)<input class="in" name="discount_referred_pct" inputmode="decimal" value="${s.discount_referred_pct}" required></label>
        <label class="f">Desconto de quem indicou, por amigo (%)<input class="in" name="discount_referrer_pct" inputmode="decimal" value="${s.discount_referrer_pct}" required></label>
        <label class="f">Teto de desconto (%)<input class="in" name="discount_cap_pct" inputmode="decimal" value="${s.discount_cap_pct}" required></label>
        <label class="f">Comissão do personal (%)<input class="in" name="commission_pct" inputmode="decimal" value="${s.commission_pct}" required></label>
        <label class="f">Comissão vale por (meses)<input class="in" name="commission_months" inputmode="numeric" value="${s.commission_months}" required></label>
        <label class="f">Teto de incentivos (% do preço)<input class="in" name="incentive_cap_pct" inputmode="decimal" value="${s.incentive_cap_pct}" required><span class="hint">Desconto + comissão de um pagamento nunca passam disto. A comissão não pode ser maior que o teto.</span></label></div>
        <div class="infobox"><span>Exemplo: plano Trimestral de R$ 210,00 (R$ 70,00 por mês) e desconto de 10%: abate R$ 7,00 e a renovação sai por R$ 203,00. A comissão do personal é sobre o valor pago (R$ 203,00).</span></div>
        <button class="btn primary block" type="submit">Salvar regras</button></form></div>
    <div class="card" id="simB"><h3>Simulador: quanto sobra com cada aluno indicado?</h3><p class="hint">O dinheiro dos alunos é da <b>sua</b> empresa; a plataforma só cobra a mensalidade do seu plano.</p>
      <div class="grid2"><label class="f">Preço do plano por aluno (R$/mês)<input class="in" inputmode="decimal" data-simb="price" value="${centsToInput((FIN.plans.find(p => p.months === 1) || FIN.plans[0] || { price_cents: 3000 }).price_cents / ((FIN.plans.find(p => p.months === 1) || FIN.plans[0] || { months: 1 }).months || 1))}"></label>
        <label class="f">Alunos pagantes<input class="in" inputmode="numeric" data-simb="n" value="50"></label>
        <label class="f">Mensalidade da plataforma (R$)<input class="in" inputmode="decimal" data-simb="fee" value="49,90"></label></div>
      <div id="simB-out"></div></div>`;
  }
  if (FIN.tab === 'receber') return html`<div class="card"><h3>Registrar pagamento recebido</h3><p class="hint">Para pagamentos feitos fora do app (dinheiro, PIX direto, maquininha). O acesso do aluno é renovado igual.</p>
      <button class="btn primary block" data-act="fin-manual">Registrar pagamento</button></div>
    <div class="day-h">Últimas cobranças</div>${raw(finRecent(d))}`;
  const max = Math.max(1, ...d.series.map(s => s.net));
  return html`<div class="grid2"><div class="stat big"><b>${money(t.gross - t.discounts - t.commissions)}</b><span>receita líquida (${d.months} meses)</span>${d.growth_pct == null ? '' : raw(html`<em class="${d.growth_pct >= 0 ? 'up' : 'dn'}">${d.growth_pct >= 0 ? '+' : ''}${fmtNum(d.growth_pct, 1)}% no mês</em>`)}</div>
      <div class="stat big"><b>${money(d.mrr)}</b><span>receita mensal recorrente</span></div>
      <div class="stat big"><b>${d.active_students}</b><span>alunos com acesso · ${d.new_students} novos no mês</span></div>
      <div class="stat big"><b>${fmtNum(d.churn_pct, 1)}%</b><span>vencidos no mês (${d.expired_this_month})</span></div></div>
    <div class="card"><h3>Receita líquida por mês</h3><div class="bars">${d.series.map((s, i) => raw(html`<div class="bcol"><span class="bv">${s.net ? money(s.net).replace(/,\d\d$/, '') : ''}</span><div class="bar ${i === d.series.length - 1 ? 'cur' : ''}" style="height:${Math.max(3, Math.round(100 * s.net / max))}%"></div><span class="bl">${ymLabel(s.month)}</span></div>`))}</div></div>
    <div class="card"><h3>Para onde vai o dinheiro</h3><ul class="list sum"><li><span class="muted">Receita bruta (preço de tabela)</span><b>${money(t.gross)}</b></li><li><span class="muted">(−) Descontos de indicação</span><b class="neg">${money(t.discounts)}</b></li><li><span class="muted">(−) Comissões dos personais</span><b class="neg">${money(t.commissions)}</b></li><li><span class="muted">Receita líquida</span><b class="pos">${money(t.gross - t.discounts - t.commissions)}</b></li><li><span class="muted">Ticket médio (${t.payments} pagamentos)</span><b>${money(t.avg_ticket)}</b></li></ul></div>
    <div class="card"><h3>Comissões dos personais</h3>${d.commissions.length ? raw(html`<ul class="list">${d.commissions.map(c => raw(html`<li><div class="grow"><div class="t">${c.name}</div><div class="s">${c.payments} pagamentos · já repassado ${money(c.paid)}</div></div><b class="mono">${money(c.pending)}</b>${c.pending > 0 ? raw(html`<button class="btn sm" data-act="fin-commission" data-id="${c.user_id}" data-n="${c.name}" data-v="${c.pending}">Repassar</button>`) : raw('<span class="badge tone-ok">em dia</span>')}</li>`))}</ul>`) : raw('<p class="muted small" style="margin:0">Ainda não há comissões. Elas aparecem quando um aluno indicado por um personal paga uma renovação.</p>')}</div>
    <div class="day-h">Últimas cobranças</div>${raw(finRecent(d))}
    <details class="card"><summary><b>Como calculamos</b></summary><ul class="how" style="margin-top:8px"><li><b>Receita líquida</b> = receita bruta − descontos de indicação − comissões.</li><li><b>MRR</b> = soma do (valor pago ÷ meses do plano) de cada aluno com plano em vigor.</li><li><b>Vencidos no mês</b> = alunos que ficaram sem acesso neste mês ÷ (alunos com acesso + vencidos).</li><li><b>Crescimento</b> compara a receita líquida do mês com a do mês anterior.</li></ul></details>`;
}
function simBRefresh() {
  const out = $('#simB-out'), form = $('form[data-form=fin-settings]'); if (!out || !form) return;
  const g = n => parseFloat(String(form[n].value).replace(',', '.')) || 0, P = toCents($('[data-simb=price]').value) || 0, N = Math.max(0, +$('[data-simb=n]').value || 0), fee = toCents($('[data-simb=fee]').value) || 0;
  const d = P * g('discount_referred_pct') / 100, com = (P - d) * g('commission_pct') / 100, cap = P * g('incentive_cap_pct') / 100;
  let dd = d, cc = com; if (dd + cc > cap) { dd = Math.max(0, cap - cc); cc = (P - dd) * g('commission_pct') / 100; }
  const first = P - dd - cc, rev = N * P;
  out.innerHTML = html`<ul class="list sum"><li><span class="muted">Desconto do indicado (1 mês)</span><b>${money(dd)}</b></li><li><span class="muted">Comissão do personal</span><b>${money(cc)}</b></li><li><span class="muted"><b>Sobra no 1º pagamento do indicado</b></span><b class="${first >= 0 ? 'pos' : 'neg'}">${money(first)}</b></li><li><span class="muted">Receita com ${N} alunos (sem indicações)</span><b>${money(rev)}</b></li><li><span class="muted">(−) Mensalidade da plataforma</span><b class="neg">${money(fee)}</b></li><li><span class="muted"><b>Fica com a empresa por mês</b> (antes dos seus custos)</span><b class="pos">${money(rev - fee)}</b></li></ul>
    ${(d + com > cap) ? raw('<div class="infobox"><span>Desconto + comissão passariam do teto de incentivos: o sistema reduz o desconto para respeitar o teto.</span></div>') : ''}`;
}
document.addEventListener('input', e => { if (e.target.matches?.('[data-simb]') || e.target.closest?.('form[data-form=fin-settings]')) simBRefresh(); });
const finRecent = d => d.recent.length ? html`<div class="card"><ul class="list">${d.recent.map(p => raw(html`<li><div class="grow"><div class="t">${p.payer}</div><div class="s">${p.plan} · ${p.method === 'manual' ? 'manual' : 'PIX'} · ${fmtDate(p.when)}</div></div><b class="mono">${money(p.amount_cents)}</b><span class="badge ${p.status === 'pago' ? 'tone-ok' : p.status === 'pendente' ? 'tone-warn' : 'tone-bad'}">${p.status}</span></li>`))}</ul></div>` : html`<div class="empty">Nenhuma cobrança ainda.</div>`;

/* =====================================================================
 *  Gestor geral: planos da plataforma e aprovação de exercícios
 * ===================================================================== */
let PLT = null, PLTAB = 'planos';
route(/^#\/planos$/, async () => { PLT = await api('GET', 'platform/settings'); return pltHtml(); }, { after: () => simARefresh() });
function pltHtml() {
  const tabs = [['planos', 'Planos'], ['indic', 'Indicação'], ['resumo', 'Resumo']];
  return html`<div class="page-title"><div><div class="eyebrow">Gestor geral</div><h1>Planos</h1></div><button class="btn primary sm" data-act="plan-edit" data-id="">${raw(ICON.plus)} Plano</button></div>
    <div class="seg" role="tablist">${tabs.map(([k, l]) => raw(html`<button role="tab" aria-selected="${PLTAB === k}" data-act="plt-tab" data-t="${k}">${l}</button>`))}</div>
    <div id="plt-body" class="stackv">${raw(pltTab())}</div>`;
}
function pltTab() {
  const { plans, settings: st, summary: sm, max_discount_pct: mx } = PLT;
  if (PLTAB === 'resumo') return html`<div class="grid2"><div class="stat big"><b>${money(sm.revenue_cents)}</b><span>entra por mês das empresas ativas (${sm.companies})</span></div>
      <div class="stat big"><b class="${sm.margin_cents >= 0 ? 'pos' : 'neg'}">${money(sm.margin_cents)}</b><span>sobra por mês depois do custo por conta (${fmtNum(sm.margin_pct, 1)}%)</span></div>
      <div class="stat big"><b>${money(sm.cost_cents)}</b><span>custo por conta, somado</span></div>
      <div class="stat big"><b>${money(sm.discounts_cents)}</b><span>de desconto de indicação este mês (sai da sua margem)</span></div></div>
    <div class="card"><h3>Como ler</h3><ul class="how"><li><b>Entra por mês</b> = mensalidades dos planos já com os descontos em vigor.</li><li><b>Sobra</b> = o que entra menos o custo por conta de cada plano.</li><li>Os números ficam mais fiéis depois que você preenche o custo por conta em cada plano.</li></ul></div>`;
  if (PLTAB === 'indic') return html`<div class="card"><h3>Empresa indica empresa</h3>
      <p class="hint">O desconto sai do <b>seu</b> bolso e nunca passa de <b>${fmtNum(mx, 0)}%</b> do preço do plano (somando tudo), nem do teto de margem do plano, o que for menor. O que a empresa dá aos alunos é com ela.</p>
      <form data-form="platform-rules"><div class="grid2">
        <label class="f">Desconto de quem foi indicado (%)<input class="in" name="b2b_referred_pct" inputmode="decimal" value="${st.b2b_referred_pct}" required><span class="hint">Máximo ${fmtNum(mx, 0)}%.</span></label>
        <label class="f">Por quantos meses<input class="in" name="b2b_referred_months" inputmode="numeric" value="${st.b2b_referred_months}" required></label>
        <label class="f">Desconto de quem indicou (%)<input class="in" name="b2b_referrer_pct" inputmode="decimal" value="${st.b2b_referrer_pct}" required><span class="hint">Por empresa indicada. Máximo ${fmtNum(mx, 0)}%.</span></label>
        <label class="f">Por quantos meses<input class="in" name="b2b_referrer_months" inputmode="numeric" value="${st.b2b_referrer_months}" required></label></div>
        <button class="btn primary block" type="submit">Salvar regras</button></form></div>
    <div class="card" id="simA"><h3>Simulador: quanto custa uma indicação?</h3>
      <label class="f">Plano<select class="in" data-sima="plan">${plans.map(p => raw(html`<option value="${p.id}" data-price="${p.price_cents}" data-cost="${p.cost_cents}" data-mm="${p.min_margin_pct}">${p.name} · ${money(p.price_cents)}</option>`))}</select></label>
      <label class="f">Quanto tempo a empresa fica (meses)<input class="in" inputmode="numeric" data-sima="keep" value="12"></label>
      <div id="simA-out"></div></div>`;
  return plans.length ? html`${plans.map(p => raw(html`<div class="card plancard2">
      <div class="row between"><h3>${p.name} ${p.active ? '' : raw('<span class="badge tone-bad">desativado</span>')}</h3><b class="mono">${money(p.price_cents)}<span class="small muted">/mês</span></b></div>
      <p class="small muted" style="margin:2px 0 10px">${p.max_personals == null ? 'Personais ilimitados' : p.max_personals + ' ' + pl(p.max_personals, 'personal', 'personais')} · ${p.max_students == null ? 'alunos ilimitados' : p.max_students + ' alunos'} · ${p.companies} ${pl(p.companies, 'empresa', 'empresas')}</p>
      <div class="tags"><span class="badge">Custo ${money(p.cost_cents)}</span><span class="badge tone-ok">Sobra ${money(p.ceiling.margin_cents)} (${fmtNum(p.ceiling.margin_pct, 0)}%)</span><span class="badge">Desconto máx. ${money(p.ceiling.effective_max_discount_cents)} (${fmtNum(p.ceiling.effective_max_discount_pct, 1)}%)</span></div>
      <button class="btn sm block" style="margin-top:12px" data-act="plan-edit" data-id="${p.id}" data-p="${JSON.stringify(p)}">Editar plano</button></div>`))}` : html`<div class="empty">Nenhum plano ainda. Toque em "+ Plano".</div>`;
}
function simARefresh() {
  const box = $('#simA-out'); if (!box || !PLT) return;
  const o = $('#simA select[data-sima=plan]').selectedOptions[0], P = +o.dataset.price, K = +o.dataset.cost, mm = +o.dataset.mm;
  const keep = Math.max(1, +$('#simA [data-sima=keep]').value || 12), st = PLT.settings;
  const floor = P * mm / 100, maxD = Math.min(Math.max(0, P - K - floor), P * (PLT.max_discount_pct || 10) / 100);
  const d1 = Math.min(P * st.b2b_referred_pct / 100, maxD), d2 = Math.min(P * st.b2b_referrer_pct / 100, maxD);
  const c1 = d1 * st.b2b_referred_months, c2 = d2 * st.b2b_referrer_months, cac = c1 + c2, mon = P - K;
  box.innerHTML = html`<ul class="list sum"><li><span class="muted">Desconto do indicado (${st.b2b_referred_months} ${pl(st.b2b_referred_months, 'mês', 'meses')})</span><b>${money(c1)}</b></li><li><span class="muted">Desconto de quem indicou (${st.b2b_referrer_months} ${pl(st.b2b_referrer_months, 'mês', 'meses')})</span><b>${money(c2)}</b></li><li><span class="muted"><b>Custo total da indicação</b></span><b class="neg">${money(cac)}</b></li><li><span class="muted">Margem por mês (sem desconto)</span><b>${money(mon)}</b></li><li><span class="muted">Margem do novo cliente em ${keep} meses, já sem o desconto dele</span><b>${money(mon * keep - c1)}</b></li><li><span class="muted"><b>Ganho líquido da indicação</b> (depois dos dois descontos)</span><b class="${mon * keep - cac >= 0 ? 'pos' : 'neg'}">${money(mon * keep - cac)}</b></li><li><span class="muted">A indicação se paga em</span><b>${mon > 0 ? (cac / mon <= 1 ? 'menos de 1 mês' : fmtNum(cac / mon, 1) + ' meses') : '–'}</b></li></ul>
    ${(P * st.b2b_referred_pct / 100 > maxD || P * st.b2b_referrer_pct / 100 > maxD) ? raw('<div class="infobox"><span>O desconto pedido passa do máximo (10% ou o teto de margem do plano): o sistema aplica só o máximo, para proteger a sua margem.</span></div>') : ''}`;
}
document.addEventListener('input', e => { if (e.target.matches?.('[data-sima]')) simARefresh(); });
document.addEventListener('change', e => { if (e.target.matches?.('[data-sima]')) simARefresh(); });

route(/^#\/aprovacoes$/, async () => {
  const { exercises } = await api('GET', 'approvals');
  return html`<div class="page-title"><div><div class="eyebrow">Gestor geral</div><h1>Aprovações</h1></div></div>
    <p class="hint">Exercícios criados pelas academias só entram na lista geral do app depois que você aprova.</p>
    ${exercises.length ? '' : raw('<div class="empty">Nenhum exercício aguardando aprovação.</div>')}
    ${exercises.map(x => raw(html`<div class="card"><div class="media-box small">${raw(mediaTag(x.media, x.name, 'ex-big'))}</div>
      <div class="row between" style="margin-top:8px"><h3>${x.name}</h3><span class="badge tone-warn">aguardando</span></div>
      <div class="small muted">${MUSCLE[x.muscle]} · ${EQUIP[x.equipment]} · enviado por ${x.author || '–'} (${x.company})</div>
      ${x.steps?.length ? raw(html`<ol class="how">${x.steps.map(s => raw(html`<li>${s}</li>`))}</ol>`) : ''}
      <div class="row" style="gap:10px"><button class="btn primary" style="flex:1" data-act="appr-ok" data-id="${x.id}">Aprovar</button><button class="btn danger" style="flex:1" data-act="appr-no" data-id="${x.id}">Recusar</button></div></div>`))}`;
});

/* ---- Extras nas telas "Mais" ---- */
function extraMais() {
  const r = S.user.role;
  const link = (h, ic, t, s) => html`<a class="card linkcard" href="${h}"><span class="ic">${raw(ICON[ic])}</span><span class="grow"><b>${t}</b><span class="small muted" style="display:block">${s}</span></span><span class="chev">›</span></a>`;
  if (r === 'aluno') return html`${raw(link('#/assinatura', 'wallet', 'Minha assinatura', S.user.access_until ? 'Acesso até ' + fmtD(S.user.access_until) + '. Renovar com PIX.' : 'Renovar com PIX'))}${raw(link('#/indicar', 'gift', 'Indicar amigos', 'Ganhe desconto na renovação'))}`;
  if (r === 'admin') return html`${raw(link('#/marca', 'palette', 'Marca da empresa', 'Logo, nome, slogan e cores'))}<div id="outbox-box"></div>`;
  if (r === 'super') return html`${raw(link('#/gestor/usuarios', 'users', 'Todos os usuários', 'Contatos e acessos'))}${raw(link('#/exercicios', 'dumb', 'Exercícios', 'Lista geral do app'))}${raw(link('#/financeiro', 'wallet', 'Financeiro das empresas', 'Receita, comissões e planos'))}<div id="pb-box"></div><div id="mail-box"></div><div id="outbox-box"></div>`;
  return '';
}
/** Cartão de suporte no "Mais" (todos os perfis), quando configurado. */
function supportCard() {
  const sp = S.support; if (!sp) return '';
  return html`<div class="card"><h3>Precisa de ajuda?</h3><p class="small muted" style="margin:4px 0 10px">Fale com o suporte do aplicativo.</p>${raw(supportButtons('Olá! Preciso de ajuda no ' + appName() + '.', 'Ajuda no ' + appName()))}</div>`;
}
async function mountMais() {
  if (S.user.role === 'super' && $('#pb-box')) {
    try {
      const s = await api('GET', 'pagbank/status');
      $('#mail-box').innerHTML = html`<div class="card"><h3>E-mail</h3><ul class="list sum"><li><span class="muted">Envio</span><b>${s.mail === 'smtp' ? 'SMTP (recomendado)' : s.mail === 'desligado' ? 'desligado' : 'mail() da hospedagem (pode não entregar)'}</b></li></ul><button class="btn block" data-act="mail-test" style="margin-top:10px">Enviar e-mail de teste para mim</button></div>`;
      $('#pb-box').innerHTML = html`<div class="card"><h3>PagBank (PIX)</h3><ul class="list sum"><li><span class="muted">Conexão</span><b>${s.configured ? 'configurada (' + (s.env === 'production' ? 'produção' : 'testes/sandbox') + ')' : 'sem token no config.php'}</b></li><li><span class="muted">Endereço do app (app_url)</span><b>${s.app_url || 'não definido'}</b></li><li><span class="muted">Aviso automático (webhook)</span><b>${s.https ? 'ativo' : 'precisa de https'}</b></li><li><span class="muted">PIX pagos / aguardando</span><b>${s.paid} / ${s.pending}</b></li></ul>
        <button class="btn block" data-act="pb-test" style="margin-top:10px">Testar conexão com o PagBank</button></div>`;
    } catch { /* sem painel */ }
  }
  if (S.user.role !== 'aluno' && S.user.role !== 'personal' && $('#outbox-box')) loadOutbox();
}
/** Links de senha que o e-mail não entregou: o administrador copia o link e manda à pessoa. */
async function loadOutbox() {
  try {
    const { items } = await api('GET', `manage/outbox${S.user.role === 'super' && typeof TEAM !== 'undefined' && TEAM?.cid ? '?company_id=' + TEAM.cid : ''}`);
    const box = $('#outbox-box'); if (!box) return;
    box.innerHTML = items.length ? html`<div class="card"><h3>Fila de envio (${items.length})</h3><p class="hint">O e-mail destes links não foi entregue. Copie o link e envie à pessoa por onde preferir.</p><ul class="list">${items.map(i => raw(html`<li><div class="grow"><div class="t">${i.name}</div><div class="s">link de nova senha</div></div><button class="btn sm" data-act="outbox-copy" data-id="${i.id}" data-v="${(i.text.match(/https?:\/\/\S+/) || [''])[0]}">${raw(ICON.copy)} Copiar link</button></li>`))}</ul></div>` : '';
  } catch { /* sem fila */ }
}

/* =====================================================================
 *  Ações e formulários
 * ===================================================================== */
const copyText = async (v, msg = 'Copiado!') => { try { await navigator.clipboard.writeText(v); toast(msg); } catch { toast('Selecione e copie manualmente.', true); } };
/** Botões de contato com o suporte (WhatsApp e e-mail), quando o config.php tem 'support'. */
function supportButtons(whatsText, mailSubject) {
  const sp = S.support; if (!sp) return '';
  return (sp.whatsapp ? '<a class="btn block" style="margin-bottom:10px" target="_blank" rel="noopener" href="https://wa.me/' + esc(sp.whatsapp) + '?text=' + encodeURIComponent(whatsText) + '">' + ICON.whats + ' Falar com o suporte pelo WhatsApp</a>' : '')
    + (sp.email ? '<a class="btn block" style="margin-bottom:10px" href="mailto:' + esc(sp.email) + '?subject=' + encodeURIComponent(mailSubject) + '">Falar com o suporte por e-mail</a>' : '');
}
const appName = () => S.brand?.app_name || 'aplicativo';
/** Login bloqueado por excesso de tentativas: saídas rápidas, sem esperar. */
function throttleActions() {
  return '<button type="button" class="btn primary block" style="margin-bottom:10px" data-act="auth-toggle" data-mode="forgot">Esqueci minha senha (link por e-mail)</button>'
    + supportButtons('Olá! Não consigo entrar no ' + appName() + '. Pode me ajudar a redefinir a senha?', 'Ajuda para entrar')
    + '<p class="small muted center" style="margin:0 0 12px">Ou peça ao administrador da sua academia ou ao seu personal para <b>liberar o seu acesso agora</b>.</p>';
}
/** Assinatura vencida, acesso bloqueado ou cadastro ainda pendente: fala com a academia (ou com o suporte da plataforma). */
function supportActions(code) {
  const why = code === 'pending' ? 'meu cadastro ainda está aguardando aprovação' : 'o meu acesso está bloqueado ou vencido';
  return supportButtons('Olá! No ' + appName() + ', ' + why + '. Pode me ajudar?', code === 'pending' ? 'Cadastro aguardando aprovação' : 'Acesso bloqueado ou vencido')
    + '<p class="small muted center" style="margin:0 0 12px">Ou fale com o seu personal ou com a sua academia.</p>';
}

Object.assign(acts, {
  'user-unlock': guard(async el => { await api('POST', 'manage/unlock', { user_id: +el.dataset.id }); toast('Tentativas liberadas. A pessoa já pode tentar entrar.'); }),
  'unlock-all': guard(async () => {
    if (!await ask('Liberar o login de todos?', 'Apaga as tentativas de login erradas de todos os usuários desta empresa. Todos podem tentar entrar agora.', 'Liberar', { danger: false })) return;
    const r = await api('POST', 'manage/unlock', { company_id: (typeof TEAM !== 'undefined' && TEAM?.cid) || undefined }); toast('Liberado (' + r.released + ' registros).');
  }),
  'pw-toggle': el => {
    const inp = el.closest('.pw')?.querySelector('input'); if (!inp) return;
    const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
    el.innerHTML = show ? ICON.eyeoff : ICON.eye; el.setAttribute('aria-pressed', String(show)); el.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  },
  'copy-text': el => copyText(el.dataset.v, 'Código copiado!'),
  'pix-copy': () => copyText($('#pix-text')?.value || '', 'Código PIX copiado! Cole no app do seu banco.'),
  'pay-done': () => { closeModal(); if (S.user) render(); else { authModeVal = 'login'; S.renew = null; renderAuth(); toast('Pronto! Agora é só entrar.'); } },
  'renew-open': guard(() => renewOpen()),
  'forgot-email': guard(async () => { const r = await api('POST', 'password/forgot', { email: S.forgotEmail }); S.forgotMsg = r.message; toast('Se o e-mail existir, enviamos o link de novo.'); }),
  'fin-tab': el => { setTimeout(simBRefresh, 0); FIN.tab = el.dataset.t; $$('[data-act=fin-tab]').forEach(b => b.setAttribute('aria-selected', b === el)); $('#fin-body').innerHTML = finTab(); },
  'cplan-edit': el => {
    const p = FIN.plans.find(x => x.id == el.dataset.id) || { id: '', name: '', months: 1, price_cents: 0, active: true };
    openModal(html`<div class="row between" style="margin-bottom:6px"><h2>${p.id ? 'Editar plano' : 'Novo plano'}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
      <form data-form="cplan" data-id="${p.id}"><label class="f">Nome do plano<input class="in" name="name" value="${p.name}" maxlength="60" required placeholder="Ex.: Trimestral"></label>
        <label class="f">Duração<select class="in" name="months">${[1, 2, 3, 6, 12, 24].map(m => raw(html`<option value="${m}" ${m === p.months ? raw('selected') : ''}>${m} ${pl(m, 'mês', 'meses')}</option>`))}</select></label>
        <label class="f">Valor do plano inteiro (R$)<input class="in" name="price" inputmode="decimal" value="${p.price_cents ? centsToInput(p.price_cents) : ''}" required placeholder="210,00"></label>
        ${p.id ? raw(html`<label class="chk"><input type="checkbox" name="active" value="1" ${p.active ? raw('checked') : ''}> Plano ativo (aparece para os alunos)</label>`) : ''}
        <div class="stack"><button class="btn primary block" type="submit">Salvar plano</button>${p.id ? raw(html`<button type="button" class="btn danger block" data-act="cplan-del" data-id="${p.id}">Excluir plano</button>`) : ''}</div></form>`);
  },
  'cplan-del': guard(async el => {
    closeModal(); if (!await ask('Excluir plano?', 'Se já houve pagamentos nele, o plano só é desativado (o histórico fica).', 'Excluir')) return;
    await api('DELETE', `finance/plans/${el.dataset.id}${finQs()}`); toast('Plano removido.'); render();
  }),
  'fin-commission': guard(async el => {
    if (!await ask(`Repassar ${money(el.dataset.v)} a ${el.dataset.n}?`, 'Confirme depois de fazer o pagamento ao personal. O app só registra que foi repassado.', 'Já repassei', { danger: false })) return;
    await api('POST', 'finance/commissions/pay', { user_id: +el.dataset.id, company_id: FIN.cid || undefined }); toast('Repasse registrado.'); render();
  }),
  'fin-manual': guard(async () => {
    const { students } = await api('GET', `students${S.user.role === 'super' ? '?company_id=' + FIN.cid : ''}`);
    openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Registrar pagamento</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
      ${FIN.plans.some(p => p.active) && students.length ? raw(html`<form data-form="fin-manual"><label class="f">Aluno<select class="in" name="user_id">${students.map(s => raw(html`<option value="${s.id}">${s.name}</option>`))}</select></label>
        <label class="f">Plano<select class="in" name="plan_id">${FIN.plans.filter(p => p.active).map(p => raw(html`<option value="${p.id}">${p.name} · ${money(p.price_cents)}</option>`))}</select></label>
        <p class="hint">O acesso do aluno soma o período do plano. Descontos de indicação disponíveis são aplicados automaticamente.</p><button class="btn primary block" type="submit">Registrar e renovar acesso</button></form>`) : raw('<div class="empty">Cadastre um plano e tenha ao menos um aluno ativo.</div>')}`);
  }),
  'plan-edit': el => {
    const p = el.dataset.p ? JSON.parse(el.dataset.p) : { id: '', name: '', price_cents: 0, max_personals: 1, max_students: 50, active: true, cost_cents: 0, min_margin_pct: 40 };
    openModal(html`<div class="row between" style="margin-bottom:10px"><h2>${p.id ? 'Editar plano' : 'Novo plano'}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
      <div class="scroll"><form data-form="plan" data-id="${p.id}" class="formv">
        <label class="f">Nome do plano<input class="in" name="name" value="${p.name}" maxlength="60" required></label>
        <label class="f">Mensalidade da empresa (R$)<input class="in" name="price" inputmode="decimal" value="${centsToInput(p.price_cents)}" required></label>
        <div class="fgroup"><div class="fg-t">Limites</div><div class="grid2">
          <label class="f">Personais<input class="in" name="max_personals" inputmode="numeric" value="${p.max_personals ?? ''}" placeholder="vazio = ilimitado"></label>
          <label class="f">Alunos ativos<input class="in" name="max_students" inputmode="numeric" value="${p.max_students ?? ''}" placeholder="vazio = ilimitado"></label></div></div>
        <div class="fgroup"><div class="fg-t">Custo e margem</div><div class="grid2">
          <label class="f">Custo por conta (R$/mês)<input class="in" name="cost" inputmode="decimal" value="${centsToInput(p.cost_cents || 0)}" data-ceil placeholder="8,00"></label>
          <label class="f">Margem mínima (%)<input class="in" name="min_margin_pct" inputmode="decimal" value="${p.min_margin_pct ?? 40}" data-ceil></label></div>
          <p class="hint" style="margin:0 0 8px">Custo = suporte, hospedagem rateada e taxas. A margem mínima limita os descontos de indicação.</p>
          <div class="infobox" data-ceil-out style="margin:0"><span>Preencha preço, custo e margem para ver o desconto máximo.</span></div></div>
        ${p.id ? raw(html`<label class="chk"><input type="checkbox" name="active" value="1" ${p.active ? raw('checked') : ''}> Plano ativo (aparece para as empresas)</label>`) : ''}
        <div class="stack" style="margin-top:6px"><button class="btn primary block" type="submit">Salvar plano</button>${p.id ? raw(html`<button type="button" class="btn danger block" data-act="plan-del" data-id="${p.id}">Excluir plano</button>`) : ''}</div></form></div>`);
    setTimeout(() => { const fm = $('.modal form[data-form=plan]'); if (fm) ceilRefresh(fm); }, 0);
  },
  'plt-tab': el => { PLTAB = el.dataset.t; $$('[data-act=plt-tab]').forEach(b => b.setAttribute('aria-selected', b === el)); $('#plt-body').innerHTML = pltTab(); simARefresh(); },
  'plan-del': guard(async el => { closeModal(); if (!await ask('Excluir plano?', 'Só é possível se nenhuma empresa estiver nele.', 'Excluir')) return; await api('DELETE', `plans/${el.dataset.id}`); toast('Plano excluído.'); render(); }),
  'co-plan': guard(async el => {
    const [{ companies, plans }] = [await api('GET', 'companies')]; const c = companies.find(x => x.id == el.dataset.id);
    openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Plano de ${c.name}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
      <form data-form="co-plan" data-id="${c.id}"><label class="f">Plano<select class="in" name="plan_id"><option value="">Sem plano (sem limite)</option>${plans.filter(p => p.active || p.id === c.plan_id).map(p => raw(html`<option value="${p.id}" ${p.id === c.plan_id ? raw('selected') : ''}>${p.name} · ${money(p.price_cents)}/mês</option>`))}</select></label>
        <p class="hint">Uso atual: ${c.personals} personais e ${c.alunos_ativos} alunos ativos. Mudar de plano não apaga ninguém; só impede novas aprovações acima do limite.</p><button class="btn primary block" type="submit">Salvar</button></form>`);
  }),
  'appr-ok': guard(async el => { await api('POST', `approvals/${el.dataset.id}`, { decision: 'aprovar' }); toast('Exercício aprovado na lista geral.'); render(); }),
  'appr-no': guard(async el => {
    openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Recusar exercício</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
      <form data-form="appr-no" data-id="${el.dataset.id}"><label class="f">Motivo (o autor vai ler)<textarea class="in" name="reason" rows="3" maxlength="200" required placeholder="Ex.: animação cortada, explique melhor o passo 2."></textarea></label><button class="btn danger block" type="submit">Recusar</button></form>`);
  }),
  'ex-submit': guard(async el => {
    if (!await ask('Enviar para a lista geral?', 'O gestor geral vai analisar. Se aprovar, o exercício passa a aparecer para todas as academias.', 'Enviar para aprovação', { danger: false })) return;
    await api('POST', `company/exercises/${el.dataset.id}/submit`); closeModal(); await loadExercises(true); toast('Enviado para aprovação.'); render();
  }),
  'pb-test': guard(async () => { const r = await api('POST', 'pagbank/test'); toast(r.ok ? 'Conexão com o PagBank funcionando.' : 'O PagBank respondeu com erro ' + r.status, !r.ok); }),
  'outbox-copy': guard(async el => { await copyText(el.dataset.v, 'Link copiado. Envie à pessoa e ele some da fila.'); await api('POST', `manage/outbox/${el.dataset.id}/done`); setTimeout(loadOutbox, 600); }),
  'mail-test': guard(async el => { el.disabled = true; try { const r = await api('POST', 'mail/test'); toast(r.ok ? `E-mail de teste enviado para ${r.to} (${r.mode}). Confira a caixa de entrada e o spam.` : `Falhou: ${r.error}`, !r.ok); } finally { el.disabled = false; } }),
});

function ceilRefresh(form) {
  const out = form.querySelector('[data-ceil-out]'); if (!out) return;
  const P = toCents(form.price.value), K = toCents(form.cost.value || '0'), mm = parseFloat(String(form.min_margin_pct.value).replace(',', '.'));
  if (!Number.isFinite(P) || !Number.isFinite(K) || !Number.isFinite(mm)) return;
  const floor = P * mm / 100, max = Math.max(0, P - K - floor);
  out.innerHTML = '<span>Margem por conta: <b>' + money(P - K) + '</b> (' + fmtNum(P ? 100 * (P - K) / P : 0, 1) + '%). Margem mínima: <b>' + money(floor) + '</b>. <b>Desconto máximo por mês: ' + money(Math.min(max, P * 0.10)) + ' (' + fmtNum(P ? 100 * Math.min(max, P * 0.10) / P : 0, 1) + '%)</b>' + (max < P * 0.10 ? ' (limitado pela margem)' : ' (regra fixa de 10%)') + '.</span>';
}
document.addEventListener('input', e => { const f = e.target.closest?.('form[data-form=plan]'); if (f && (e.target.matches('[data-ceil]') || e.target.name === 'price')) ceilRefresh(f); });
const priceBody = d => { const c = toCents(d.price); if (!Number.isFinite(c) || c < 0) throw new Error('Informe o valor em reais, como 79,90.'); return c; };
Object.assign(forms, {
  forgot: async d => { const r = await api('POST', 'password/forgot', { email: d.email }); S.forgotMsg = r.message; S.forgotEmail = d.email; authMode('forgot-sent'); },
  reset: async (d, f) => { await api('POST', 'password/reset', { token: f.dataset.token, password: d.password }); authModeVal = 'login'; location.hash = '#/entrar'; renderAuth(); toast('Senha criada. Agora é só entrar.'); },
  'pay-create': async d => { const r = await api('POST', 'pay/create', { plan_id: d.plan_id ? +d.plan_id : undefined, tax_id: d.tax_id }); showPix(r.payment, { onPaid: () => { if (S.user) S.user.access_until = null; } }); },
  'pay-renew': async d => { const r = await api('POST', 'pay/renew', { ...S.renew, plan_id: +d.plan_id, tax_id: d.tax_id }); showPix(r.payment); },
  cplan: async (d, f) => {
    const body = { name: d.name, months: +d.months, price_cents: priceBody(d), active: f.dataset.id ? !!d.active : true, company_id: FIN.cid || undefined };
    const r = await api(f.dataset.id ? 'PUT' : 'POST', f.dataset.id ? `finance/plans/${f.dataset.id}` : 'finance/plans', body); FIN.plans = r.plans; closeModal(); toast('Plano salvo.'); render();
  },
  'fin-settings': async d => {
    const body = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, parseFloat(String(v).replace(',', '.'))]));
    await api('PUT', `finance/settings${finQs()}`, { ...body, company_id: FIN.cid || undefined }); toast('Regras salvas.');
  },
  'fin-manual': async d => { const r = await api('POST', 'finance/manual', { user_id: +d.user_id, plan_id: +d.plan_id, company_id: FIN.cid || undefined }); closeModal(); toast('Pagamento registrado. Acesso até ' + fmtD(r.access_until) + '.'); render(); },
  plan: async (d, f) => {
    const body = { name: d.name, price_cents: priceBody(d), max_personals: d.max_personals ? +d.max_personals : null, max_students: d.max_students ? +d.max_students : null, cost_cents: Math.max(0, toCents(d.cost || '0')) || 0, min_margin_pct: parseFloat(String(d.min_margin_pct || '40').replace(',', '.')), active: f.dataset.id ? !!d.active : true };
    await api(f.dataset.id ? 'PUT' : 'POST', f.dataset.id ? `plans/${f.dataset.id}` : 'plans', body); closeModal(); toast('Plano salvo.'); render();
  },
  'platform-rules': async d => {
    const body = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, parseFloat(String(v).replace(',', '.'))]));
    PLT = await api('PUT', 'platform/settings', body); toast('Regras entre empresas salvas.'); render();
  },
  'co-plan': async (d, f) => { await api('PATCH', `companies/${f.dataset.id}`, { plan_id: d.plan_id ? +d.plan_id : null }); closeModal(); toast('Plano da empresa atualizado.'); render(); },
  'appr-no': async (d, f) => { await api('POST', `approvals/${f.dataset.id}`, { decision: 'recusar', reason: d.reason }); closeModal(); toast('Exercício recusado.'); render(); },
});
