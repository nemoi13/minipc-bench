#!/usr/bin/env node
// MiniPC Bench: собирает статический сайт (RU/EN) из data/devices.json. Без внешних зависимостей, нужен только Node 18+.
// Запуск: node build.mjs   (результат в папке dist/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p) => fs.existsSync(path.join(ROOT, p));
const site = JSON.parse(rd('data/site.json'));
const crit = JSON.parse(rd('data/criteria.json'));

// адрес сайта: из настроек, либо автоматически из имени репозитория GitHub
let SITE_URL = (site.siteUrl || '').replace(/\/+$/, '');
if (!SITE_URL && process.env.GITHUB_REPOSITORY) {
  const [o, r] = process.env.GITHUB_REPOSITORY.split('/');
  SITE_URL = r.toLowerCase() === `${o}.github.io`.toLowerCase() ? `https://${o}.github.io` : `https://${o}.github.io/${r}`;
}
const NAME = site.name || 'MiniPC Bench';
const REPOSITORY = 'https://github.com/nemoi13/minipc-bench';
const LANGS = ['ru', 'en'];

/* ---------- данные ---------- */
const num = (v) => { if (v === null || v === undefined) return null; const s = String(v).trim().replace(',', '.'); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const tri = (v) => (v === true || v === false ? v : null);
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const readJson = (p, fb) => (has(p) ? JSON.parse(rd(p)) : fb);

const imgFiles = has('images') ? fs.readdirSync(path.join(ROOT, 'images')) : [];
function findImage(slug) { return imgFiles.find((f) => f.toLowerCase().replace(/\.(jpe?g|png|webp|avif)$/, '') === slug && /\.(jpe?g|png|webp|avif)$/i.test(f)) || null; }

const METRICS = crit.metrics; // единый список бенчмарков, он же строит форму админки
const BRANDS = readJson('data/brands.json', []);
const DEV = readJson('data/devices.json', []).map((r) => {
  const b = r.bench || {};
  const d = {
    slug: slugify(r.slug) || slugify(r.name), name: r.name, brand: r.brand || '', ff: r.ff === 'nas' ? 'nas' : 'mini',
    cpu: r.cpu || '', gpu: r.gpu || '', vendor: r.vendor || '', ram: num(r.ram), ramType: r.ramType || '', ramSoldered: tri(r.ramSoldered), ramMax: num(r.ramMax),
    ssd: num(r.ssd), storage: r.storage || '', price: num(r.price), tdp: num(r.tdp), temp: num(r.temp), vram: num(r.vram), npu: num(r.npu),
    maxModel: r.maxModel || '', bays: num(r.bays), lan: r.lan || '', lanG: num(r.lanG), lanPorts: num(r.lanPorts), oculink: tri(r.oculink), usb4: tri(r.usb4),
    uses: Array.isArray(r.uses) ? r.uses : [], avail: { instock: 2, limited: 1, out: 0 }[r.avail] ?? null, tested: r.tested || '',
    buyUrl: safeUrl(r.buyUrl), sumRu: r.sumRu || '', sumEn: r.sumEn || '', status: (r.status || 'published').toLowerCase(), demo: r.demo === true,
    bench: {}, src: r.benchSrc || {}, reviews: (r.reviews || []).filter((x) => safeUrl(x.url)),
  };
  METRICS.forEach((m) => { const v = num(b[m.k]); if (v !== null) { d.bench[m.k] = v; d[m.k] = v; } });
  d.image = findImage(d.slug);
  return d;
}).filter((d) => d.slug && d.name && d.status !== 'draft');

const REAL = DEV.filter((d) => !d.demo);

/* ---------- рейтинги: считаем только по тем данным, что есть ---------- */
const range = {};
const setRange = (k) => { const v = REAL.map((d) => d[k]).filter(isNum); range[k] = v.length ? [Math.min(...v), Math.max(...v)] : null; };
METRICS.forEach((m) => setRange(m.k)); ['price', 'tdp', 'temp', 'ram', 'vram'].forEach(setRange);
const nrm = (k, v, inv) => { if (!isNum(v) || !range[k]) return null; const r = range[k], x = r[1] === r[0] ? 0.5 : (v - r[0]) / (r[1] - r[0]); return inv ? 1 - x : x; };
const wavg = (pairs) => { let t = 0, s = 0; pairs.forEach(([w, v]) => { if (v !== null && v !== undefined) { t += w; s += w * v; } }); return t ? s / t : null; };
const PERF = ['pm_total', 'pm_cpu', 'cb23', 'gb6', 'cpuz_m'], GFX = ['sn_light', 'timespy', 'pm_3d'];
DEV.forEach((d) => {
  if (d.demo) return;
  d._perf = wavg(PERF.map((k) => [1, nrm(k, d[k])])); d._gfx = wavg(GFX.map((k) => [1, nrm(k, d[k])]));
  d._eff = d._perf !== null && isNum(d.tdp) && d.tdp > 0 ? d._perf / d.tdp : null;
  const q = wavg([[1, d._perf], [1, d._gfx]]); d._val = q !== null && isNum(d.price) && d.price > 0 ? q / d.price : null;
});
setRange('_eff'); setRange('_val');
const cl = crit.classes;
const pc100 = (v) => (v === null ? null : Math.round(v * 100));
DEV.forEach((d) => {
  const s = {};
  s.perf = pc100(d._perf); s.gfx = pc100(d._gfx);
  const hasAi = isNum(d.llm) || isNum(d.vram);
  s.ai = hasAi ? pc100(wavg([[0.55, nrm('llm', d.llm)], [0.25, nrm('vram', d.vram)], [0.2, nrm('ram', d.ram)]])) : null;
  s.cool = pc100(nrm('temp', d.temp, true)); s.eff = pc100(nrm('_eff', d._eff)); s.value = pc100(nrm('_val', d._val));
  s.avail = isNum(d.avail) ? Math.round((d.avail / 2) * 100) : null;
  const o = wavg([[0.3, s.perf], [0.15, s.gfx], [0.15, s.ai], [0.1, s.cool], [0.15, s.eff], [0.15, s.value]]);
  s.overall = o === null ? null : Math.round(o); d.s = s;
  if (d.demo) Object.keys(s).forEach((k) => { s[k] = null; });
  d.pc = s.perf === null ? null : s.perf >= cl.power.top ? 'top' : s.perf >= cl.power.strong ? 'strong' : s.perf >= cl.power.mid ? 'mid' : 'weak';
  d.hc = !isNum(d.temp) ? null : d.temp <= cl.temp.cool ? 'cool' : d.temp <= cl.temp.warm ? 'warm' : 'hot';
  const keys = ['cpu', 'gpu', 'ram', 'ramType', 'ssd', 'price', 'tdp', 'temp', 'buyUrl'], core = METRICS.filter((m) => m.core);
  d.fill = Math.round(((keys.filter((k) => d[k] !== '' && d[k] !== null && d[k] !== undefined).length + core.filter((m) => isNum(d[m.k])).length) / (keys.length + core.length)) * 100);
});
const byTested = [...DEV].sort((a, b) => (Date.parse(b.tested) || 0) - (Date.parse(a.tested) || 0));
/* ---------- подбор под сценарии: правила из data/criteria.json ---------- */
const RL = { ram: ['ОЗУ', 'RAM'], ramcap: ['максимум ОЗУ', 'max RAM'], aimem: ['память под модели', 'model memory'], ssd: ['слотов SSD', 'SSD slots'], storslots: ['слотов SSD или отсеков', 'SSD slots or bays'], bays: ['отсеков', 'bays'], tdp: ['TDP', 'TDP'], temp: ['температура CPU', 'CPU temp'], 's.perf': ['балл CPU', 'CPU score'], 's.gfx': ['балл графики', 'graphics score'], 's.ai': ['балл ИИ', 'AI score'], lanG: ['сеть', 'network'], lanPorts: ['сетевых портов', 'network ports'], npu: ['NPU', 'NPU'] };
const RU_ = { ram: [' ГБ', ' GB'], ramcap: [' ГБ', ' GB'], aimem: [' ГБ', ' GB'], tdp: [' Вт', ' W'], temp: [' °C', ' °C'], lanG: [' Гбит/с', ' Gbit/s'], npu: [' TOPS', ' TOPS'] };
const BL = { ramUp: ['память не распаяна (расширяется)', 'memory is not soldered (upgradable)'], egpu: ['есть OCuLink или USB4', 'has OCuLink or USB4'], nas: ['это NAS (корпус с отсеками)', 'is a NAS (case with drive bays)'], oculink: ['есть OCuLink', 'has OCuLink'], usb4: ['есть USB4', 'has USB4'] };
const rlabel = (q, L) => (BL[q.f] ? BL[q.f][L] : `${RL[q.f][L]} ${q.op === '>=' ? '≥' : '≤'} ${q.v}${(RU_[q.f] || ['', ''])[L]}`);
function rval(d, f) {
  if (f.startsWith('s.')) return d.s[f.slice(2)];
  if (f === 'ramUp') return d.ramSoldered === null ? null : d.ramSoldered === false;
  if (f === 'ramcap') return isNum(d.ramMax) ? d.ramMax : isNum(d.ram) ? d.ram : null;
  if (f === 'aimem') { const a = [d.vram, d.ram].filter(isNum); return a.length ? Math.max(...a) : null; }
  if (f === 'storslots') { const a = [d.ssd, d.bays].filter(isNum); return a.length ? Math.max(...a) : null; }
  if (f === 'egpu') return d.oculink === true || d.usb4 === true ? true : d.oculink === false && d.usb4 === false ? false : null;
  if (f === 'nas') return d.ff === 'nas';
  return d[f] === undefined ? null : d[f];
}
const rtest = (d, q) => { const v = rval(d, q.f); if (v === null || v === undefined) return 'unk'; const ok = q.op === '>=' ? v >= q.v : q.op === '<=' ? v <= q.v : v === q.v; return ok ? 'pass' : 'fail'; };
DEV.forEach((d) => {
  d.fit = {};
  crit.uses.forEach((u) => {
    const checks = (u.req || []).map((q) => ({ q, res: rtest(d, q) })), prefs = (u.pref || []).map((q) => ({ q, res: rtest(d, q) }));
    const st = d.uses.includes(u.key) ? 'yes' : d.ff === 'nas' && !u.nasOk ? 'no' : checks.some((x) => x.res === 'fail') ? 'no' : checks.length && checks.every((x) => x.res === 'pass') ? 'yes' : 'maybe';
    const base = wavg(Object.entries(u.rank || {}).map(([k, w]) => [w, d.s[k]])) ?? 0;
    d.fit[u.key] = { st, checks, prefs, rank: Math.round(base + prefs.filter((x) => x.res === 'pass').length * 3) };
  });
});
const fitKeys = (d, strict) => crit.uses.filter((u) => (strict ? d.fit[u.key].st === 'yes' : d.fit[u.key].st !== 'no')).map((u) => u.key);
const fitMark = { pass: '✓', fail: '✗', unk: '?' };

const brandOf = (d) => BRANDS.find((b) => b.slug === slugify(d.brand)) || null;

/* ---------- словари ---------- */
const PCL = { weak: ['Слабый', 'Entry'], mid: ['Средний', 'Mid'], strong: ['Мощный', 'Strong'], top: ['Топ', 'Top'] };
const HCL = { cool: ['Холодный', 'Cool'], warm: ['Тёплый', 'Warm'], hot: ['Горячий', 'Hot'] };
const AVL = [['Нет в наличии', 'Out of stock'], ['Ограниченно', 'Limited'], ['В наличии', 'In stock']];
const CATS = [
  ['overall', 'Лучший в целом', 'Best overall'], ['ai', 'Лучший для локального ИИ', 'Best for local AI'], ['gfx', 'Лучший по графике', 'Best graphics'],
  ['cool', 'Самый холодный', 'Coolest'], ['eff', 'Лучшая эффективность', 'Most efficient'], ['value', 'Лучший по цене', 'Best value'], ['avail', 'Проще всего купить', 'Easiest to buy'],
];
const CAT_ICON = { overall: 'star', ai: 'ai', gfx: 'screen', cool: 'meter', eff: 'bolt', value: 'coin', avail: 'box' };
const dash = (v) => (v === null || v === undefined ? '—' : v);

/* ---------- мелкие кирпичики ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, lang) => (isNum(n) ? n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US') : '—');
const ICONS = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  ai: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7l3 9M16 7l-3 9M8.5 6h7"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  nas: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h8"/>',
  game: '<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 10v4M5 12h4M16 11h.01M18 13h.01"/>',
  plug: '<path d="M9 2v5M15 2v5"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  ram: '<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v8M10 8v8M14 8v8M18 8v8M5 16v3M19 16v3"/>',
  usb: '<circle cx="12" cy="19" r="2"/><path d="M12 17V4M12 4l-2.5 3M12 4l2.5 3M12 12l5-3v-2M12 14l-5-3"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  quiet: '<path d="M4 10v4M8 7v10M12 11v2M16 8v8M20 10v4"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  meter: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
  scale: '<path d="M12 3v18M5 21h14M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10M10 20v-6h4v6"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M8 10a6 6 0 0 1 8 0M10 7a3 3 0 0 1 4 0"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  store: '<path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  lab: '<path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3"/>',
};
const ic = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.star}</svg>`;

// схематичный «портрет» устройства, если нет фото
function pcArt(d) {
  const vc = d.hc === 'hot' ? 'var(--hot)' : d.hc === 'cool' ? 'var(--cool)' : 'var(--warm)';
  if (d.ff === 'nas') {
    const n = Math.min(8, Math.max(2, d.bays || 4)), area = 86, gap = 5, h = (area - gap * (n - 1)) / n;
    let slots = '';
    for (let i = 0; i < n; i++) { const y = 44 + i * (h + gap); slots += `<rect x="80" y="${y.toFixed(1)}" width="78" height="${h.toFixed(1)}" rx="2" class="a-line"/><circle cx="150" cy="${(y + h / 2).toFixed(1)}" r="1.7" fill="${vc}"/>`; }
    return `<svg class="pcart" viewBox="0 0 240 150" aria-hidden="true"><polygon points="66,34 82,20 178,20 162,34" class="a-top"/><polygon points="162,34 178,20 178,126 162,140" class="a-side"/><rect x="66" y="34" width="96" height="106" rx="4" class="a-body"/>${slots}<circle cx="86" cy="130" r="3" class="a-line"/><path d="M104 130h44" class="a-line" stroke="${vc}"/></svg>`;
  }
  const ocu = d.oculink ? '<rect x="104" y="92" width="30" height="11" rx="5.5" class="a-hl"/>' : '';
  const usb = d.usb4 ? '<rect x="144" y="94" width="14" height="8" rx="2" class="a-line"/>' : '';
  let vents = ''; for (let i = 0; i < 5; i++) vents += `<path d="M170 ${70 + i * 7}h30" stroke="${vc}" stroke-width="2" stroke-linecap="round"/>`;
  return `<svg class="pcart" viewBox="0 0 240 150" aria-hidden="true"><polygon points="28,62 48,44 228,44 208,62" class="a-top"/><polygon points="208,62 228,44 228,102 208,120" class="a-side"/><rect x="28" y="62" width="180" height="58" rx="6" class="a-body"/><circle cx="50" cy="91" r="6" class="a-line"/><circle cx="50" cy="91" r="1.6" fill="var(--hot)"/><rect x="72" y="94" width="14" height="8" rx="2" class="a-line"/><rect x="90" y="94" width="10" height="8" rx="2" class="a-line"/>${ocu}${usb}${vents}</svg>`;
}
const tag = (cls, t) => `<span class="tag ${cls}">${t}</span>`;
function tagsHtml(d, c) {
  const L = c.lang === 'ru' ? 0 : 1; let o = '';
  if (d.pc) o += tag('', PCL[d.pc][L]);
  if (d.hc) o += tag(d.hc === 'hot' ? 'hot' : d.hc === 'cool' ? 'cool' : '', HCL[d.hc][L]);
  if (d.reviews.length) o += tag('ok', c.lang === 'ru' ? 'Есть обзор' : 'Reviewed');
  return o;
}
function passport(d, c) {
  const tx = c.tx;
  const ramB = d.ramSoldered === true ? tag('hot', tx('распаяна', 'soldered')) : d.ramSoldered === false ? tag('ok', tx('расширяется', 'upgradable') + (d.ramMax ? ` → ${d.ramMax} GB` : '')) : '';
  const ssdB = isNum(d.ssd) ? (d.ssd > 0 ? tag('ok', `SSD ${d.ssd}×`) : tag('hot', tx('SSD не меняется', 'SSD fixed'))) : '';
  const pb = (d.oculink ? tag('', 'OCuLink') : '') + (d.usb4 ? tag('', 'USB4') : '');
  return `<dl class="pass"><div><dt>CPU</dt><dd>${esc(d.cpu || '—')}</dd></div><div><dt>GPU</dt><dd>${esc(d.gpu || '—')}</dd></div><div><dt>RAM</dt><dd>${esc((d.ram ? d.ram + ' GB' : '—') + (d.ramType ? ' ' + d.ramType : ''))} ${ramB}</dd></div></dl>${ssdB || pb ? `<div class="tags">${ssdB}${pb}</div>` : ''}`;
}
const kv = (rows) => `<div class="kv">${rows.map((r) => `<div><span>${r[0]}</span><b>${esc(r[1])}</b></div>`).join('')}</div>`;
const pct = (k, v) => (isNum(v) && range[k] ? Math.min(100, Math.max(3, (v / (range[k][1] || 1)) * 100)) : 0);
const sbar = (label, v) => `<div class="mt"><span class="k">${label}</span><span class="bar"><i style="width:${v === null ? 0 : Math.max(3, v)}%"></i></span><span class="vv">${dash(v)}</span></div>`;
const bar = (k, label, d, hot, c) => `<div class="mt"><span class="k">${label}</span><span class="bar"><i class="${hot ? 'h' : ''}" style="width:${pct(k, d[k]).toFixed(0)}%"></i></span><span class="vv">${fmt(d[k], c.lang)}</span></div>`;
const buyBtn = (d, c, cls = '') => (d.buyUrl ? `<a class="btn buy ${cls}" href="${esc(d.buyUrl)}" target="_blank" rel="noopener sponsored nofollow">${c.tx('Купить', 'Buy')}</a>` : `<span class="btn off ${cls}">${c.tx('Ссылка скоро', 'Link soon')}</span>`);
const summary = (d, c) => (c.lang === 'ru' ? d.sumRu || d.sumEn : d.sumEn || d.sumRu) || '';

function card(d, c, mode = 'std', hidden = false) {
  const tx = c.tx, L = c.lang;
  let mid;
  if (mode === 'ai') mid = kv([['VRAM', isNum(d.vram) ? d.vram + ' GB' : '—'], [tx('Скорость LLM', 'LLM speed'), fmt(d.llm, L) + ' tok/s'], ['NPU', isNum(d.npu) ? d.npu + ' TOPS' : '—'], [tx('Модель', 'Model'), d.maxModel || '—'], ['TDP', isNum(d.tdp) ? d.tdp + ' W' : '—']]);
  else if (mode === 'nas') mid = kv([[tx('Отсеки', 'Bays'), d.bays ?? '—'], [tx('Сеть', 'LAN'), d.lan || '—'], ['TDP', isNum(d.tdp) ? d.tdp + ' W' : '—'], [tx('Темп. CPU', 'CPU temp'), isNum(d.temp) ? d.temp + ' °C' : '—']]);
  else mid = `<div class="mts">${sbar(tx('CPU', 'CPU'), d.s.perf)}${sbar(tx('Графика', 'GPU'), d.s.gfx)}${sbar(tx('ИИ', 'AI'), d.s.ai)}</div><div class="phys"><span>TDP ${isNum(d.tdp) ? d.tdp + ' W' : '—'}</span><span class="${d.hc === 'hot' ? 'hot' : d.hc === 'cool' ? 'cool' : ''}">${isNum(d.temp) ? d.temp + ' °C' : '— °C'}</span><span>PM ${fmt(d.pm_total, L)}</span></div>`;
  const art = d.image ? `<img src="${c.img(d.image)}" alt="${esc(d.name)}" loading="lazy">` : pcArt(d);
  const href = c.href('device', d.slug);
  const compare = c.dir === dirOf(c.lang, 'catalog')
    ? `<label class="cmpl"><input type="checkbox" data-cmp="${d.slug}" aria-label="${esc(tx('Сравнить ' + d.name, 'Compare ' + d.name))}"> ${tx('Сравнить', 'Compare')}</label>`
    : `<a class="text-link" href="${c.href('catalog')}?cmp=${d.slug}#compare">${tx('Сравнить', 'Compare')}</a>`;
  return `<article class="card" data-slug="${d.slug}"${hidden ? ' hidden' : ''}><a class="art" href="${href}" aria-label="${esc(d.name)}">${art}${d.demo ? `<span class="demo">${tx('Демо', 'Demo')}</span>` : `<span class="score"><b data-score>${dash(d.s.overall)}</b><small>${tx('балл', 'score')}</small></span>`}</a><div class="cb"><h3><a href="${href}">${esc(d.name)}</a></h3><div class="tags">${tagsHtml(d, c)}</div>${passport(d, c)}${mid}<div class="cf"><span class="price">${isNum(d.price) ? '$' + fmt(d.price, L) : ''}</span><div class="row"><a class="btn sm" href="${href}">${tx('Подробнее', 'Details')}</a>${d.buyUrl ? buyBtn(d, c, 'sm') : ''}</div></div>${compare}</div></article>`;
}
const STD_DEFS = CATS.map(([k, ru, en]) => ({
  ic: CAT_ICON[k], ru, en, val: (d) => d.s[k],
  info: (d, L) => (k === 'ai' ? (isNum(d.llm) ? fmt(d.llm, L) + ' tok/s' : fmt(d.vram, L) + ' GB VRAM') : k === 'gfx' ? (isNum(d.sn_light) ? fmt(d.sn_light, L) + ' SN Light' : isNum(d.timespy) ? fmt(d.timespy, L) + ' Time Spy' : 'iGPU') : k === 'cool' ? fmt(d.temp, L) + ' °C' : k === 'eff' ? 'TDP ' + fmt(d.tdp, L) + ' W' : k === 'value' ? '$' + fmt(d.price, L) : k === 'avail' ? AVL[isNum(d.avail) ? d.avail : 1][L === 'ru' ? 0 : 1] : (isNum(d.pm_total) ? 'PassMark ' + fmt(d.pm_total, L) : 'CPU')) + ' · ' + d.s[k] + '/100',
}));
function winners(list, defs, c) {
  const out = defs.map((df) => {
    const a = list.filter((d) => !d.demo && isNum(df.val(d))).sort((x, y) => df.val(y) - df.val(x) || (y.s.overall || 0) - (x.s.overall || 0));
    if (a.length < 2) return '';
    const w = a[0], run = a.slice(1, 3).map((d, i) => `${i + 2}. ${esc(d.name)}`).join(' · ');
    return `<a class="rk" href="${c.href('device', w.slug)}"><span class="h">${ic(df.ic)}${c.tx(df.ru, df.en)}</span><span class="n">${esc(w.name)}</span><span class="v">${df.info(w, c.lang)}</span>${run ? `<span class="ru">${run}</span>` : ''}</a>`;
  }).join('');
  return out ? `<div class="ranks" data-winners>${out}</div>` : '';
}
const head2 = (h, p) => `<div class="sh"><h2>${h}</h2>${p ? `<p>${p}</p>` : ''}</div>`;
const pagehead = (eb, h, p) => `<div class="pagehead"><div class="wrap"><p class="eyebrow">${eb}</p><h1>${h}</h1><p class="lead">${p}</p></div></div>`;
const notice = (c, list = DEV) => (list.some((d) => d.demo) ? `<div class="wrap"><div class="banner">${c.tx('Карточки с пометкой «Демо» содержат примерные данные и исключены из рейтингов.', 'Cards marked “Demo” contain sample data and are excluded from rankings.')}</div></div>` : '');
const emptyBox = (m) => `<div class="empty">${m}</div>`;
const jsonData = (id, obj) => `<script type="application/json" id="${id}">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

/* ---------- адреса ---------- */
const PAGES = ['home', 'catalog', 'ai', 'nas', 'brands', 'method', 'about', 'contact'];
const dirOf = (lang, key, slug) => (key === 'home' ? lang : key === 'device' ? `${lang}/devices/${slug}` : key === 'brand' ? `${lang}/brands/${slug}` : key === 'use' ? `${lang}/for/${slug}` : `${lang}/${key}`);
const relDir = (from, to) => { const r = path.posix.relative(from || '.', to || '.') || '.'; return (r.endsWith('/') ? r : r + '/'); };
function ctxFor(lang, dir) {
  const tx = (ru, en) => (lang === 'ru' ? ru : en);
  return {
    lang, dir, tx,
    href: (key, slug) => relDir(dir, dirOf(lang, key, slug)),
    hrefLang: (l2, key, slug) => relDir(dir, dirOf(l2, key, slug)),
    asset: (p) => path.posix.relative(dir || '.', 'assets/' + p) || p,
    img: (f) => path.posix.relative(dir || '.', 'images/' + f),
    abs: (key, slug, l2) => `${SITE_URL}/${dirOf(l2 || lang, key, slug)}/`,
  };
}
function demoList(c) { return DEV.map((d) => ({ slug: d.slug, name: d.name, url: c.href('device', d.slug), brand: d.brand, cpu: d.cpu, gpu: d.gpu, demo: d.demo, ram: d.ram, price: d.price, tdp: d.tdp, temp: d.temp, vram: d.vram, npu: d.npu, bays: d.bays, lanG: d.lanG, ff: d.ff, vendor: d.vendor, ramup: d.ramSoldered === false, ssd: isNum(d.ssd) && d.ssd > 0, oculink: !!d.oculink, usb4: !!d.usb4, pc: d.pc, hc: d.hc, uses: fitKeys(d), avail: d.avail, tested: d.tested, s: d.s, ...d.bench })); }
function i18n(c) {
  const t = c.tx;
  return { found: t('Найдено ', 'Found '), of: t(' из ', ' of '), cmp: t('Сравнить', 'Compare'), cmpEmpty: t('Отметьте 2–4 устройства в каталоге.', 'Tick 2–4 devices in the catalog.'), cmpOne: t('Добавьте ещё одно устройство.', 'Add one more device.'), cmpMax: t('В сравнении не больше 4 устройств.', 'Compare up to 4 devices.'), any: t('любой', 'any'), noLimit: t('без лимита', 'no limit'), copied: t('Скопировано.', 'Copied.'), copyFail: t('Выделите текст и скопируйте вручную.', 'Select the text and copy it manually.'), lowerBetter: t('меньше лучше', 'lower is better'), none: t('Под такие фильтры ничего не нашлось.', 'No devices match these filters.'), score: t('Общий балл', 'Overall score'), demo: t('Демо', 'Demo'), my: t('Мой балл', 'My score'),
    cats: Object.fromEntries(CATS.map(([k, ru, en]) => [k, t(ru, en)])), icons: Object.fromEntries(Object.entries(CAT_ICON).map(([k, v]) => [k, ic(v)])), avail: AVL.map((a) => t(a[0], a[1])),
    msg: t('Здравствуйте! Хочу передать мини-ПК на тест для MiniPC Bench.\nОт кого: {name}\nМодель: {model}\nСтрана доставки: {country}\n{msg}', 'Hello! I would like to send a mini PC for testing at MiniPC Bench.\nFrom: {name}\nModel: {model}\nShipping country: {country}\n{msg}') };
}

/* ---------- каркас страницы ---------- */
function layout(c, o) {
  const { lang, dir, tx } = c, L = lang === 'ru' ? 0 : 1;
  const nav = [['catalog', tx('Каталог', 'Catalog')], ['ai', tx('Локальный ИИ', 'Local AI')], ['nas', 'NAS'], ['method', tx('Методика', 'Method')]];
  const alt = lang === 'ru' ? 'en' : 'ru', altHref = c.hrefLang(alt, o.key, o.slug);
  const canon = SITE_URL ? `<link rel="canonical" href="${c.abs(o.key, o.slug)}"><link rel="alternate" hreflang="ru" href="${c.abs(o.key, o.slug, 'ru')}"><link rel="alternate" hreflang="en" href="${c.abs(o.key, o.slug, 'en')}"><link rel="alternate" hreflang="x-default" href="${c.abs(o.key, o.slug, 'en')}"><meta property="og:url" content="${c.abs(o.key, o.slug)}">` : '';
  const ogImg = o.image && SITE_URL ? `<meta property="og:image" content="${SITE_URL}/images/${o.image}">` : '';
  const fav = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#15204b"/><rect x="6" y="11" width="20" height="11" rx="3" fill="none" stroke="#fff" stroke-width="2"/><circle cx="21" cy="16.5" r="1.8" fill="#3c59ff"/></svg>')}`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title><meta name="description" content="${esc(o.desc)}">${o.noindex ? '<meta name="robots" content="noindex">' : ''}${canon}
<meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}"><meta property="og:type" content="${o.key === 'device' ? 'product' : 'website'}"><meta property="og:site_name" content="${esc(NAME)}">${ogImg}
<meta name="theme-color" content="#15204b"><link rel="icon" href="${fav}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geologica:wght@500;600;700&family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="${c.asset('style.css')}">${(o.jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('')}
</head><body data-page="${o.key}">
<a class="skip" href="#main">${tx('К содержанию', 'Skip to content')}</a>
<header class="top"><div class="wrap topin"><a class="logo" href="${c.href('home')}"><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--navy)"/><rect x="6" y="11" width="20" height="11" rx="3" fill="none" stroke="#fff" stroke-width="2"/><circle cx="21" cy="16.5" r="1.8" fill="var(--hot)"/></svg>${esc(NAME)}</a>
<nav class="nav" aria-label="${tx('Разделы', 'Sections')}">${nav.map(([k, t]) => `<a href="${c.href(k)}"${o.key === k || (k === 'catalog' && o.key === 'device') ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
<div class="seg" role="group" aria-label="Language"><a href="${lang === 'ru' ? '#' : altHref}" data-setlang="ru"${lang === 'ru' ? ' aria-current="true"' : ''} hreflang="ru">RU</a><a href="${lang === 'en' ? '#' : altHref}" data-setlang="en"${lang === 'en' ? ' aria-current="true"' : ''} hreflang="en">EN</a></div></div></header>
<main id="main">${o.body}</main>
<footer class="foot"><div class="wrap footin"><div><b>${esc(NAME)}</b><p>${tx('Независимая база тестов мини-ПК, ИИ-систем и NAS. Результаты, характеристики и ссылки на обзоры.', 'An independent database of mini PC, AI system, and NAS tests. Results, specs, and links to reviews.')}</p></div><div class="fl"><a href="${c.href('brands')}">${tx('Производители', 'Brands')}</a><a href="${c.href('about')}">${tx('О проекте', 'About')}</a><a href="${c.href('contact')}">${tx('Связаться', 'Contact')}</a></div><p class="fine">${tx('Ссылки «Купить» могут быть партнёрскими: цена для вас не меняется, на баллы это не влияет.', 'Buy links may be affiliate links: the price is the same for you and scores are not affected.')}</p></div></footer>
${o.data || ''}<script src="${c.asset('app.js')}" defer></script></body></html>`;
}

/* ---------- страницы ---------- */
function pageHome(c) {
  const { tx, lang } = c;
  const measured = REAL.filter((d) => Object.keys(d.bench).length);
  const testCount = REAL.reduce((sum, d) => sum + Object.keys(d.bench).length + Number(isNum(d.temp)), 0);
  const brandCount = new Set(REAL.map((d) => d.brand).filter(Boolean)).size;
  const picks = [
    ['office', 'screen', tx('Для работы', 'Work'), tx('Браузер, документы и видеозвонки', 'Browsing, documents, and video calls')],
    ['gaming', 'game', tx('Для игр', 'Gaming'), tx('Графика и возможность подключить eGPU', 'Graphics and external GPU options')],
    ['ai', 'ai', tx('Локальный ИИ', 'Local AI'), tx('Память и скорость языковых моделей', 'Memory and language model speed')],
    ['nas', 'nas', tx('Домашнее хранилище', 'Home storage'), tx('Отсеки, сеть и работа 24/7', 'Drive bays, networking, and 24/7 use')],
  ];
  const useHref = (u) => u.page ? c.href(u.page) : c.href('use', u.key);
  const routes = picks.map(([key, icon, title, desc]) => {
    const u = crit.uses.find((entry) => entry.key === key);
    return `<a class="route" href="${useHref(u)}"><span class="route-icon">${ic(icon)}</span><strong>${title}</strong><span>${desc}</span></a>`;
  }).join('');
  const extra = crit.uses.filter((u) => !picks.some(([key]) => key === u.key));
  const featured = byTested.filter((d) => measured.includes(d)).slice(0, 3);
  const compareIds = featured.filter((d) => isNum(d.pm_total)).slice(0, 2);
  const compareHref = c.href('catalog') + (compareIds.length === 2 ? '?' + compareIds.map((d) => 'cmp=' + d.slug).join('&') : '') + '#compare';
  const featuredCards = featured.map((d) => {
    const metrics = [['PassMark', fmt(d.pm_total, lang)], [tx('Нагрев CPU', 'CPU temp'), isNum(d.temp) ? d.temp + ' °C' : '—']];
    return `<article class="model-card"><a class="model-art" href="${c.href('device', d.slug)}" aria-label="${esc(d.name)}">${d.image ? `<img src="${c.img(d.image)}" alt="" loading="lazy">` : pcArt(d)}</a><div class="model-copy"><div class="model-meta">${esc(d.brand || tx('Мини-ПК', 'Mini PC'))}</div><h3><a href="${c.href('device', d.slug)}">${esc(d.name)}</a></h3><p>${esc(d.cpu)}</p><dl class="model-metrics">${metrics.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></div></article>`;
  }).join('');
  const stats = [[REAL.length, tx('моделей', 'devices')], [testCount, tx('результатов тестов', 'test results')], [brandCount, tx('брендов в базе', 'brands in the database')]];
  const body = `<section class="wrap hero hero-in"><div class="hero-copy"><p class="eyebrow">${tx('Независимая база бенчмарков', 'Independent benchmark database')}</p><h1>${tx('Мини-ПК в цифрах', 'Mini PCs by the numbers')}<span>.</span></h1><p class="lead">${tx('Сравнивайте мини-ПК по производительности, нагреву и возможностям апгрейда. Найдите модель под свою задачу и проверьте результаты в обзорах.', 'Compare mini PCs by performance, heat, and upgradability. Find one that fits your needs and check the results in the original reviews.')}</p><div class="cta"><a class="btn pri lg" href="${c.href('catalog')}">${tx('Открыть каталог', 'Browse catalog')}</a><a class="btn lg" href="${compareHref}">${ic('scale')}${tx('Сравнить модели', 'Compare models')}</a></div></div>
<figure class="hero-art"><img src="${c.asset('mini-pc-lab.webp')}" alt="" width="1200" height="800" fetchpriority="high"><figcaption>${ic('box')}${tx('Мини-ПК · иллюстрация', 'Mini PC · illustration')}</figcaption></figure></section>
<div class="wrap"><dl class="stats">${stats.map(([value, label]) => `<div><dt>${label}</dt><dd>${fmt(value, lang)}</dd></div>`).join('')}</dl></div>
<section class="wrap sec home-section">${head2(tx('Выберите мини-ПК под задачу', 'Pick a mini PC for your needs'))}<div class="routes">${routes}</div><details class="all-uses"><summary>${tx('Все сценарии', 'All use cases')}</summary><div class="chips">${extra.map((u) => `<a class="chip" href="${useHref(u)}">${tx(u.ru, u.en)}</a>`).join('')}</div></details></section>
${featured.length ? `<section class="wrap sec home-section"><div class="section-top">${head2(tx('Мини-ПК с результатами тестов', 'Mini PCs with test results'))}<a class="text-link" href="${c.href('catalog')}">${tx('Все модели', 'All models')}</a></div><div class="featured-models">${featuredCards}</div></section>` : ''}
<section class="wrap sec home-section"><div class="method-block"><span class="route-icon">${ic('lab')}</span><div><h2>${tx('Откуда берутся баллы', 'Where the scores come from')}</h2><p>${tx('Собираем результаты из обзоров и показываем исходные значения. Если замера нет, поле остаётся пустым. Демо-карточки не участвуют в рейтингах.', 'We collect results from reviews and show the original values. Missing measurements stay blank. Demo cards are excluded from rankings.')}</p></div><a class="btn ghost" href="${c.href('method')}">${tx('Методика', 'Read the method')}</a></div></section>`;
  return {
    body, title: tx(`Мини-ПК в цифрах | ${NAME}`, `Mini PCs by the numbers | ${NAME}`),
    desc: tx('Независимая база тестов мини-ПК, ИИ-систем и NAS. Сравните производительность, нагрев и возможности апгрейда.', 'Independent mini PC, AI system, and NAS tests. Compare performance, heat, and upgradability.'),
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, inLanguage: lang, ...(SITE_URL ? { url: `${SITE_URL}/${lang}/` } : {}) }],
  };
}

function pageCatalog(c) {
  const { tx, lang } = c, L = lang === 'ru' ? 0 : 1;
  const uniq = (k) => [...new Set(DEV.map((d) => d[k]).filter((v) => v != null && v !== ''))];
  const chips = (key, items) => `<div class="chips">${items.map(([v, l, cls]) => `<button type="button" class="chip ${cls || ''}" data-f="${key}" data-v="${esc(v)}" aria-pressed="false">${esc(l)}</button>`).join('')}</div>`;
  const flag = (k, ru, en) => `<label class="cmpl"><input type="checkbox" data-flag="${k}"> ${tx(ru, en)}</label>`;
  const sliders = [['pm_cpu', 'min', 500, 'PassMark CPU от', 'PassMark CPU from'], ['pm_total', 'min', 250, 'PassMark общий от', 'PassMark total from'], ['sn_light', 'min', 100, 'Steel Nomad Light от', 'Steel Nomad Light from'], ['llm', 'min', 1, 'LLM, ток/с, от', 'LLM tok/s from'], ['price', 'max', 50, 'Цена до, $', 'Price up to, $'], ['tdp', 'max', 5, 'TDP до, Вт', 'TDP up to, W'], ['temp', 'max', 5, 'Темп. CPU до, °C', 'CPU temp up to, °C']].filter(([k]) => range[k]).map(([k, kind, step, ru, en]) => {
    const r = range[k], lo = kind === 'min' ? 0 : Math.floor(r[0] / step) * step, hi = Math.max(lo + step, Math.ceil(r[1] / step) * step);
    return `<div class="sl"><label for="s-${k}"><span>${tx(ru, en)}</span><b id="o-${k}">${kind === 'min' ? tx('любой', 'any') : tx('без лимита', 'no limit')}</b></label><input id="s-${k}" type="range" data-s="${k}" data-kind="${kind}" min="${lo}" max="${hi}" step="${step}" value="${kind === 'min' ? lo : hi}"></div>`;
  }).join('');
  const W = { perf: ['Процессор', 'CPU power'], ai: ['Локальный ИИ', 'Local AI'], gfx: ['Графика', 'Graphics'], cool: ['Холодный', 'Cool'], eff: ['Экономичность', 'Efficiency'], value: ['Цена за баллы', 'Price per score'], avail: ['Наличие', 'Availability'] };
  const dw = { perf: 3, ai: 3, gfx: 2, cool: 3, eff: 2, value: 3, avail: 1 };
  const sorts = [['overall', tx('Общий балл', 'Overall score')], ['my', tx('Мой рейтинг', 'My ranking')], ['perf', tx('Процессор', 'CPU power')], ['ai', tx('Локальный ИИ', 'Local AI')], ['gfx', tx('Графика', 'Graphics')], ['cool', tx('Холоднее', 'Cooler')], ['eff', tx('Экономичность', 'Efficiency')], ['value', tx('Цена за баллы', 'Value')], ['price', tx('Дешевле', 'Cheapest')], ['new', tx('Новые тесты', 'Newest tests')]];
  const presets = [['office', 'screen', tx('Работа и дом', 'Work and home')], ['game', 'game', tx('Игры', 'Gaming')], ['ai', 'ai', tx('Локальный ИИ', 'Local AI')], ['cool', 'meter', tx('Низкий нагрев', 'Low heat')]];
  const body = `${pagehead(tx('Каталог', 'Catalog'), tx('Тесты и сравнение мини-ПК', 'Mini PC tests and comparisons'), tx('Найдите модель по названию или характеристикам. Отметьте до четырёх устройств, чтобы сравнить замеры.', 'Search by model or spec. Select up to four devices to compare their results.'))}
<section class="wrap sec catalog-results"><div class="presets">${presets.map(([k, i, t]) => `<button type="button" class="preset" data-preset="${k}">${ic(i)}${t}</button>`).join('')}</div>
<div class="catalog-search"><label for="q">${ic('search')}<span class="sr">${tx('Поиск по каталогу', 'Search the catalog')}</span></label><input id="q" type="search" placeholder="${tx('Название, процессор, видеоядро', 'Name, processor, GPU')}"></div>
<div class="cat"><details class="fp" id="fp" open><summary>${tx('Фильтры', 'Filters')}</summary><div class="fbody">

<div class="fg"><span class="lb">${tx('Сценарий', 'Use case')}</span>${chips('use', crit.uses.map((u) => [u.key, tx(u.ru, u.en)]))}</div>
<div class="fg"><span class="lb">${tx('Апгрейд и порты', 'Upgrades and ports')}</span>${flag('ramup', 'Память расширяется (не распаяна)', 'Upgradable memory (not soldered)')}${flag('ssd', 'Есть слот под SSD', 'Has an SSD slot')}${flag('oculink', 'Есть OCuLink', 'Has OCuLink')}${flag('usb4', 'Есть USB4 / Thunderbolt', 'Has USB4 / Thunderbolt')}</div>
<div class="fg"><span class="lb">${tx('Форм-фактор', 'Form factor')}</span>${chips('ff', [['mini', tx('Мини-ПК', 'Mini PC')], ['nas', 'NAS']])}</div>
<div class="fg"><span class="lb">${tx('Мощность', 'Power class')}</span>${chips('pc', Object.keys(PCL).map((k) => [k, PCL[k][L]]))}</div>
<div class="fg"><span class="lb">${tx('Нагрев', 'Heat')}</span>${chips('hc', Object.keys(HCL).map((k) => [k, HCL[k][L], k === 'cool' ? 'coolc' : k === 'hot' ? 'hotc' : '']))}</div>
${uniq('brand').length ? `<div class="fg"><span class="lb">${tx('Производитель', 'Brand')}</span>${chips('brand', uniq('brand').sort().map((v) => [v, v]))}</div>` : ''}
${uniq('ram').length ? `<div class="fg"><span class="lb">${tx('Память', 'Memory')}</span>${chips('ram', uniq('ram').sort((a, b) => a - b).map((r) => [r, r + ' GB']))}</div>` : ''}
${uniq('vendor').length ? `<div class="fg"><span class="lb">${tx('Процессор', 'Processor')}</span>${chips('vendor', uniq('vendor').sort().map((v) => [v, v]))}</div>` : ''}
${sliders}${DEV.some((d) => d.demo) ? flag('demo', 'Показывать демо-устройства', 'Show demo devices') : ''}${flag('stock', 'Только в наличии', 'In stock only')}<label class="cmpl"><input type="checkbox" data-flag="unk" checked> ${tx('Показывать устройства без этого замера', 'Show devices without this measurement')}</label><button type="button" class="btn sm" data-preset="reset">${tx('Сбросить фильтры', 'Reset filters')}</button></div></details>
<div><details class="wp"><summary>${tx('Мои приоритеты для рейтинга', 'My ranking priorities')}</summary><div class="wgrid">${Object.keys(W).map((k) => `<div class="sl"><label for="w-${k}"><span>${W[k][L]}</span><b id="wo-${k}">${dw[k]}</b></label><input id="w-${k}" type="range" data-w="${k}" min="0" max="5" step="1" value="${dw[k]}"></div>`).join('')}</div></details>
<div class="tools"><span class="grow" id="count" role="status">${REAL.length} ${tx('в каталоге', 'in catalog')}</span><a href="#compare" class="btn sm compare-jump">${ic('scale')} ${tx('Сравнить', 'Compare')} <span id="cmp-count">0</span></a><label for="sort">${tx('Сортировка', 'Sort')}</label><select id="sort">${sorts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
<div class="cards" id="cards">${DEV.length ? DEV.map((d) => card(d, c, 'std', d.demo)).join('') : emptyBox(tx('В каталоге пока нет устройств.', 'The catalog has no devices yet.'))}</div><div class="empty" id="none" hidden>${tx('Под такие фильтры ничего не нашлось.', 'No devices match these filters.')} <button type="button" class="btn sm" data-preset="reset">${tx('Сбросить фильтры', 'Reset filters')}</button></div></div></div></section>
<section class="wrap sec" id="compare"><div class="section-top">${head2(tx('Сравнение', 'Comparison'), tx('Смотрите исходные результаты рядом. Пропуски означают, что замер пока не добавлен.', 'See the original results side by side. A dash means the result has yet to be added.'))}<div class="row"><button type="button" class="btn sm" id="cmp-share" hidden>${tx('Копировать ссылку', 'Copy link')}</button><button type="button" class="btn sm" id="cmp-clear" hidden>${tx('Очистить', 'Clear')}</button></div></div><div id="cmpbox" class="cmp">${emptyBox(i18n(c).cmpEmpty)}</div></section>
<section class="wrap sec" id="leaderboard" ${REAL.length < 2 ? 'hidden' : ''}>${head2(tx('Лидеры по категориям', 'Category leaders'), tx('Учитываются совпадения с фильтрами и категории, где есть данные хотя бы по двум моделям.', 'Uses the active filters and categories with data for at least two models.'))}<div id="winners">${winners(REAL, STD_DEFS, c)}</div></section>`;
  return { body, title: tx(`Каталог мини-ПК с бенчмарками и фильтрами | ${NAME}`, `Mini PC catalog with benchmarks and filters | ${NAME}`), desc: tx('Все протестированные мини-ПК: сравнение по производительности, нагреву, TDP, возможности расширить память и SSD, наличию OCuLink.', 'All tested mini PCs: compare performance, heat, TDP, memory and SSD upgradability, OCuLink.'), data: jsonData('dev-data', demoList(c)) + jsonData('i18n', i18n(c)) };
}

function pageAi(c) {
  const { tx, lang } = c;
  const base = DEV.filter((d) => d.fit.ai.st !== 'no' || (isNum(d.vram) && d.vram >= 16));
  const defs = [
    { ic: 'ai', ru: 'Самый быстрый ответ', en: 'Fastest answers', val: (d) => d.llm, info: (d, L) => fmt(d.llm, L) + ' tok/s' },
    { ic: 'ram', ru: 'Больше памяти для моделей', en: 'Most model memory', val: (d) => d.vram, info: (d) => d.vram + ' GB · ' + (d.maxModel || '—') },
    { ic: 'coin', ru: 'Дешевле за гигабайт', en: 'Cheapest per GB', val: (d) => (d.vram > 0 && d.price ? -(d.price / d.vram) : null), info: (d) => '$' + Math.round(d.price / d.vram) + '/GB' },
    { ic: 'bolt', ru: 'Меньше TDP для работы 24/7', en: 'Lowest TDP for 24/7', val: (d) => (isNum(d.tdp) ? -d.tdp : null), info: (d) => 'TDP ' + d.tdp + ' W' },
    { ic: 'quiet', ru: 'Самый холодный', en: 'Coolest', val: (d) => (isNum(d.temp) ? -d.temp : null), info: (d) => d.temp + ' °C' },
    { ic: 'ai', ru: 'Мощнее NPU', en: 'Strongest NPU', val: (d) => (d.npu > 0 ? d.npu : null), info: (d) => d.npu + ' TOPS' },
  ];
  const body = `${pagehead(tx('Локальный ИИ', 'Local AI'), tx('Мини-ПК для ИИ-агента дома и в малом офисе', 'Mini PCs for an AI agent at home or in a small office'), tx('Языковой модели нужна не только скорость процессора, а прежде всего много быстрой памяти. Чем больше модель, тем больше памяти нужно под неё.', 'A language model needs fast memory more than raw CPU speed. The bigger the model, the more memory it needs.'))}${notice(c, base)}
<section class="wrap sec">${head2(tx('Какую модель хотите запустить?', 'Which model do you want to run?'), tx('Оценка памяти для сжатия Q4: около 0,6 ГБ на миллиард параметров плюс запас. Это ориентир, а не точный расчёт.', 'Memory estimate for Q4 quantization: roughly 0.6 GB per billion parameters plus headroom. This is a guide, not an exact calculation.'))}<div class="chips big">${crit.aiModels.map((m) => `<button type="button" class="chip" data-aim="${m.gb}" aria-pressed="false">${m.b}B · ~${m.gb} GB</button>`).join('')}<button type="button" class="chip" data-aim="0" aria-pressed="true">${tx('Показать все', 'Show all')}</button></div></section>
<section class="wrap sec">${head2(tx('Устройства', 'Devices'), `<span id="aicount"></span>`)}<div class="cards" id="cards">${base.length ? base.sort((a, b) => (b.llm || 0) - (a.llm || 0)).map((d) => card(d, c, 'ai').replace(/data-slug="([^"]+)"/, `data-slug="$1" data-vram="${isNum(d.vram) ? d.vram : 0}"`)).join('') : emptyBox(tx('Устройств для ИИ пока нет в базе.', 'No AI devices in the database yet.'))}</div><div class="empty" id="none" hidden>${tx('Ни у одного устройства в базе не хватает памяти под такую модель.', 'No device in the database has enough memory for this model.')}</div></section>
${winners(base, defs, c) ? `<section class="wrap sec">${head2(tx('Лидеры по критериям', 'Category leaders'))}${winners(base, defs, c)}</section>` : ''}
<section class="wrap sec two"><div class="panel"><h3>${tx('Что важно для ИИ-агента, который работает всегда', 'What matters for an always-on AI agent')}</h3><ul class="list"><li>${tx('Память: у моделей она главный ограничитель. Распаянную память потом не расширить.', 'Memory is the main limit for models. Soldered memory cannot be upgraded later.')}</li><li>${tx('TDP помогает оценить требования к охлаждению. Для круглосуточной работы смотрите замеры потребления в простое и под нагрузкой.', 'TDP helps estimate cooling requirements. For always-on use, check measured power draw at idle and under load.')}</li><li>${tx('Охлаждение: устройство стоит рядом с вами, поэтому важна температура под нагрузкой.', 'Cooling: the device sits next to you, so temperature under load matters.')}</li><li>${tx('Порты: OCuLink или USB4 помогут добавить внешнюю видеокарту.', 'Ports: OCuLink or USB4 let you add an external GPU.')}</li></ul></div><div class="panel"><h3>${tx('Нужна помощь с выбором?', 'Need help choosing?')}</h3><p>${tx('Напишите автору проекта: подскажем, что подойдёт под вашу задачу.', 'Write to the project author and we will suggest what fits your task.')}</p><a class="btn buy" href="${c.href('contact')}">${tx('Связаться', 'Get in touch')}</a></div></section>`;
  return { body, title: tx(`Мини-ПК для локального ИИ и ИИ-агента | ${NAME}`, `Mini PCs for local AI and AI agents | ${NAME}`), desc: tx('Какой мини-ПК потянет локальную нейросеть дома или в малом офисе: память под модели, скорость генерации, TDP, температура.', 'Which mini PC can run a local model at home or in a small office: model memory, generation speed, TDP, temperature.'), data: jsonData('dev-data', demoList(c)) + jsonData('i18n', i18n(c)) };
}

function pageNas(c) {
  const { tx } = c;
  const base = DEV.filter((d) => d.ff === 'nas' || d.fit.nas.st === 'yes');
  const defs = [
    { ic: 'bolt', ru: 'Меньше TDP', en: 'Lowest TDP', val: (d) => (isNum(d.tdp) ? -d.tdp : null), info: (d) => 'TDP ' + d.tdp + ' W' },
    { ic: 'nas', ru: 'Больше всего отсеков', en: 'Most drive bays', val: (d) => d.bays || null, info: (d) => d.bays + ' ' + tx('отсеков', 'bays') },
    { ic: 'quiet', ru: 'Самый холодный', en: 'Coolest', val: (d) => (isNum(d.temp) ? -d.temp : null), info: (d) => d.temp + ' °C' },
    { ic: 'plug', ru: 'Самая быстрая сеть', en: 'Fastest network', val: (d) => d.lanG || null, info: (d) => d.lan || d.lanG + ' Gb' },
    { ic: 'coin', ru: 'Дешевле за отсек', en: 'Cheapest per bay', val: (d) => (d.bays > 0 && d.price ? -(d.price / d.bays) : null), info: (d) => '$' + Math.round(d.price / d.bays) + tx(' за отсек', ' per bay') },
  ];
  const chip = (k, v, l) => `<button type="button" class="chip" data-nas="${k}" data-v="${v}" aria-pressed="${v === 0}">${l}</button>`;
  const so = [['tdp', tx('Меньше TDP', 'Lower TDP')], ['bays', tx('Больше отсеков', 'More bays')], ['temp', tx('Холоднее', 'Cooler')], ['price', tx('Дешевле', 'Cheaper')], ['lan', tx('Быстрее сеть', 'Faster network')]];
  const body = `${pagehead('NAS', tx('NAS и домашние хранилища', 'NAS and home storage'), tx('NAS по сути тот же мини-ПК, только в другом корпусе: с отсеками для дисков и упором на низкое потребление и холодную работу.', 'A NAS is essentially a mini PC in a different case: with drive bays and a focus on low power and cool running.'))}${notice(c, base)}
<section class="wrap sec"><div class="row gap"><div class="fg"><span class="lb">${tx('Отсеков не меньше', 'At least bays')}</span><div class="chips">${chip('bays', 0, tx('любое', 'any'))}${chip('bays', 2, '2+')}${chip('bays', 4, '4+')}${chip('bays', 6, '6+')}</div></div><div class="fg"><span class="lb">${tx('Сеть не медленнее', 'Network at least')}</span><div class="chips">${chip('lan', 0, tx('любая', 'any'))}${chip('lan', 2.5, '2.5 GbE')}${chip('lan', 10, '10 GbE')}</div></div><div class="fg"><label for="nsort" class="lb">${tx('Сортировка', 'Sort')}</label><select id="nsort">${so.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div></div></section>
<section class="wrap sec">${head2(tx('Устройства', 'Devices'), '<span id="nascount"></span>')}<div class="cards" id="cards">${base.length ? base.map((d) => card(d, c, 'nas')).join('') : emptyBox(tx('NAS пока нет в базе.', 'No NAS devices in the database yet.'))}</div><div class="empty" id="none" hidden>${tx('Под такие условия ничего нет.', 'Nothing matches these conditions.')}</div></section>
${winners(base, defs, c) ? `<section class="wrap sec">${head2(tx('Лидеры среди NAS', 'NAS category leaders'))}${winners(base, defs, c)}</section>` : ''}
<section class="wrap sec"><div class="panel"><h3>${tx('На что смотреть при выборе NAS', 'What to look at when choosing a NAS')}</h3><ul class="list"><li>${tx('Для NAS, который работает 24/7, сравните потребление в простое и под нагрузкой. TDP описывает тепловые требования процессора.', 'For a NAS running 24/7, compare measured idle and load power. CPU TDP describes the processor’s thermal requirements.')}</li><li>${tx('Отсеки и слоты M.2: сколько дисков можно поставить сразу и потом.', 'Bays and M.2 slots: how many drives fit now and later.')}</li><li>${tx('Сеть: 2,5 GbE хватает для дома, 10 GbE нужна для монтажа с общего диска.', 'Network: 2.5 GbE is enough at home, 10 GbE helps with editing from a shared disk.')}</li><li>${tx('Память: у распаянной памяти нет запаса на будущее, а для ZFS и контейнеров она нужна.', 'Memory: soldered memory leaves no room to grow, and ZFS and containers need it.')}</li></ul></div></section>`;
  return { body, title: tx(`NAS и домашние хранилища: тесты и сравнение | ${NAME}`, `NAS and home storage: tests and comparison | ${NAME}`), desc: tx('NAS как мини-ПК: отсеки для дисков, скорость сети, TDP и нагрев. Сравнение протестированных моделей.', 'NAS as a mini PC: drive bays, network speed, TDP and heat. Compare tested models.'), data: jsonData('dev-data', demoList(c)) + jsonData('i18n', i18n(c)) };
}

function pageMethod(c) {
  const { tx, lang } = c;
  const faq = [[tx('Что значат баллы от 0 до 100?', 'What do the 0–100 scores mean?'), tx('Результаты каждого теста переводятся в шкалу от 0 до 100 по минимуму и максимуму в базе. Если значения одинаковые, используем середину шкалы. Демо-устройства не учитываются.', 'Each test is scaled from 0 to 100 using the lowest and highest results in the database. If all values are the same, we use the midpoint. Demo devices are excluded.')],
    [tx('Как работает «Мой рейтинг»?', 'How does My ranking work?'), tx('Вы задаёте важность семи критериев от 0 до 5, и мы считаем взвешенный балл для каждого устройства.', 'You set the importance of seven criteria from 0 to 5 and we compute a weighted score for every device.')],
    [tx('Что, если для устройства нет какого-то теста?', 'What if a device has no result for some test?'), tx('Устройство остаётся в базе. Пустой параметр пропускается: балл считается только по тем данным, что есть. Недостающие замеры мы дотестируем или добавим из других источников.', 'The device stays in the database. An empty field is skipped: scores use only the data available. Missing results are tested later or added from other sources.')],
    [tx('Как определяется, подходит ли мини-ПК под сценарий?', 'How do we decide a mini PC fits a use case?'), tx('У каждого сценария есть правила: например, студенту нужно не меньше 16 ГБ ОЗУ, а Homelab ещё и расширение памяти до 64 ГБ. Мы проверяем их по данным устройства. Если параметра нет, устройство помечается «мало данных», а не отбрасывается.', 'Every use case has rules: a student needs at least 16 GB of RAM, a Homelab also needs memory upgradable to 64 GB. We check them against the device data. If a value is missing the device is marked as needing data, not dropped.')],
    [tx('Откуда ссылки «Купить»?', 'Where do Buy links come from?'), tx('Это ссылки магазинов. Если они партнёрские, мы получаем комиссию, а цена для вас не меняется. На выбор устройств и баллы это не влияет.', 'These are store links. If they are affiliate links we earn a commission at no extra cost to you. They do not affect device selection or scores.')]];
  const body = `${pagehead(tx('Методика', 'Method'), tx('Как мы тестируем', 'How we test'), tx('Сравнивайте результаты одного бенчмарка рядом. Ссылки на обзоры в карточках помогают проверить конфигурацию и условия тестов.', 'Compare results from the same benchmark side by side. The review links on each device page help you check its configuration and test conditions.'))}
<section class="wrap sec">${head2(tx('Метрики', 'Metrics'))}<div class="mgrid">${METRICS.map((m) => `<div><small>${m.u}</small><b>${tx(m.ru, m.en)}</b><p>${tx(m.hr, m.he)}</p></div>`).join('')}</div></section>
<section class="wrap sec two"><div class="panel"><h3>${tx('Характеристики, которые мы отмечаем', 'Specs we flag')}</h3><ul class="list"><li>${tx('Память распаяна или расширяется. У многих мини-ПК с LPDDR5 память припаяна, и добавить её потом нельзя.', 'Whether memory is soldered or upgradable. Many LPDDR5 mini PCs have soldered memory that cannot be added to later.')}</li><li>${tx('Слоты под SSD и их число.', 'SSD slots and how many there are.')}</li><li>${tx('OCuLink: порт для подключения внешней видеокарты через переходник.', 'OCuLink: a port for connecting an external graphics card through an adapter.')}</li><li>${tx('USB4 / Thunderbolt: быстрые внешние накопители и eGPU.', 'USB4 / Thunderbolt: fast external storage and eGPU.')}</li></ul></div><div class="panel"><h3>${tx('Как считается рейтинг', 'How ranking works')}</h3><ul class="list"><li>${tx('Балл категории объединяет доступные тесты. Состав замеров может отличаться между моделями. Для точного сравнения откройте исходные результаты.', 'A category score combines the available tests, which may differ between models. Open the original results for a direct comparison.')}</li><li>${tx('«Мой рейтинг» считает взвешенный балл по важности критериев, которую задаёте вы.', 'My ranking computes a weighted score from the importance you set.')}</li><li>${tx('Ссылки «Купить» могут быть партнёрскими. Мы получаем комиссию, цена для вас не меняется, баллы не зависят от ссылок.', 'Buy links may be affiliate links. We earn a commission at no extra cost to you and scores do not depend on links.')}</li></ul></div></section>
<section class="wrap sec faq">${head2(tx('Частые вопросы', 'FAQ'))}${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`;
  return { body, title: tx(`Методика тестов мини-ПК | ${NAME}`, `Mini PC testing method | ${NAME}`), desc: tx('Какие тесты собирает MiniPC Bench и как рассчитываются баллы мини-ПК.', 'Which tests MiniPC Bench collects and how mini PC scores are calculated.'), jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }], data: '' };
}

function pageAbout(c) {
  const { tx, lang } = c;
  const txt = (lang === 'ru' ? site.aboutRu : site.aboutEn) || tx('MiniPC Bench собирает результаты из обзоров мини-ПК в одном месте. Здесь можно сравнить бенчмарки, посмотреть характеристики и открыть исходные обзоры.', 'MiniPC Bench collects mini PC results from reviews in one place. Compare benchmarks, check specifications, and open the original reviews.');
  const p = [[tx('Сравнимые метрики', 'Comparable metrics'), tx('Сопоставляем результаты одного бенчмарка. Конфигурация и условия теста указаны в исходном обзоре, если автор их опубликовал.', 'We group results for the same benchmark. Check the original review for the configuration and published test conditions.')], [tx('Исходные значения', 'Original results'), tx('В карточках показаны результаты бенчмарков и температура под нагрузкой, когда такой замер есть.', 'Device pages show benchmark results and temperature under load when those measurements are available.')], [tx('Настраиваемый рейтинг', 'Custom ranking'), tx('Рейтинг считается по формуле и по вашим приоритетам. Партнёрские ссылки на него не влияют.', 'Rankings come from a formula and your priorities. Affiliate links do not affect them.')], [tx('Берём устройства на тест', 'We take devices for testing'), tx('Если вы производитель или продавец, напишите нам. Результаты публикуем независимо от того, как устройство справилось.', 'If you are a maker or a seller, write to us. We publish results however the device performs.')]];
  const body = `${pagehead(tx('О проекте', 'About'), tx('Зачем нужен MiniPC Bench', 'Why MiniPC Bench exists'), esc(txt))}<section class="wrap sec"><div class="mgrid">${p.map(([t, d]) => `<div><b>${t}</b><p>${d}</p></div>`).join('')}</div><p class="more"><a class="btn buy" href="${c.href('contact')}">${tx('Связаться с нами', 'Contact us')}</a></p></section>`;
  return { body, title: tx(`О проекте | ${NAME}`, `About | ${NAME}`), desc: tx('MiniPC Bench: независимая база тестов мини-ПК с единой методикой, замерами нагрева и скорости локальных LLM.', 'MiniPC Bench: an independent mini PC test database with one method and temperature under load, TDP and upgrade options.'), data: '' };
}

function pageContact(c) {
  const { tx } = c;
  const rows = [];
  if (site.email) rows.push(['Email', `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`, site.email]);
  if (site.telegram) { const t = /^https?:/i.test(site.telegram) ? site.telegram : 'https://t.me/' + site.telegram.replace(/^@/, ''); rows.push(['Telegram', `<a href="${esc(t)}" target="_blank" rel="noopener">${esc(site.telegram)}</a>`, site.telegram]); }
  if (safeUrl(site.youtube)) rows.push(['YouTube', `<a href="${esc(site.youtube)}" target="_blank" rel="noopener">${esc(site.youtube)}</a>`, site.youtube]);
  if (!rows.length) rows.push(['GitHub', `<a href="${REPOSITORY}/issues">${tx('Обсудить проект или сообщить об ошибке', 'Discuss the project or report an issue')}</a>`, REPOSITORY + '/issues']);
  const inp = (id, l, ph) => `<div class="fld"><label for="c-${id}">${l}</label><input id="c-${id}" type="text" placeholder="${ph || ''}"></div>`;
  const body = `${pagehead(tx('Контакты', 'Contact'), tx('Связаться с автором проекта', 'Contact the project author'), tx('Пишите по вопросам каталога, сотрудничества и передачи мини-ПК на тест.', 'Write about choosing a device, collaboration or sending a mini PC for testing.'))}
<section class="wrap sec two"><div class="panel"><h3>${tx('Как с нами связаться', 'How to reach us')}</h3>${rows.length ? rows.map(([k, v, raw]) => `<div class="copy"><span class="k">${k}</span><span class="v">${v}</span><button type="button" class="btn sm" data-copy="${esc(raw)}">${tx('Копировать', 'Copy')}</button></div>`).join('') : `<p>${tx('Контакты скоро появятся. Укажите их в файле data/site.json.', 'Contacts coming soon. Set them in data/site.json.')}</p>`}</div>
<div class="panel"><h3>${tx('Передать мини-ПК на тест', 'Send a mini PC for testing')}</h3><p>${tx('Заполните поля, соберите сообщение и отправьте его по любому контакту.', 'Fill in the fields, build the message and send it through any contact.')}</p><div class="fgrid">${inp('name', tx('Ваше имя или компания', 'Your name or company'))}${inp('model', tx('Модель', 'Model'), 'GMKtec EVO-X2')}${inp('country', tx('Страна доставки', 'Shipping country'))}</div><div class="fld"><label for="c-msg">${tx('Сообщение', 'Message')}</label><textarea id="c-msg" rows="3"></textarea></div><div class="row"><button type="button" class="btn pri" id="build">${tx('Собрать сообщение', 'Build the message')}</button></div><div class="fld"><label for="c-out">${tx('Готовый текст', 'Ready text')}</label><textarea id="c-out" rows="6" readonly></textarea></div><div class="row"><button type="button" class="btn" id="copyout">${tx('Копировать текст', 'Copy text')}</button></div></div></section>`;
  return { body, title: tx(`Контакты и передача мини-ПК на тест | ${NAME}`, `Contact and sending a mini PC for testing | ${NAME}`), desc: tx('Связаться с автором MiniPC Bench: вопросы по выбору мини-ПК, сотрудничество, передача устройств на независимый тест.', 'Contact the MiniPC Bench author: questions on choosing a mini PC, collaboration, sending devices for independent testing.'), data: jsonData('i18n', i18n(c)) };
}

function fitPanel(d, c) {
  const { tx } = c, L = c.lang === 'ru' ? 0 : 1;
  const rows = crit.uses.filter((u) => d.fit[u.key].st !== 'no').sort((a, b) => (d.fit[a.key].st === 'yes' ? 0 : 1) - (d.fit[b.key].st === 'yes' ? 0 : 1) || d.fit[b.key].rank - d.fit[a.key].rank);
  if (!rows.length) return '';
  const row = (u) => { const f = d.fit[u.key]; return `<div class="fitrow"><a href="${u.page ? c.href(u.page) : c.href('use', u.key)}"><b>${tx(u.ru, u.en)}</b></a> ${tag(f.st === 'yes' ? 'ok' : '', f.st === 'yes' ? tx('подходит', 'fits') : tx('мало данных', 'needs data'))}<span class="fitwhy">${f.checks.map((x) => `<span class="${x.res}">${fitMark[x.res]} ${rlabel(x.q, L)}</span>`).join(' ')}</span></div>`; };
  return `<section class="wrap sec"><div class="panel"><h3>${tx('Подходит для', 'Good for')}</h3><p>${tx('Подбор идёт по правилам сценариев: ✓ условие выполнено, ✗ нет, ? данных пока нет.', 'Matching follows the scenario rules: ✓ met, ✗ not met, ? no data yet.')}</p>${rows.map(row).join('')}</div></section>`;
}
function pageDevice(c, d) {
  const { tx, lang } = c, L = lang === 'ru' ? 0 : 1;
  const yn2 = (v) => (v === null ? '' : v ? tx('да', 'yes') : tx('нет', 'no'));
  const specs = [[tx('Процессор', 'Processor'), d.cpu], [tx('Видеоядро', 'GPU'), d.gpu], [tx('Память', 'Memory'), d.ram ? `${d.ram} GB ${d.ramType || ''}` : ''], [tx('Апгрейд памяти', 'Memory upgrade'), d.ramSoldered === true ? tx('распаяна, не расширяется', 'soldered, not upgradable') : d.ramSoldered === false ? tx('расширяется', 'upgradable') + (d.ramMax ? tx(', до ', ', up to ') + d.ramMax + ' GB' : '') : ''], [tx('Накопитель', 'Storage'), d.storage], [tx('Слотов SSD', 'SSD slots'), isNum(d.ssd) ? String(d.ssd) : ''], ['OCuLink', yn2(d.oculink)], ['USB4 / Thunderbolt', yn2(d.usb4)], [tx('Отсеков под диски', 'Drive bays'), isNum(d.bays) ? String(d.bays) : ''], [tx('Сеть', 'Network'), d.lan], ['VRAM', isNum(d.vram) ? d.vram + ' GB' : ''], ['NPU', isNum(d.npu) ? d.npu + ' TOPS' : ''], [tx('Модели ИИ', 'AI models'), d.maxModel], [tx('TDP процессора', 'CPU TDP'), isNum(d.tdp) ? d.tdp + ' W' : ''], [tx('Температура CPU под нагрузкой', 'CPU temp under stress'), isNum(d.temp) ? d.temp + ' °C' : ''], [tx('Бренд', 'Brand'), d.brand], [tx('Цена', 'Price'), isNum(d.price) ? '$' + fmt(d.price, lang) : ''], [tx('Протестирован', 'Tested'), d.tested], [tx('Наличие', 'Availability'), isNum(d.avail) ? AVL[d.avail][L] : '']].filter((s) => s[1]);
  const grp = { cpu: tx('Процессор', 'CPU'), gfx: tx('Графика', 'Graphics'), storage: tx('Накопитель', 'Storage'), mem: tx('Память', 'Memory'), ai: tx('Локальный ИИ', 'Local AI') };
  const mets = METRICS.filter((m) => isNum(d[m.k])).map((m) => { const v = d[m.k], ext = d.src[m.k] === 'ext'; return `<div class="mt"><span class="k wide" title="${esc(tx(m.hr, m.he))}">${esc(tx(m.ru, m.en))}</span><span class="bar"><i style="width:${pct(m.k, v).toFixed(0)}%"></i></span><span class="vv">${fmt(v, lang)} <small>${esc(m.u)}</small>${ext ? '<small class="ext" title="' + tx('Данные из внешнего источника', 'Data from an external source') + '">*</small>' : ''}</span></div>`; }).join('');
  const hasExt = METRICS.some((m) => isNum(d[m.k]) && d.src[m.k] === 'ext');
  const cs = CATS.map(([k, ru, en]) => `<div class="mt"><span class="k">${k}</span><span class="bar"><i style="width:${d.s[k] === null ? 0 : Math.max(3, d.s[k])}%"></i></span><span class="vv">${dash(d.s[k])}</span></div>`).join('');
  const similar = DEV.filter((x) => x.demo === d.demo && x.slug !== d.slug).sort((a, b) => (fitKeys(b, 1).filter((u) => fitKeys(d, 1).includes(u)).length - fitKeys(a, 1).filter((u) => fitKeys(d, 1).includes(u)).length) || Math.abs(a.s.overall - d.s.overall) - Math.abs(b.s.overall - d.s.overall)).slice(0, 3);
  const art = d.image ? `<img src="${c.img(d.image)}" alt="${esc(d.name)}">` : pcArt(d);
  const desc = summary(d, c) || `${d.cpu}, ${d.ram || '?'} GB ${d.ramType || ''}, TDP ${d.tdp ?? '—'} W.`;
  const body = `<div class="wrap crumbs"><a href="${c.href('home')}">${tx('Главная', 'Home')}</a> / <a href="${c.href('catalog')}">${tx('Каталог', 'Catalog')}</a> / <span>${esc(d.name)}</span></div>
<section class="devhero"><div class="wrap dev-grid"><div class="devart">${art}${d.demo ? `<span class="demo">${tx('Демо', 'Demo')}</span>` : `<span class="score big"><b>${dash(d.s.overall)}</b><small>${tx('общий балл', 'overall score')}</small></span>`}</div><div class="devinfo"><div class="tags">${tagsHtml(d, c)}</div>${d.brand ? `<p class="brandline">${tx('Производитель', 'Brand')}: <a href="${c.href('brand', slugify(d.brand))}">${esc(d.brand)}</a></p>` : ''}<h1>${esc(d.name)}</h1><p class="lead">${esc(summary(d, c))}</p>${passport(d, c)}<div class="buyrow"><span class="price lg">${isNum(d.price) ? '$' + fmt(d.price, lang) : ''}</span>${d.buyUrl ? buyBtn(d, c, 'lg') : ''}<a class="btn" href="${c.href('catalog')}?cmp=${d.slug}#compare">${tx('Сравнить', 'Compare')}</a></div>${d.demo ? `<p class="fine">${tx('Демонстрационные данные.', 'Demo data.')}</p>` : ''}</div></div></section>
<section class="wrap sec dev-cols"><div class="panel"><h3>${tx('Результаты тестов', 'Test results')}</h3><div class="mts">${mets || `<p>${tx('Замеров пока нет.', 'No measurements yet.')}</p>`}</div>${d.reviews.length ? `<p class="source-note"><a class="text-link" href="#reviews">${tx('Обзоры и источники', 'Reviews and sources')}</a></p>` : ''}${hasExt ? `<p class="fine">* ${tx('данные из внешнего источника', 'data from an external source')}</p>` : ''}</div><div class="panel"><h3>${tx('Баллы по категориям (0–100)', 'Category scores (0–100)')}</h3><div class="mts">${CATS.map(([k, ru, en]) => `<div class="mt"><span class="k wide">${tx(({ overall: 'Общий', ai: 'Локальный ИИ', gfx: 'Графика', cool: 'Холодность', eff: 'Эффективность', value: 'Цена за баллы', avail: 'Наличие' })[k], ({ overall: 'Overall', ai: 'Local AI', gfx: 'Graphics', cool: 'Coolness', eff: 'Efficiency', value: 'Value', avail: 'Availability' })[k])}</span><span class="bar"><i style="width:${d.s[k] === null ? 0 : Math.max(3, d.s[k])}%"></i></span><span class="vv">${dash(d.s[k])}</span></div>`).join('')}</div></div></section>
<section class="wrap sec"><div class="panel"><h3>${tx('Характеристики', 'Specifications')}</h3><div class="spec">${specs.map(([k, v]) => `<div><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div></div></section>
${fitPanel(d, c)}
${d.reviews.length ? `<section class="wrap sec" id="reviews">${head2(tx('Обзоры этого устройства', 'Reviews of this device'))}<div class="revs">${d.reviews.map((r) => `<a class="rev" href="${esc(r.url)}" target="_blank" rel="noopener">${ic('book')}<span>${esc(r.title || r.url)}</span></a>`).join('')}</div></section>` : ''}
${similar.length ? `<section class="wrap sec">${head2(tx('Похожие устройства', 'Similar devices'))}<div class="cards">${similar.map((x) => card(x, c)).join('')}</div></section>` : ''}`;
  const product = { '@context': 'https://schema.org', '@type': 'Product', name: d.name, brand: d.brand ? { '@type': 'Brand', name: d.brand } : undefined, description: desc, image: d.image && SITE_URL ? `${SITE_URL}/images/${d.image}` : undefined, ...(d.buyUrl && isNum(d.price) ? { offers: { '@type': 'Offer', price: d.price, priceCurrency: 'USD', url: d.buyUrl, availability: d.avail === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } } : {}) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: tx('Главная', 'Home'), item: SITE_URL ? c.abs('home') : undefined }, { '@type': 'ListItem', position: 2, name: tx('Каталог', 'Catalog'), item: SITE_URL ? c.abs('catalog') : undefined }, { '@type': 'ListItem', position: 3, name: d.name }] };
  return { body, title: tx(`${d.name}: тест, бенчмарки, апгрейд | ${NAME}`, `${d.name}: test, benchmarks, upgrades | ${NAME}`), desc, image: d.image, noindex: d.demo, jsonld: d.demo ? [crumbs] : [product, crumbs], data: '' };
}

/* ---------- страницы сценариев ---------- */
function pageUse(c, u) {
  const { tx, lang } = c, L = lang === 'ru' ? 0 : 1;
  const ranked = REAL.filter((d) => d.fit[u.key].st !== 'no').sort((a, b) => (a.fit[u.key].st === 'yes' ? 0 : 1) - (b.fit[u.key].st === 'yes' ? 0 : 1) || b.fit[u.key].rank - a.fit[u.key].rank);
  const yes = ranked.filter((d) => d.fit[u.key].st === 'yes'), maybe = ranked.filter((d) => d.fit[u.key].st === 'maybe');
  const others = crit.uses.filter((x) => x.key !== u.key);
  const body = `${pagehead(tx('Сценарий', 'Use case'), tx(u.h1Ru, u.h1En), tx(u.descRu, u.descEn))}
<section class="wrap sec two"><div class="panel"><h3>${tx('Что важно для этого сценария', 'What matters for this use case')}</h3><p>${tx(u.whyRu, u.whyEn)}</p></div><div class="panel"><h3>${tx('Как мы отбираем', 'How we select')}</h3><ul class="list">${u.req.map((q) => `<li>${rlabel(q, L)}</li>`).join('')}</ul>${u.pref.length ? `<p class="fine">${tx('Желательно, это даёт плюс в рейтинге:', 'Nice to have, adds to the ranking:')} ${u.pref.map((q) => rlabel(q, L)).join('; ')}</p>` : ''}<p class="fine">${tx('Если какого-то замера нет, устройство остаётся в списке с пометкой «мало данных».', 'If a measurement is missing the device stays listed with a "needs data" note.')}</p></div></section>
<section class="wrap sec">${head2(tx('Подходящие мини-ПК', 'Matching mini PCs'), tx(`Найдено устройств: ${yes.length}. Лучшие в начале списка.`, `Devices found: ${yes.length}. The best come first.`))}${yes.length ? `<div class="cards">${yes.map((d) => card(d, c)).join('')}</div>` : emptyBox(tx('Пока ни одно устройство в базе точно не подходит. Мы дотестируем и добавим.', 'No device in the database fits yet. We will test and add more.'))}</section>
${maybe.length ? `<section class="wrap sec">${head2(tx('Возможно подходят, мало данных', 'May fit, needs more data'), tx('По известным параметрам не подходящих условий нет, но не хватает замеров.', 'Nothing known rules them out, but some measurements are missing.'))}<div class="cards">${maybe.map((d) => card(d, c)).join('')}</div></section>` : ''}
<section class="wrap sec">${head2(tx('Другие сценарии', 'Other use cases'))}<div class="chips">${others.map((x) => `<a class="chip" href="${x.page ? c.href(x.page) : c.href('use', x.key)}">${tx(x.ru, x.en)}</a>`).join('')}</div></section>`;
  return { body, title: tx(`${u.h1Ru}: какой выбрать | ${NAME}`, `${u.h1En}: which to choose | ${NAME}`), desc: tx(`${u.h1Ru}. ${u.descRu}. Какие модели подходят и почему, по результатам тестов.`, `${u.h1En}. ${u.descEn}. Which models fit and why, based on test results.`), jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: tx(u.h1Ru, u.h1En), inLanguage: lang }], data: '' };
}

/* ---------- производители ---------- */
function allBrands() {
  const m = new Map(); BRANDS.forEach((b) => m.set(b.slug, { ...b }));
  DEV.forEach((d) => { if (d.brand) { const sl = slugify(d.brand); if (sl && !m.has(sl)) m.set(sl, { slug: sl, name: d.brand }); } });
  return [...m.values()];
}
const brandDevs = (b) => DEV.filter((d) => slugify(d.brand) === b.slug);
function pageBrands(c) {
  const { tx, lang } = c;
  const bs = allBrands().sort((a, b) => brandDevs(b).length - brandDevs(a).length);
  const body = `${pagehead(tx('Производители', 'Brands'), tx('Кто делает мини-ПК', 'Who makes mini PCs'), tx('Производителей мини-ПК не так много. Здесь собрана информация о каждом: откуда компания, что выпускает и какие её модели есть в базе.', 'There are not that many mini PC makers. Here is what we know about each: where it is from, what it makes and which models are in the database.'))}
<section class="wrap sec"><div class="tiles">${bs.map((b) => `<a class="tile" href="${c.href('brand', b.slug)}">${ic('box')}<b>${esc(b.name)}</b><span>${esc((lang === 'ru' ? b.descRu : b.descEn) || b.country || tx('Описание скоро', 'Description coming soon'))}</span><em>${brandDevs(b).length}</em></a>`).join('') || emptyBox(tx('Производителей пока нет.', 'No brands yet.'))}</div></section>`;
  return { body, title: tx(`Производители мини-ПК | ${NAME}`, `Mini PC brands | ${NAME}`), desc: tx('Производители мини-ПК: кто они, что выпускают и какие их модели протестированы в базе.', 'Mini PC brands: who they are, what they make and which of their models are tested in the database.'), data: '' };
}
function pageBrand(c, b) {
  const { tx, lang } = c;
  const list = brandDevs(b), text = lang === 'ru' ? b.descRu : b.descEn;
  const meta = [[tx('Страна', 'Country'), b.country], [tx('Основана', 'Founded'), b.founded], [tx('Сайт', 'Website'), safeUrl(b.site) ? `<a href="${esc(b.site)}" target="_blank" rel="noopener nofollow">${esc(b.site.replace(/^https?:\/\//, ''))}</a>` : '']].filter((x) => x[1]);
  const body = `${pagehead(tx('Производитель', 'Brand'), esc(b.name), esc(text || tx('Описание производителя скоро появится.', 'A description of this brand is coming soon.')))}
${meta.length ? `<section class="wrap sec"><div class="panel"><div class="spec">${meta.map(([k, v]) => `<div><span>${k}</span><span>${typeof v === 'string' && v.startsWith('<a') ? v : esc(v)}</span></div>`).join('')}</div></div></section>` : ''}
<section class="wrap sec">${head2(tx('Модели в базе', 'Models in the database'))}${list.length ? `<div class="cards">${list.map((d) => card(d, c)).join('')}</div>` : emptyBox(tx('Моделей этого производителя пока нет.', 'No models from this brand yet.'))}</section>`;
  return { body, title: tx(`${b.name}: производитель мини-ПК | ${NAME}`, `${b.name}: mini PC brand | ${NAME}`), desc: text || tx(`Мини-ПК ${b.name}: тесты и характеристики моделей в базе.`, `${b.name} mini PCs: tests and specs of models in the database.`), jsonld: [{ '@context': 'https://schema.org', '@type': 'Brand', name: b.name, ...(safeUrl(b.site) ? { url: b.site } : {}) }], data: '' };
}

/* ---------- запись файлов ---------- */
function write(rel, content) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
fs.rmSync(OUT, { recursive: true, force: true });
const urls = [];
const builders = { home: pageHome, catalog: pageCatalog, ai: pageAi, nas: pageNas, brands: pageBrands, method: pageMethod, about: pageAbout, contact: pageContact };
for (const lang of LANGS) {
  for (const key of PAGES) {
    const dir = dirOf(lang, key), c = ctxFor(lang, dir), o = builders[key](c);
    write(`${dir}/index.html`, layout(c, { ...o, key })); urls.push(dir);
  }
  for (const u of crit.uses) {
    if (u.page) continue;
    const dir = dirOf(lang, 'use', u.key), c = ctxFor(lang, dir), o = pageUse(c, u);
    write(`${dir}/index.html`, layout(c, { ...o, key: 'use', slug: u.key })); urls.push(dir);
  }
  for (const b of allBrands()) {
    const dir = dirOf(lang, 'brand', b.slug), c = ctxFor(lang, dir), o = pageBrand(c, b);
    write(`${dir}/index.html`, layout(c, { ...o, key: 'brand', slug: b.slug })); urls.push(dir);
  }
  for (const d of DEV) {
    const dir = dirOf(lang, 'device', d.slug), c = ctxFor(lang, dir), o = pageDevice(c, d);
    write(`${dir}/index.html`, layout(c, { ...o, key: 'device', slug: d.slug }));
    if (!d.demo) urls.push(dir);
  }
}
// корневая страница: выбирает язык
write('index.html', `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(NAME)}</title><meta http-equiv="refresh" content="2;url=ru/"><link rel="stylesheet" href="assets/style.css"></head><body class="root"><main class="rootbox"><h1>${esc(NAME)}</h1><p><a class="btn buy lg" href="ru/">Русский</a> <a class="btn lg" href="en/">English</a></p></main><script>try{var l=localStorage.getItem('mpb-lang')||((navigator.language||'').slice(0,2)==='ru'?'ru':'en');location.replace(l+'/')}catch(e){}</script></body></html>`);
write('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 | ${esc(NAME)}</title><link rel="stylesheet" href="${esc(SITE_URL)}/assets/style.css"></head><body class="root"><main class="rootbox"><h1>404</h1><p><a class="btn" href="${esc(SITE_URL)}/">${esc(NAME)}</a></p></main></body></html>`);
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'static'))) if (fs.statSync(path.join(ROOT, 'static', f)).isFile()) fs.copyFileSync(path.join(ROOT, 'static', f), path.join(OUT, 'assets', f));
if (has('images')) { fs.mkdirSync(path.join(OUT, 'images'), { recursive: true }); for (const f of imgFiles) fs.copyFileSync(path.join(ROOT, 'images', f), path.join(OUT, 'images', f)); }
// админка не публикуется на сайт: она лежит в папке admin/ и открывается с вашего компьютера
if (has('admin')) fs.writeFileSync(path.join(ROOT, 'admin/data.js'), 'window.MPB=' + JSON.stringify({ crit, dev: readJson('data/devices.json', []), brands: BRANDS }) + ';');
if (has('data/CNAME')) fs.copyFileSync(path.join(ROOT, 'data/CNAME'), path.join(OUT, 'CNAME'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
if (SITE_URL) {
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_URL}/${u}/</loc></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}
console.log(`Готово: ${DEV.length} устройств, ${urls.length} страниц в карте сайта → ${path.relative(process.cwd(), OUT) || OUT}${SITE_URL ? '' : '  (siteUrl не задан: canonical и sitemap пропущены)'}`);
