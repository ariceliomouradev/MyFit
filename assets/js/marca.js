/* Meus Treinos V2 · marca (white-label): logo, nome, slogan e paleta, e troca obrigatória da senha provisória. */
'use strict';

/* ---------- cores ---------- */
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lumHex = h => { const c = hexRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const contrastHex = (a, b) => { const x = lumHex(a), y = lumHex(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const DEFAULT_BRAND = { app_name: 'Meus Treinos', slogan: 'Seu diário de treino, rotinas e recordes.', accent: '#f5a524', bg: '#101418', logo: null };
const THEME_VARS = ['--ambar', '--ambar-forte', '--ambar-escuro', '--ambar-meio', '--on-ambar', '--fundo', '--fundo-fundo', '--superficie', '--superficie-2', '--borda'];

/** Deriva todas as cores do app a partir de duas: destaque e fundo. */
function themeVars(b) {
  const a = b.accent, bg = b.bg;
  const on = contrastHex(a, '#101418') >= contrastHex(a, '#ffffff') ? '#101418' : '#ffffff';
  return { '--ambar': a, '--ambar-forte': mixHex(a, '#ffffff', .25), '--ambar-escuro': mixHex(a, '#000000', .42), '--ambar-meio': mixHex(a, '#000000', .1), '--on-ambar': on,
    '--fundo': bg, '--fundo-fundo': mixHex(bg, '#000000', .3), '--superficie': mixHex(bg, '#ffffff', .05), '--superficie-2': mixHex(bg, '#ffffff', .09), '--borda': mixHex(bg, '#ffffff', .15) };
}
/** Aplica a marca na tela. preview=true não altera a marca "oficial" (S.brand). */
function applyBrand(b, preview = false) {
  b = { ...DEFAULT_BRAND, ...(b || {}) };
  if (!preview) S.brand = b;
  const root = document.documentElement.style;
  if (b.accent === DEFAULT_BRAND.accent && b.bg === DEFAULT_BRAND.bg) THEME_VARS.forEach(v => root.removeProperty(v)); // identidade padrão: usa o CSS como está
  else Object.entries(themeVars(b)).forEach(([k, v]) => root.setProperty(k, v));
  if (!preview) {
    document.title = b.app_name;
    $('meta[name=theme-color]')?.setAttribute('content', b.bg);
    $('meta[name=apple-mobile-web-app-title]')?.setAttribute('content', b.app_name);
  }
}
/** Logo + nome para a barra de cima e o assistente. */
function brandMark(href = '#/') {
  const b = S.brand || DEFAULT_BRAND;
  return `<a class="brand" href="${esc(href)}"><img src="${esc(b.logo || 'assets/img/logo-icone.svg')}" alt="" width="30" height="30" class="brand-img"><span>${esc(b.app_name)}</span></a>`;
}

/* ---------- senha provisória: troca obrigatória ---------- */
const forcePwdHtml = () => html`<div class="auth">
  <img class="logo sm" src="${S.brand?.logo || 'assets/img/logo-icone.svg'}" alt="">
  <h1>Crie a sua senha</h1><p class="sub">Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.</p>
  <div id="auth-err"></div>
  <form data-form="force-pwd" novalidate>
    ${raw(pwField('current', 'Senha provisória (a que você recebeu)'))}
    ${raw(pwField('new', 'Nova senha', { auto: 'new-password', rules: true }))}
    ${raw(pwField('again', 'Repita a nova senha', { auto: 'new-password' }))}
    <button class="btn primary block" type="submit">Salvar e entrar</button></form>
  <button class="btn ghost block" style="margin-top:10px" data-act="logout">Sair</button></div>`;
Object.assign(forms, {
  'force-pwd': async d => {
    if (d.new !== d.again) throw new Error('As duas senhas novas não são iguais.');
    await api('POST', 'password', { current: d.current, new: d.new });
    await boot(); toast('Senha criada!'); go(homeFor(S.user.role)); render();
  },
});

/* =====================================================================
 *  Tela "Marca" (gestor geral e administrador da empresa)
 * ===================================================================== */
const ACCENTS = [['#f5a524', 'Âmbar'], ['#ff7a1a', 'Laranja'], ['#ff5a5f', 'Vermelho'], ['#ff5fa2', 'Rosa'], ['#a77bff', 'Roxo'], ['#4da3ff', 'Azul'], ['#2ed3d3', 'Ciano'], ['#3ddc84', 'Verde'], ['#c6e84b', 'Lima']];
const BGS = [['#101418', 'Grafite'], ['#0a0a0a', 'Preto'], ['#0d1320', 'Azul-noite'], ['#0e1612', 'Floresta'], ['#1a1014', 'Vinho'], ['#140f1f', 'Roxo-noite']];
let BR = null;
const contrastHtml = (ratio, okC, okBg) => `${okBg ? '' : '<b class="bad-t">O fundo precisa ser escuro.</b> '}Contraste ${fmtNum(ratio, 1)}:1 ${okC ? '<b class="ok-t">(legível)</b>' : '<b class="bad-t">(baixo: o mínimo é 3:1)</b>'}`;

route(/^#\/marca$/, async () => {
  const isSuper = S.user.role === 'super';
  const companies = isSuper ? (await api('GET', 'companies')).companies : [];
  const cid = BR && isSuper ? BR.cid : 0;
  return brandPage(cid, companies);
}, { after: () => brandPaint() });

async function brandPage(cid, companies) {
  const d = await api('GET', `brand${cid ? '?company_id=' + cid : ''}`);
  const eff = d.effective, raw = d.raw;
  BR = { cid, companies, scope: d.scope, parent: d.parent, raw, logo: raw.logo,
    draft: { app_name: raw.app_name ?? '', slogan: raw.slogan ?? '', accent: raw.accent ?? eff.accent, bg: raw.bg ?? eff.bg, accentSet: !!raw.accent, bgSet: !!raw.bg } };
  return brandHtml();
}

function brandHtml() {
  const { draft: dr, scope, parent, cid, companies } = BR, isSuper = S.user.role === 'super';
  const eff = { app_name: dr.app_name || parent.app_name, slogan: dr.slogan || parent.slogan, accent: dr.accent, bg: dr.bg, logo: BR.logo || parent.logo };
  const ratio = contrastHex(eff.accent, eff.bg), okC = ratio >= 3, okBg = lumHex(eff.bg) <= .12;
  const sw = (list, key, cur) => list.map(([v, n]) => `<button type="button" class="sw" style="background:${v}" data-act="br-pick" data-k="${key}" data-v="${v}" aria-pressed="${cur.toLowerCase() === v}" aria-label="${n}" title="${n}"></button>`).join('');
  return html`
    <div class="page-title"><div><div class="eyebrow">${scope.type === 'global' ? 'Gestor geral' : (isSuper ? 'Marca da empresa' : 'Administrador')}</div><h1>Marca</h1></div></div>
    ${isSuper ? raw(html`<label class="f">Qual marca editar?<select class="in" id="br-scope"><option value="0" ${!cid ? raw('selected') : ''}>Marca global (vale para todas as empresas)</option>${companies.map(c => raw(html`<option value="${c.id}" ${c.id === cid ? raw('selected') : ''}>${c.name}</option>`))}</select></label>`) : ''}
    <p class="hint" style="margin-top:0">${scope.type === 'global' ? 'Esta é a marca padrão. Cada empresa pode ter a sua própria; o que ela não mudar, herda desta.' : `Esta é a marca que os usuários de ${scope.company_name || 'sua empresa'} veem. O que ficar em branco usa a marca padrão.`}</p>
    <div class="card brand-prev" aria-label="Pré-visualização">
      <div class="bp-head"><img src="${esc(eff.logo || 'assets/img/logo-icone.svg')}" alt="" class="bp-logo"><div><b>${eff.app_name}</b><small>${eff.slogan}</small></div></div>
      <div class="row wrap" style="margin-top:12px"><span class="btn primary sm">Iniciar treino</span><span class="btn sm">Plano</span><span class="badge pr">Recorde</span><span class="chip" aria-pressed="true">Filtro</span></div></div>
    <div class="card"><h3>Identidade</h3>
      <label class="f">Nome exibido no app<input class="in" id="br-name" maxlength="40" value="${dr.app_name}" placeholder="${parent.app_name}"></label>
      <label class="f">Slogan<input class="in" id="br-slogan" maxlength="90" value="${dr.slogan}" placeholder="${parent.slogan}"></label>
      <div class="f">Logo<span class="hint" style="display:block;font-weight:400">PNG, JPG ou WebP até 3 MB. Fundo transparente fica melhor. Aparece no topo e no login.</span>
        <div class="media-pick"><img class="thumb" src="${esc(BR.logo || parent.logo || 'assets/img/logo-icone.svg')}" alt="Logo atual" style="background:var(--superficie-2);object-fit:contain">
          <label class="btn sm">${raw(ICON.camera)} Enviar logo<input type="file" accept="image/png,image/jpeg,image/webp" class="sr" id="br-logo"></label>
          ${BR.logo ? raw('<button class="btn sm ghost" data-act="br-logo-rm">Remover</button>') : ''}</div></div></div>
    <div class="card"><h3>Cores</h3>
      <div class="f">Cor de destaque (botões, abas, links)<div class="swatches">${raw(sw(ACCENTS, 'accent', dr.accent))}<label class="sw custom" title="Outra cor"><input type="color" id="br-accent" value="${dr.accent}" aria-label="Escolher outra cor de destaque"><span>+</span></label></div></div>
      <div class="f">Cor de fundo<div class="swatches">${raw(sw(BGS, 'bg', dr.bg))}<label class="sw custom" title="Outra cor"><input type="color" id="br-bg" value="${dr.bg}" aria-label="Escolher outra cor de fundo"><span>+</span></label></div></div>
      <p class="small" id="br-contrast" style="margin:0">${raw(contrastHtml(ratio, okC, okBg))}</p></div>
    <div class="stack"><button class="btn primary block" data-act="br-save" ${okC && okBg ? '' : 'disabled'}>Salvar marca</button>
      <button class="btn block ghost" data-act="br-reset">Restaurar o padrão</button></div>`;
}
/** Redesenha a tela e aplica o rascunho como pré-visualização ao vivo (o app inteiro muda de cor). */
function brandPaint() {
  if (!BR) return;
  const dr = BR.draft;
  applyBrand({ ...(S.brand || {}), accent: dr.accent, bg: dr.bg }, true);
}
/** Atualiza só o contraste, o botão Salvar e as cores (sem recriar a tela: o seletor de cor do navegador não fecha). */
function brandLight() {
  const { accent, bg } = BR.draft, ratio = contrastHex(accent, bg), okC = ratio >= 3, okBg = lumHex(bg) <= .12;
  const c = $('#br-contrast'); if (c) c.innerHTML = contrastHtml(ratio, okC, okBg);
  const b = $('[data-act=br-save]'); if (b) b.disabled = !(okC && okBg);
  brandPaint();
}
const brandRepaint = () => { const y = scrollY; $('main').innerHTML = brandHtml(); brandPaint(); scrollTo(0, y); };

document.addEventListener('input', e => {
  if (!BR || !$('#br-name')) return;
  if (e.target.id === 'br-name') BR.draft.app_name = e.target.value;
  if (e.target.id === 'br-slogan') BR.draft.slogan = e.target.value;
  if (e.target.id === 'br-accent') { BR.draft.accent = e.target.value; brandLight(); }
  if (e.target.id === 'br-bg') { BR.draft.bg = e.target.value; brandLight(); }
  if (e.target.id === 'br-name' || e.target.id === 'br-slogan') { // atualiza só a pré-visualização, sem perder o foco
    const p = $('.brand-prev'); if (p) { $('b', p).textContent = BR.draft.app_name || BR.parent.app_name; $('small', p).textContent = BR.draft.slogan || BR.parent.slogan; }
  }
});
document.addEventListener('change', guard(async e => {
  if (!BR) return;
  if (e.target.id === 'br-scope') { BR.cid = +e.target.value; render(); }
  if (e.target.id === 'br-logo') {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) { e.target.value = ''; return toast('A logo passa de 3 MB.', true); }
    const fd = new FormData(); fd.append('file', f); if (BR.cid) fd.append('company_id', BR.cid);
    const r = await apiUpload('brand/logo', fd);
    toast('Logo atualizada.'); if (ownsBrand()) applyBrand({ ...r.effective, accent: S.brand.accent, bg: S.brand.bg }); render();
  }
}));
const ownsBrand = () => S.user.role === 'admin' || !BR.cid; // a marca que o próprio usuário enxerga

Object.assign(acts, {
  'br-pick': el => { BR.draft[el.dataset.k] = el.dataset.v; brandRepaint(); },
  'br-save': guard(async () => {
    const d = BR.draft;
    const r = await api('PUT', 'brand', { company_id: BR.cid || undefined, app_name: d.app_name, slogan: d.slogan, accent: d.accent, bg: d.bg });
    if (ownsBrand()) applyBrand(r.effective);
    toast('Marca salva.'); render();
  }),
  'br-reset': guard(async () => {
    if (!await ask('Restaurar o padrão?', BR.cid ? 'Esta empresa volta a usar a marca padrão (nome, slogan, cores e logo).' : 'Nome, slogan e cores voltam ao padrão do app. A logo também é removida.', 'Restaurar')) return;
    await api('PUT', 'brand', { company_id: BR.cid || undefined, app_name: '', slogan: '', accent: '', bg: '' });
    const r = await api('DELETE', `brand/logo${BR.cid ? '?company_id=' + BR.cid : ''}`).catch(() => null);
    const eff = r?.effective || (await api('GET', `brand${BR.cid ? '?company_id=' + BR.cid : ''}`)).effective;
    if (ownsBrand()) applyBrand(eff);
    toast('Marca restaurada.'); render();
  }),
  'br-logo-rm': guard(async () => {
    const r = await api('DELETE', `brand/logo${BR.cid ? '?company_id=' + BR.cid : ''}`);
    if (ownsBrand()) applyBrand({ ...r.effective, accent: S.brand.accent, bg: S.brand.bg }); toast('Logo removida.'); render();
  }),
});
