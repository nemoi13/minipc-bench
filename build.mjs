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
const RL = {
  ram: ['Оперативная память', 'Installed RAM'],
  ramcap: ['Объём ОЗУ с учётом расширения', 'RAM including upgrades'],
  aimem: ['Оперативная или видеопамять', 'System RAM or graphics memory'],
  ssd: ['Слоты для SSD', 'SSD slots'],
  storslots: ['Слоты для SSD или отсеки для дисков', 'SSD slots or drive bays'],
  bays: ['Отсеки для дисков', 'Drive bays'],
  tdp: ['TDP процессора', 'CPU TDP'],
  temp: ['Температура процессора', 'CPU temperature'],
  's.perf': ['Балл процессора', 'CPU score'],
  's.gfx': ['Балл графики', 'Graphics score'],
  's.ai': ['Балл в категории «ИИ»', 'AI category score'],
  lanG: ['Скорость сетевого порта', 'Ethernet link speed'],
  lanPorts: ['Сетевые порты', 'Ethernet ports'],
  npu: ['Пиковая производительность NPU', 'Peak NPU performance'],
};
const RU_ = { ram: [' ГБ', ' GB'], ramcap: [' ГБ', ' GB'], aimem: [' ГБ', ' GB'], tdp: [' Вт', ' W'], temp: [' °C', ' °C'], lanG: [' Гбит/с', ' Gbit/s'], npu: [' TOPS', ' TOPS'] };
const BL = {
  ramUp: ['Можно добавить или заменить ОЗУ', 'RAM can be added or replaced'],
  egpu: ['Есть OCuLink или USB4', 'Has OCuLink or USB4'],
  nas: ['Устройство относится к классу NAS', 'Device is listed as a NAS'],
  oculink: ['Есть OCuLink', 'Has OCuLink'],
  usb4: ['Есть USB4', 'Has USB4'],
};
function rlabel(q, L) {
  if (BL[q.f]) return BL[q.f][L];
  const limit = q.op === '>=' ? ['от', 'at least'] : ['до', 'up to'];
  const value = q.v.toLocaleString(L === 0 ? 'ru-RU' : 'en-US');
  return `${RL[q.f][L]} ${limit[L]} ${value}${(RU_[q.f] || ['', ''])[L]}`;
}
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
const PCL = { weak: ['Начальный', 'Entry'], mid: ['Средний', 'Mid'], strong: ['Высокий', 'High'], top: ['Очень высокий', 'Very high'] };
const HCL = { cool: ['Низкий', 'Low'], warm: ['Средний', 'Moderate'], hot: ['Высокий', 'High'] };
const AVL = [['Нет в наличии', 'Out of stock'], ['Ограниченно', 'Limited'], ['В наличии', 'In stock']];
const CATS = [
  ['overall', 'Общий балл', 'Overall score'], ['ai', 'Балл для ИИ', 'AI score'], ['gfx', 'Балл графики', 'Graphics score'],
  ['cool', 'Низкая температура CPU', 'Low CPU temperature'], ['eff', 'Балл CPU на ватт TDP', 'CPU score per watt of TDP'], ['value', 'Баллы на доллар', 'Score per dollar'], ['avail', 'Наличие в продаже', 'Availability'],
];
const CAT_ICON = { overall: 'star', ai: 'ai', gfx: 'screen', cool: 'meter', eff: 'bolt', value: 'coin', avail: 'box' };
const metricUnit = (m, c) => c.tx(({ pts: 'баллы', 'MB/s': 'МБ/с', 'GB/s': 'ГБ/с', 'tok/s': 'токенов/с' })[m.u] || m.u, m.u);
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
  if (d.pc) o += tag('', c.tx('Класс CPU: ', 'CPU tier: ') + PCL[d.pc][L]);
  if (d.hc) o += tag(d.hc === 'hot' ? 'hot' : d.hc === 'cool' ? 'cool' : '', c.tx('Нагрев: ', 'Heat: ') + HCL[d.hc][L]);
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
const buyBtn = (d, c, cls) => d.buyUrl ? `<a class="btn buy ${cls}" href="${esc(d.buyUrl)}" target="_blank" rel="noopener sponsored nofollow">${c.tx('Купить', 'Buy')}</a>` : '';
const summary = (d, c) => (c.lang === 'ru' ? d.sumRu || d.sumEn : d.sumEn || d.sumRu) || '';

function card(d, c, mode = 'std', hidden = false) {
  const tx = c.tx, L = c.lang;
  let mid;
  if (mode === 'ai') mid = kv([[tx('Видеопамять (VRAM)', 'Graphics memory (VRAM)'), isNum(d.vram) ? d.vram + tx(' ГБ', ' GB') : '—'], [tx('Генерация текста', 'Text generation'), isNum(d.llm) ? fmt(d.llm, L) + tx(' токенов/с', ' tokens/s') : '—'], ['NPU', isNum(d.npu) ? d.npu + ' TOPS' : '—'], [tx('Размер языковой модели', 'Language model size'), d.maxModel || '—'], ['TDP', isNum(d.tdp) ? d.tdp + ' W' : '—']]);
  else if (mode === 'nas') mid = kv([[tx('Отсеки', 'Bays'), d.bays ?? '—'], [tx('Сеть', 'LAN'), d.lan || '—'], ['TDP', isNum(d.tdp) ? d.tdp + ' W' : '—'], [tx('Темп. CPU', 'CPU temp'), isNum(d.temp) ? d.temp + ' °C' : '—']]);
  else mid = `<div class="mts">${sbar(tx('CPU', 'CPU'), d.s.perf)}${sbar(tx('Графика', 'GPU'), d.s.gfx)}${sbar(tx('ИИ', 'AI'), d.s.ai)}</div><div class="phys"><span>TDP ${isNum(d.tdp) ? d.tdp + tx(' Вт', ' W') : '—'}</span><span class="${d.hc === 'hot' ? 'hot' : d.hc === 'cool' ? 'cool' : ''}">${isNum(d.temp) ? d.temp + ' °C' : '— °C'}</span><span>PM ${fmt(d.pm_total, L)}</span></div>`;
  const art = d.image ? `<img src="${c.img(d.image)}" alt="${esc(d.name)}" loading="lazy">` : pcArt(d);
  const href = c.href('device', d.slug);
  const compare = c.dir === dirOf(c.lang, 'catalog')
    ? `<label class="cmpl"><input type="checkbox" data-cmp="${d.slug}" aria-label="${esc(tx('Сравнить ' + d.name, 'Compare ' + d.name))}"> ${tx('Сравнить', 'Compare')}</label>`
    : `<a class="text-link" href="${c.href('catalog')}?cmp=${d.slug}#compare">${tx('Сравнить', 'Compare')}</a>`;
  return `<article class="card" data-slug="${d.slug}"${hidden ? ' hidden' : ''}><a class="art" href="${href}" aria-label="${esc(d.name)}">${art}${d.demo ? `<span class="demo">${tx('Демо', 'Demo')}</span>` : `<span class="score"><b data-score>${dash(d.s.overall)}</b><small>${tx('балл', 'score')}</small></span>`}</a><div class="cb"><h3><a href="${href}">${esc(d.name)}</a></h3><div class="tags">${tagsHtml(d, c)}</div>${passport(d, c)}${mid}<div class="cf"><span class="price">${isNum(d.price) ? '$' + fmt(d.price, L) : ''}</span><div class="row"><a class="btn sm" href="${href}">${tx('Подробнее', 'Details')}</a>${buyBtn(d, c, 'sm')}</div></div>${compare}</div></article>`;
}
const STD_DEFS = CATS.map(([k, ru, en]) => ({
  ic: CAT_ICON[k], ru, en, val: (d) => d.s[k],
  info: (d, L) => (k === 'ai' ? (isNum(d.llm) ? isNum(d.llm) ? fmt(d.llm, L) + tx(' токенов/с', ' tokens/s') : '—' : fmt(d.vram, L) + ' GB VRAM') : k === 'gfx' ? (isNum(d.sn_light) ? fmt(d.sn_light, L) + ' SN Light' : isNum(d.timespy) ? fmt(d.timespy, L) + ' Time Spy' : 'iGPU') : k === 'cool' ? fmt(d.temp, L) + ' °C' : k === 'eff' ? 'TDP ' + fmt(d.tdp, L) + ' W' : k === 'value' ? '$' + fmt(d.price, L) : k === 'avail' ? AVL[isNum(d.avail) ? d.avail : 1][L === 'ru' ? 0 : 1] : (isNum(d.pm_total) ? 'PassMark ' + fmt(d.pm_total, L) : 'CPU')) + ' · ' + d.s[k] + '/100',
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
  return {
    found: t('Найдено ', 'Found '), of: t(' из ', ' of '),
    cmpEmpty: t('Отметьте «Сравнить» на карточках двух или более моделей.', 'Select Compare on the cards for two or more models.'),
    cmpOne: t('Выбрана одна модель. Отметьте ещё одну в каталоге.', 'One model selected. Pick another from the catalog.'),
    cmpMax: t('В сравнении может быть до четырёх моделей.', 'Compare up to four models.'),
    any: t('любой', 'any'), noLimit: t('без ограничения', 'no limit'),
    copied: t('Ссылка скопирована', 'Link copied'),
    copyFail: t('Скопируйте адрес страницы', 'Copy the page address'),
    score: t('Общий балл', 'Overall score'), demo: t('Демо', 'Demo'), my: t('Мой балл', 'My score'),
    msg: t('Здравствуйте! Хочу предложить устройство для MiniPC Bench.\nИмя или компания — {name}\nМодель — {model}\nСтрана отправки — {country}\n{msg}', 'Hello! I’d like to suggest a device for MiniPC Bench.\nName or company — {name}\nModel — {model}\nShipping country — {country}\n{msg}'),
    cmpRows: [
      [t('Процессор', 'Processor'), 'cpu'], [t('Графика', 'Graphics'), 'gpu'],
      [t('Оперативная память, ГБ', 'RAM, GB'), 'ram', 1],
      [t('PassMark, общий балл', 'PassMark, overall'), 'pm_total', 1],
      ['PassMark CPU Mark', 'pm_cpu', 1], ['Cinebench R23', 'cb23', 1], ['Steel Nomad Light', 'sn_light', 1],
      [t('Чтение с SSD, МБ/с', 'SSD read, MB/s'), 'cdm_r', 1],
      [t('Генерация текста, токенов/с', 'Text generation, tokens/s'), 'llm'],
      [t('TDP процессора, Вт', 'CPU TDP, W'), 'tdp'], [t('Температура процессора, °C', 'CPU temperature, °C'), 'temp'],
      [t('Цена, $', 'Price, $'), 'price'], [t('Общий балл сайта', 'Overall site score'), 's'],
    ],
    cats: Object.fromEntries(CATS.map(([k, ru, en]) => [k, t(ru, en)])),
    icons: Object.fromEntries(Object.entries(CAT_ICON).map(([k, v]) => [k, ic(v)])),
  };
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
<footer class="foot"><div class="wrap footin"><div><b>${esc(NAME)}</b><p>${tx('Независимая база тестов мини-ПК, ИИ-систем и NAS. Результаты, характеристики и ссылки на обзоры.', 'An independent database of mini PC, AI system, and NAS tests. Results, specs, and links to reviews.')}</p></div><div class="fl"><a href="${c.href('brands')}">${tx('Производители', 'Brands')}</a><a href="${c.href('about')}">${tx('О проекте', 'About')}</a><a href="${c.href('contact')}">${tx('Связаться', 'Contact')}</a></div>${REAL.some((d) => d.buyUrl) ? `<p class="fine">${tx('Мы можем получить комиссию за покупку по партнёрской ссылке. Такие ссылки не влияют на оценки.', 'We may earn a commission from an affiliate link. These links do not affect scores.')}</p>` : ''}</div></footer>
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
    ['gaming', 'game', tx('Для игр', 'Gaming'), tx('Игры на встроенной графике или с внешней видеокартой', 'Play on integrated graphics or with an external GPU')],
    ['ai', 'ai', tx('Локальный ИИ', 'Local AI'), tx('Запуск языковых моделей на своём компьютере', 'Run language models on your own machine')],
    ['nas', 'nas', tx('Домашнее хранилище', 'Home storage'), tx('Общие файлы и резервные копии в домашней сети', 'Shared files and backups on your home network')],
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
  const body = `<section class="wrap hero hero-in"><div class="hero-copy"><h1>${tx('Какой мини‑ПК выбрать', 'Which mini PC should you buy')}<span>?</span></h1><p class="lead">${tx('Выберите, что будете делать на мини-ПК. Сравните модели по тестам из обзоров и проверьте, как они греются, можно ли добавить память или поставить второй SSD.', 'Start with what you want to do on your mini PC. Compare results from reviews, see how hot each model runs, and check whether you can add RAM or a second SSD.')}</p><div class="cta"><a class="btn pri lg" href="${c.href('catalog')}">${tx('Открыть каталог', 'Browse catalog')}</a><a class="btn lg" href="${compareHref}">${ic('scale')}${tx('Пример сравнения', 'See a comparison')}</a></div></div>
<figure class="hero-art"><img src="${c.asset('mini-pc-lab.webp')}" alt="" width="1200" height="800" fetchpriority="high"><figcaption>${ic('box')}${tx('Мини-ПК · иллюстрация', 'Mini PC · illustration')}</figcaption></figure></section>
<div class="wrap"><dl class="stats">${stats.map(([value, label]) => `<div><dt>${label}</dt><dd>${fmt(value, lang)}</dd></div>`).join('')}</dl></div>
<section class="wrap sec home-section">${head2(tx('Выберите мини-ПК под задачу', 'Pick a mini PC for your needs'))}<div class="routes">${routes}</div><details class="all-uses"><summary>${tx('Все сценарии', 'All use cases')}</summary><div class="chips">${extra.map((u) => `<a class="chip" href="${useHref(u)}">${tx(u.ru, u.en)}</a>`).join('')}</div></details></section>
${featured.length ? `<section class="wrap sec home-section"><div class="section-top">${head2(tx('Что уже есть в каталоге', 'What’s in the catalog'))}<a class="text-link" href="${c.href('catalog')}">${tx('Все модели', 'All models')}</a></div><div class="featured-models">${featuredCards}</div></section>` : ''}
<section class="wrap sec home-section"><div class="method-block"><span class="route-icon">${ic('lab')}</span><div><h2>${tx('Как читать результаты', 'How to read the results')}</h2><p>${tx('В карточках есть исходные цифры и ссылки на обзоры. Баллы сайта помогают ориентироваться внутри каталога. Для выбора между двумя моделями начните с результатов одного и того же теста.', 'Device pages show the original numbers and link to the reviews. Our scores help you browse the catalog. To choose between two models, start with their results in the same benchmark.')}</p></div><a class="btn ghost" href="${c.href('method')}">${tx('Методика', 'Read the method')}</a></div></section>`;
  return {
    body, title: tx(`Какой мини-ПК выбрать? Каталог и тесты | ${NAME}`, `Which mini PC should you buy? Catalog and tests | ${NAME}`),
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
    return `<div class="sl"><label for="s-${k}"><span>${tx(ru, en)}</span><b id="o-${k}">${kind === 'min' ? tx('любой', 'any') : tx('без ограничения', 'no limit')}</b></label><input id="s-${k}" type="range" data-s="${k}" data-kind="${kind}" min="${lo}" max="${hi}" step="${step}" value="${kind === 'min' ? lo : hi}"></div>`;
  }).join('');
  const W = { perf: ['Процессор', 'CPU power'], ai: ['Локальный ИИ', 'Local AI'], gfx: ['Графика', 'Graphics'], cool: ['Холодный', 'Cool'], eff: ['CPU на ватт TDP', 'CPU per watt of TDP'], value: ['Цена за баллы', 'Price per score'], avail: ['Наличие', 'Availability'] };
  const dw = { perf: 3, ai: 3, gfx: 2, cool: 3, eff: 2, value: 3, avail: 1 };
  const sorts = [['overall', tx('Общий балл', 'Overall score')], ['my', tx('Мой рейтинг', 'My ranking')], ['perf', tx('Процессор', 'CPU power')], ['ai', tx('Локальный ИИ', 'Local AI')], ['gfx', tx('Графика', 'Graphics')], ['cool', tx('Ниже температура', 'Lower temperature')], ['eff', tx('Балл CPU на ватт TDP', 'CPU score per watt of TDP')], ['value', tx('Цена за баллы', 'Value')], ['price', tx('Дешевле', 'Cheapest')], ['new', tx('Новые тесты', 'Newest tests')]];
  const presets = [['office', 'screen', tx('Работа и дом', 'Work and home')], ['game', 'game', tx('Игры', 'Gaming')], ['ai', 'ai', tx('Локальный ИИ', 'Local AI')], ['cool', 'meter', tx('Ниже температура', 'Lower temperature')]];
  const body = `${pagehead(tx('Каталог', 'Catalog'), tx('Тесты и сравнение мини-ПК', 'Mini PC tests and comparisons'), tx('Введите название модели или процессора. Чтобы поставить результаты рядом, отметьте «Сравнить» на карточках. В одну таблицу можно добавить до четырёх моделей.', 'Enter a model or processor name. Select Compare on the cards to put their results side by side. Each comparison holds up to four models.'))}
<section class="wrap sec catalog-results"><div class="presets">${presets.map(([k, i, t]) => `<button type="button" class="preset" data-preset="${k}">${ic(i)}${t}</button>`).join('')}</div>
<div class="catalog-search"><label for="q">${ic('search')}<span class="sr">${tx('Поиск по каталогу', 'Search the catalog')}</span></label><input id="q" type="search" placeholder="${tx('Название, процессор, видеоядро', 'Name, processor, GPU')}"></div>
<div class="cat"><details class="fp" id="fp" open><summary>${tx('Фильтры', 'Filters')}</summary><div class="fbody">

<div class="fg"><span class="lb">${tx('Сценарий', 'Use case')}</span>${chips('use', crit.uses.map((u) => [u.key, tx(u.ru, u.en)]))}</div>
<div class="fg"><span class="lb">${tx('Память, накопители и порты', 'Memory, storage, and ports')}</span>${flag('ramup', 'Можно добавить или заменить ОЗУ', 'RAM can be added or replaced')}${flag('ssd', 'Есть слот под SSD', 'Has an SSD slot')}${flag('oculink', 'Есть OCuLink', 'Has OCuLink')}${flag('usb4', 'Есть USB4', 'Has USB4')}</div>
<div class="fg"><span class="lb">${tx('Форм-фактор', 'Form factor')}</span>${chips('ff', [['mini', tx('Мини-ПК', 'Mini PC')], ['nas', 'NAS']])}</div>
<div class="fg"><span class="lb">${tx('Класс процессора по баллам сайта', 'CPU tier by site score')}</span>${chips('pc', Object.keys(PCL).map((k) => [k, PCL[k][L]]))}</div>
<div class="fg"><span class="lb">${tx('Нагрев процессора', 'CPU temperature tier')}</span>${chips('hc', Object.keys(HCL).map((k) => [k, HCL[k][L], k === 'cool' ? 'coolc' : k === 'hot' ? 'hotc' : '']))}</div>
${uniq('brand').length ? `<div class="fg"><span class="lb">${tx('Производитель', 'Brand')}</span>${chips('brand', uniq('brand').sort().map((v) => [v, v]))}</div>` : ''}
${uniq('ram').length ? `<div class="fg"><span class="lb">${tx('Память', 'Memory')}</span>${chips('ram', uniq('ram').sort((a, b) => a - b).map((r) => [r, r + ' GB']))}</div>` : ''}
${uniq('vendor').length ? `<div class="fg"><span class="lb">${tx('Процессор', 'Processor')}</span>${chips('vendor', uniq('vendor').sort().map((v) => [v, v]))}</div>` : ''}
${sliders}${DEV.some((d) => d.demo) ? flag('demo', 'Показывать демо-устройства', 'Show demo devices') : ''}${flag('stock', 'Только в наличии', 'In stock only')}<label class="cmpl"><input type="checkbox" data-flag="unk" checked> ${tx('Оставлять модели без данных для выбранных порогов', 'Include models missing data for active thresholds')}</label><button type="button" class="btn sm" data-preset="reset">${tx('Сбросить фильтры', 'Reset filters')}</button></div></details>
<div><details class="wp"><summary>${tx('Мои приоритеты для рейтинга', 'My ranking priorities')}</summary><div class="wgrid">${Object.keys(W).map((k) => `<div class="sl"><label for="w-${k}"><span>${W[k][L]}</span><b id="wo-${k}">${dw[k]}</b></label><input id="w-${k}" type="range" data-w="${k}" min="0" max="5" step="1" value="${dw[k]}"></div>`).join('')}</div></details>
<div class="tools"><span class="grow" id="count" role="status">${REAL.length} ${tx('в каталоге', 'in catalog')}</span><a href="#compare" class="btn sm compare-jump">${ic('scale')} ${tx('Сравнить', 'Compare')} <span id="cmp-count">0</span></a><label for="sort">${tx('Сортировка', 'Sort')}</label><select id="sort">${sorts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
<div class="cards" id="cards">${DEV.length ? DEV.map((d) => card(d, c, 'std', d.demo)).join('') : emptyBox(tx('В каталоге пока нет устройств.', 'The catalog has no devices yet.'))}</div><div class="empty" id="none" hidden>${tx('Под такие фильтры ничего не нашлось.', 'No devices match these filters.')} <button type="button" class="btn sm" data-preset="reset">${tx('Сбросить фильтры', 'Reset filters')}</button></div></div></div></section>
<section class="wrap sec" id="compare"><div class="section-top">${head2(tx('Сравнение', 'Comparison'), tx('В таблице — характеристики и результаты обзоров. Прочерк означает, что у нас пока нет значения для этой модели.', 'The table shows specs and results from reviews. A dash means we don’t have a value for that model yet.'))}<div class="row"><button type="button" class="btn sm" id="cmp-share" hidden>${tx('Копировать ссылку', 'Copy link')}</button><button type="button" class="btn sm" id="cmp-clear" hidden>${tx('Очистить', 'Clear')}</button></div></div><div id="cmpbox" class="cmp">${emptyBox(i18n(c).cmpEmpty)}</div></section>
<section class="wrap sec" id="leaderboard" ${REAL.length < 2 ? 'hidden' : ''}>${head2(tx('Лидеры по категориям', 'Category leaders'), tx('Здесь только модели, которые прошли ваши фильтры. Категория появляется, когда есть данные хотя бы по двум моделям. Для температуры и результатов тестов сверяйте условия в обзорах.', 'This list uses your current filters. A category appears once at least two matching devices have data for it. Check the reviews for the test conditions behind temperatures and benchmark results.'))}<div id="winners">${winners(REAL, STD_DEFS, c)}</div></section>`;
  return { body, title: tx(`Каталог мини-ПК с бенчмарками и фильтрами | ${NAME}`, `Mini PC catalog with benchmarks and filters | ${NAME}`), desc: tx('Все протестированные мини-ПК: сравнение по производительности, нагреву, TDP, возможности расширить память и SSD, наличию OCuLink.', 'All tested mini PCs: compare performance, heat, TDP, memory and SSD upgradability, OCuLink.'), data: jsonData('dev-data', demoList(c)) + jsonData('i18n', i18n(c)) };
}

function pageAi(c) {
  const { tx } = c;
  const base = DEV.filter((d) => d.ff === 'mini').sort((a, b) => Number(a.demo) - Number(b.demo) || (b.vram || 0) - (a.vram || 0));
  const hasRealTests = base.some((d) => !d.demo && isNum(d.llm));
  const note = hasRealTests ? '' : `<p class="banner" data-no-real-llm>${tx('Скорость генерации для реальных мини-ПК пока не добавлена.', 'There are no generation speed results for real mini PCs yet.')} ${base.some((d) => d.demo && isNum(d.llm)) ? tx('Значение в демо-карточке показывает, как выглядит замер.', 'The value on the demo card shows what a result looks like.') : ''}</p>`;
  const body = `${pagehead(tx('Гид по выбору', 'Buying guide'), tx('Мини-ПК для локального ИИ', 'Mini PCs for local AI'), tx('Сначала выясните, поместится ли языковая модель в память. Затем ищите замеры скорости именно для этой модели и приложения, в котором будете её запускать.', 'First check whether the language model fits in memory. Then look for speed tests using that exact model and the app you plan to run.'))}
<section class="wrap sec"><div class="panel">${head2(tx('Сколько памяти нужно модели?', 'How much memory does a model need?'), tx('7B означает 7 миллиардов параметров. Примерные объёмы ниже относятся к моделям, сжатым до 4 бит (Q4). Длинный диалог, само приложение и система могут потребовать дополнительной памяти.', '7B means 7 billion parameters. The estimates below are for models compressed to 4 bits (Q4). Long conversations, the app, and the operating system may need extra memory.'))}
<div class="chips big">${crit.aiModels.map((m) => `<button type="button" class="chip" data-aim="${m.gb}" aria-pressed="false">${m.b}B · ≈ ${m.gb} ${tx('ГБ', 'GB')}</button>`).join('')}<button type="button" class="chip" data-aim="0" aria-pressed="true">${tx('Все модели', 'All devices')}</button></div>
<p class="source-note">${tx('Кнопки фильтруют список по указанной видеопамяти (VRAM). Для встроенной графики, которая использует общую память, доступный объём зависит от конфигурации. Уточните его в обзоре или документации модели.', 'These buttons filter by listed graphics memory (VRAM). For integrated GPUs using shared memory, the available amount depends on the configuration. Check the review or the device documentation.')}</p></div>${note}</section>
<section class="wrap sec">${head2(tx('Память и тесты в каталоге', 'Memory and tests in the catalog'), '<span id="aicount" role="status"></span>')}<div class="cards" id="cards">${base.length ? base.map((d) => card(d, c, 'ai')).join('') : emptyBox(tx('В каталоге пока нет мини-ПК для сравнения.', 'There are no mini PCs to compare yet.'))}</div><div class="empty" id="none" hidden>${tx('Нет карточек с таким объёмом указанной видеопамяти. Нажмите «Все модели», чтобы посмотреть и устройства с неполными данными.', 'No cards list that amount of graphics memory. Choose All devices to include devices with incomplete data.')}</div></section>
<section class="wrap sec two"><div class="panel"><h3>${tx('Как читать скорость', 'How to read generation speed')}</h3><p>${tx('Скорость указывают в токенах в секунду. Токен — примерно часть слова. Сравнивайте результаты с одинаковой моделью, сжатием и длиной контекста. TOPS описывает мощность ускорителя NPU и напрямую не переводится в токены в секунду.', 'Generation speed is measured in tokens per second. A token is roughly a piece of a word. Compare the same model, compression, and context length. NPU TOPS describes the accelerator’s compute capability and does not translate directly into tokens per second.')}</p></div>
<div class="panel"><h3>${tx('Если модель работает каждый день', 'If you run the model every day')}</h3><p>${tx('Смотрите на шум и потребление всего мини-ПК от розетки в простое и под нагрузкой. Если планируете добавить внешнюю видеокарту, заранее проверьте порт и совместимость адаптера.', 'Look for noise and whole-system power measured at the wall, both at idle and under load. If you plan to add an external GPU, check the port and adapter compatibility in advance.')}</p><a class="text-link" href="${c.href('use', 'egpu')}">${tx('Как выбрать мини-ПК для внешней видеокарты', 'Choosing a mini PC for an external GPU')}</a></div></section>`;
  return { body, title: tx(`Мини-ПК для локального ИИ: память и скорость генерации | ${NAME}`, `Mini PCs for local AI: memory and generation speed | ${NAME}`), desc: tx('Как оценить память для локальной языковой модели и сравнить результаты генерации.', 'Estimate the memory needed for a local language model and compare generation results.'), data: jsonData('dev-data', demoList(c)) + jsonData('i18n', i18n(c)) };
}


function pageNas(c) {
  const { tx } = c;
  const base = DEV.filter((d) => d.ff === 'nas' || d.fit.nas.st === 'yes');
  const onlyDemo = base.length > 0 && base.every((d) => d.demo);
  const chip = (k, v, label) => `<button type="button" class="chip" data-nas="${k}" data-v="${v}" aria-pressed="${v === 0}">${label}</button>`;
  const sorts = [['bays', tx('Больше отсеков', 'More drive bays')], ['lan', tx('Быстрее сеть', 'Faster Ethernet')], ['tdp', tx('Меньше TDP', 'Lower TDP')], ['temp', tx('Ниже температура CPU', 'Lower CPU temperature')], ['price', tx('Сначала дешевле', 'Price: low to high')]];
  const body = `${pagehead(tx('Гид по выбору', 'Buying guide'), tx('Как выбрать NAS для дома', 'How to choose a home NAS'), tx('NAS — это хранилище, к которому можно обращаться с разных устройств в сети. На нём удобно держать общие файлы, семейный архив и резервные копии компьютеров.', 'A NAS is storage you can access from several devices on your network. It gives you a place for shared files, family archives, and computer backups.'))}
<section class="wrap sec two"><div class="panel"><h3>${tx('Сколько дисков установить', 'How many drives do you need?')}</h3><p>${tx('Число отсеков подсказывает, сколько дисков поместится. Полезный объём зависит от ёмкости дисков и настроек RAID. Даже с RAID держите отдельную резервную копию важных файлов.', 'Drive bays tell you how many disks fit. Usable capacity depends on drive sizes and RAID settings. Keep a separate backup of important files, even with RAID.')}</p></div>
<div class="panel"><h3>${tx('Какая сеть понадобится', 'What speed can your network handle?')}</h3><p>${tx('Быстрый порт помогает при передаче больших файлов, если ту же скорость поддерживают компьютер и сетевое оборудование. Для круглосуточной работы ищите в обзоре потребление от розетки в простое.', 'A faster port helps with large transfers when the computer and network hardware support the same speed. For always-on use, check the review for idle power measured at the wall.')}</p></div></section>
<section class="wrap sec"><div class="section-top">${head2(onlyDemo ? tx('Как выглядит каталог NAS', 'A look at the NAS catalog') : tx('Сравните хранилища', 'Compare network storage'), onlyDemo ? tx('В разделе пока только примеры. На них можно попробовать фильтры по отсекам и сети. Характеристики в этих карточках условные.', 'This section currently contains sample cards. Use them to try the drive bay and network filters. The specifications are illustrative.') : '')}</div>
${!onlyDemo && base.some((d) => d.demo) ? `<p class="banner">${tx('Карточки «Демо» показывают, как выглядит каталог. Характеристики в них условные.', 'Demo cards show what the catalog looks like. Their specifications are illustrative.')}</p>` : ''}
<div class="row gap"><div class="fg"><span class="lb">${tx('Число отсеков', 'Drive bays')}</span><div class="chips">${chip('bays', 0, tx('Любое', 'Any'))}${chip('bays', 2, '2+')}${chip('bays', 4, '4+')}${chip('bays', 6, '6+')}</div></div><div class="fg"><span class="lb">${tx('Скорость сети от', 'Minimum Ethernet speed')}</span><div class="chips">${chip('lan', 0, tx('Любая', 'Any'))}${chip('lan', 2.5, tx('2,5 Гбит/с', '2.5 Gbit/s'))}${chip('lan', 10, tx('10 Гбит/с', '10 Gbit/s'))}</div></div><div class="fg"><label for="nsort" class="lb">${tx('Порядок', 'Sort by')}</label><select id="nsort">${sorts.map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select></div></div>
<p class="source-note fine" id="nascount" role="status"></p><div class="cards" id="cards">${base.length ? base.map((d) => card(d, c, 'nas')).join('') : emptyBox(tx('В каталоге пока нет NAS.', 'There are no NAS devices in the catalog yet.'))}</div><div class="empty" id="none" hidden>${tx('По этим фильтрам ничего не нашлось. Попробуйте снизить порог скорости сети или числа отсеков.', 'No devices match. Try lowering the minimum network speed or bay count.')}</div></section>
<section class="wrap sec"><div class="panel"><h3>${tx('А если файлов немного?', 'What if you only need a little storage?')}</h3><p>${tx('Для компактного файлового сервера можно взять мини-ПК с несколькими слотами под SSD. Проверьте типы накопителей, которые он поддерживает.', 'A mini PC with multiple SSD slots can serve as a compact file server. Check which drive types it supports.')}</p><a class="text-link" href="${c.href('use', 'nas_replace')}">${tx('Посмотреть подборку мини-ПК с несколькими SSD', 'See the mini PC shortlist for multiple SSDs')}</a></div></section>`;
  return { body, title: tx(`Как выбрать NAS для дома | ${NAME}`, `How to choose a home NAS | ${NAME}`), desc: tx('Сколько отсеков нужно сетевому хранилищу и как выбрать скорость сети для домашнего NAS.', 'How to decide on the number of drive bays and network speed for a home NAS.'), data: jsonData('dev-data', demoList(c)) + jsonData('i18n', i18n(c)) };
}


function pageMethod(c) {
  const { tx } = c;
  const faq = [
    [tx('Что означает общий балл?', 'What does the overall score mean?'),
      tx('Для каждого теста шкала строится по наименьшему и наибольшему результату в каталоге. Из нескольких таких оценок складываются баллы по категориям и общий балл. Если данных мало, один замер может сильно повлиять на результат. Демо-карточки в расчёт не входят.', 'Each test is scaled using the lowest and highest results in the catalog. Those values contribute to category and overall scores. When data is sparse, a single result can have a large effect. Demo cards are excluded.')],
    [tx('Что происходит, если замера нет?', 'What if a result is missing?'),
      tx('В таблице будет прочерк. При подсчёте балла сайт использует только доступные значения. Поэтому у двух устройств общий балл может опираться на разные тесты.', 'The table shows a dash. Scores use the available values, so two devices can have overall scores based on different tests.')],
    [tx('Как настроить рейтинг под себя?', 'How can I customize the ranking?'),
      tx('В каталоге откройте «Мои приоритеты для рейтинга». Например, можно поднять вес графики для игр или температуры для мини-ПК на столе. Нулевой вес убирает показатель из вашего расчёта.', 'Open My ranking priorities in the catalog. For example, give graphics more weight for gaming or temperature more weight for a desktop setup. A weight of zero omits that criterion from your score.')],
    [tx('Как работают подборки под задачи?', 'How do the use-case shortlists work?'),
      tx('На каждой странице указаны пороги, по которым мы отбираем модели для списка. Если для проверки не хватает характеристики или замера, карточка попадает в раздел «Нужно уточнить». Перед покупкой сверяйтесь с требованиями своих программ.', 'Each guide lists the thresholds used to shortlist devices. If a specification or measurement is missing, the card appears under Needs a closer look. Before buying, check the requirements of the software you plan to run.')],
  ];
  const terms = [
    ['TDP', tx('Ориентир для охлаждения процессора. Для оценки расхода электричества ищите потребление всего мини-ПК, измеренное от розетки.', 'A target for CPU cooling. For electricity use, look for whole-system power measured at the wall.'), 'https://www.intel.com/content/www/us/en/support/articles/000055611/processors.html', 'Intel'],
    [tx('ОЗУ и видеопамять', 'RAM and graphics memory'), tx('ОЗУ нужно системе и приложениям. Видеопамять используют задачи на GPU. Встроенная графика может брать её из общей памяти, поэтому уточняйте доступный объём у конкретной конфигурации.', 'System RAM is used by the operating system and apps. Graphics memory is used for GPU workloads. Integrated GPUs can share system memory, so check how much is available in the specific configuration.')],
    ['OCuLink / USB4', tx('Эти порты стоит искать, если вы планируете подключить внешнюю видеокарту. Для USB4 проверьте поддержку передачи PCIe у конкретного порта. USB-C сам по себе описывает форму разъёма.', 'These ports are worth looking for if you plan to use an external GPU. For USB4, confirm that the specific port supports PCIe tunneling. USB-C describes the shape of the connector.'), 'https://www.usb.org/sites/default/files/D1T1-3%20-%20USB4%20System%20Overview.pdf', 'USB-IF'],
  ];
  const body = `${pagehead(tx('Методика', 'Method'), tx('Как читать тесты мини-ПК', 'How to read mini PC tests'), tx('Мы переносим результаты из обзоров и даём ссылки на источники. Перед сравнением проверьте, что у двух устройств совпадают версия теста и важные настройки.', 'We collect results from reviews and link to the sources. Before comparing two devices, check that the benchmark version and key settings match.'))}
<section class="wrap sec two"><div class="panel"><h3>${tx('С чего начать сравнение', 'Where to start')}</h3><p>${tx('Для работы с документами полезнее тест офисных задач, для игр — замеры частоты кадров. Общий балл помогает быстро просмотреть каталог. Когда выбор сузился, откройте карточки и сравните один и тот же тест.', 'Office benchmarks are useful for document work, while frame-rate tests matter for gaming. The overall score helps you browse quickly. Once you narrow the list, open the device pages and compare the same test.')}</p><a class="text-link" href="${c.href('catalog')}#compare">${tx('Открыть сравнение', 'Open comparison')}</a></div>
<div class="panel"><h3>${tx('Что видно по температуре', 'What temperature can tell you')}</h3><p>${tx('Температура зависит от нагрузки, охлаждения и условий замера. Для сравнения смотрите, как долго шёл тест и в каком режиме работал ПК. Если важно, насколько слышен вентилятор, ищите отдельный замер шума.', 'Temperature depends on workload, cooling, and test conditions. Check how long the test ran and what power mode was used. If fan noise matters, look for a separate noise measurement.')}</p></div></section>
<section class="wrap sec">${head2(tx('Что означают характеристики', 'What the specs mean'))}<div class="mgrid">${terms.map(([name, text, url, source]) => `<div><b>${name}</b><p>${text}</p>${url ? `<a class="text-link" href="${url}">${source}</a>` : ''}</div>`).join('')}</div></section>
<section class="wrap sec faq">${head2(tx('Как считаются баллы', 'How scores are calculated'))}${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}<p class="fine source-note">${tx('Показатель «CPU на ватт TDP» делит относительный балл процессора на его TDP. Для фактической энергоэффективности нужны замеры потребления в том же тесте.', 'The CPU-per-watt-of-TDP figure divides the relative CPU score by the processor’s TDP. Measuring actual efficiency requires power readings from the same test.')}</p></section>
<section class="wrap sec">${head2(tx('Что измеряет каждый тест', 'What each test measures'))}<div class="mgrid">${METRICS.map((m) => `<div><small>${metricUnit(m, c)}</small><b>${tx(m.ru, m.en)}</b><p>${tx(m.hr, m.he)}</p></div>`).join('')}</div></section>`;
  return { body, title: tx(`Как читать тесты и рейтинги мини-ПК | ${NAME}`, `How to read mini PC tests and rankings | ${NAME}`), desc: tx('Что означают результаты бенчмарков, температура и TDP и как MiniPC Bench считает баллы.', 'What benchmarks, temperature, and TDP mean and how MiniPC Bench calculates scores.'), jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] };
}


function pageAbout(c) {
  const { tx, lang } = c;
  const intro = (lang === 'ru' ? site.aboutRu : site.aboutEn) || tx('Когда выбираешь мини-ПК, температура может быть в одном обзоре, подробности об ОЗУ — в другом, а нужный график — в видео. MiniPC Bench собирает эти данные в карточки, чтобы их можно было сопоставить.', 'When you’re shopping for a mini PC, one review might cover temperatures, another might explain the RAM options, and the graph you need might be in a video. MiniPC Bench collects that information on device pages so you can compare it.');
  const body = `${pagehead(tx('О проекте', 'About'), 'MiniPC Bench', esc(intro))}
<section class="wrap sec two"><div class="panel"><h3>${tx('Как устроена база', 'How the catalog works')}</h3><p>${tx('В карточке указана конфигурация из обзора, когда она известна. Если у модели несколько версий, перед покупкой сверьте процессор, память и накопитель. По ссылке на обзор можно проверить результаты и условия теста.', 'Each card shows the reviewed configuration when it is known. If a model comes in several versions, check the processor, memory, and drive before buying. Follow the review link to check the results and test conditions.')}</p><a class="text-link" href="${c.href('catalog')}">${tx('Посмотреть модели', 'Browse the catalog')}</a></div>
<div class="panel"><h3>${tx('Как помочь проекту', 'How to help')}</h3><p>${tx('Если нашли ошибку или знаете обзор с полезным замером, пришлите ссылку и название модели. Так будет проще проверить цифры и дополнить карточку.', 'If you spot an error or know a review with a useful result, send the link and model name. That helps us verify the numbers and update the card.')}</p><a class="text-link" href="${c.href('contact')}">${tx('Предложить исправление или источник', 'Suggest a correction or source')}</a></div></section>`;
  return { body, title: tx(`О проекте | ${NAME}`, `About | ${NAME}`), desc: tx('Как устроен каталог MiniPC Bench и как предложить исправление или новый источник.', 'How the MiniPC Bench catalog works and how to suggest a correction or source.') };
}


function pageContact(c) {
  const { tx } = c;
  const email = site.email ? 'mailto:' + site.email : '';
  const telegram = site.telegram ? safeUrl(site.telegram) || 'https://t.me/' + encodeURIComponent(site.telegram.replace(/^@/, '')) : '';
  const youtube = safeUrl(site.youtube);
  const contactLinks = [
    [tx('Написать по почте', 'Email the project'), email],
    [tx('Написать в Telegram', 'Message on Telegram'), telegram],
    [tx('Канал на YouTube', 'YouTube channel'), youtube],
  ].filter(([, url]) => url);
  const privateContact = Boolean(email || telegram);
  const input = (id, label) => `<div class="fld"><label for="c-${id}">${label}</label><input id="c-${id}" type="text"></div>`;
  const template = privateContact ? `<section class="wrap sec"><div class="panel"><details><summary>${tx('Подготовить письмо о тесте', 'Draft a message about testing')}</summary>
<p class="source-note">${tx('Соберите текст и отправьте его по почте или в Telegram из списка выше.', 'Draft a message and send it by email or Telegram using the links above.')}</p>
<div class="fgrid">${input('name', tx('Имя или компания', 'Name or company'))}${input('model', tx('Модель и конфигурация', 'Model and configuration'))}${input('country', tx('Страна отправки', 'Shipping country'))}</div>
<div class="fld"><label for="c-msg">${tx('Какие тесты интересуют', 'Which tests would be helpful?')}</label><textarea id="c-msg" rows="3"></textarea></div>
<button type="button" class="btn" id="build">${tx('Подготовить текст', 'Build message')}</button>
<div class="fld"><label for="c-out">${tx('Текст для отправки', 'Message to send')}</label><textarea id="c-out" rows="6" readonly></textarea></div>
<button type="button" class="btn" id="copyout">${tx('Скопировать текст', 'Copy message')}</button></details></div></section>` : '';
  const body = `${pagehead(tx('Контакты', 'Contact'), tx('Написать в MiniPC Bench', 'Contact MiniPC Bench'), tx('Предложите модель для каталога, пришлите обзор с замерами или сообщите об ошибке.', 'Suggest a device for the catalog, send a review with test results, or report an error.'))}
<section class="wrap sec two"><div class="panel"><h3>${tx('Исправления и новые источники', 'Corrections and new sources')}</h3><p>${tx('Укажите модель и дайте ссылку на карточку или обзор. Если исправляете число, напишите, какое значение указано в источнике. Сообщения на GitHub видны всем.', 'Include the model name and a link to the card or review. If you’re correcting a number, include the value shown in the source. GitHub issues are public.')}</p><a class="btn pri" href="${REPOSITORY}/issues">${tx('Написать на GitHub', 'Open GitHub issues')}</a></div>
<div class="panel"><h3>${tx('Предложить устройство на тест', 'Suggest a device for testing')}</h3><p>${tx('Напишите точное название модели, её конфигурацию и какие замеры считаете полезными. Если устройство можно предоставить на тест, укажите это в сообщении.', 'Include the exact model, its configuration, and the tests you’d like to see. If you can provide a unit for testing, mention that in your message.')}</p>
${contactLinks.length ? `<div class="row">${contactLinks.map(([label, url]) => `<a class="btn" href="${esc(url)}">${label}</a>`).join('')}</div>` : `<a class="text-link" href="${REPOSITORY}/issues">${tx('Предложить модель на GitHub', 'Suggest a model on GitHub')}</a>`}</div></section>${template}`;
  return { body, title: tx(`Контакты | ${NAME}`, `Contact | ${NAME}`), desc: tx('Как сообщить об ошибке, предложить модель или прислать обзор с замерами.', 'Report an error, suggest a device, or share a review with test results.'), data: privateContact ? jsonData('i18n', i18n(c)) : '' };
}


function fitPanel(d, c) {
  if (d.demo) return '';
  const { tx } = c, L = c.lang === 'ru' ? 0 : 1;
  const rows = crit.uses.filter((u) => d.fit[u.key].st !== 'no')
    .sort((a, b) => (d.fit[a.key].st === 'yes' ? 0 : 1) - (d.fit[b.key].st === 'yes' ? 0 : 1) || d.fit[b.key].rank - d.fit[a.key].rank);
  if (!rows.length) return '';
  const state = { pass: tx('Условие выполнено', 'Meets the condition'), fail: tx('Условие не выполнено', 'Does not meet the condition'), unk: tx('Данных нет', 'No data') };
  const row = (u) => {
    const f = d.fit[u.key];
    const label = d.uses.includes(u.key) ? tx('Выбор редакции', 'Editor’s pick')
      : f.st === 'yes' ? tx('Проходит фильтр', 'Meets the filter') : tx('Нужно уточнить', 'Needs a closer look');
    return `<div class="fitrow"><a href="${u.page ? c.href(u.page) : c.href('use', u.key)}"><b>${tx(u.ru, u.en)}</b></a> ${tag(f.st === 'yes' ? 'ok' : '', label)}<span class="fitwhy">${f.checks.map(({ q, res }) => `<span class="${res}" title="${state[res]}"><span aria-hidden="true">${fitMark[res]}</span><span class="sr">${state[res]}.</span> ${rlabel(q, L)}</span>`).join(' ')}</span></div>`;
  };
  return `<section class="wrap sec"><div class="panel"><details><summary>${tx('Для каких задач модель есть в подборках', 'Which shortlists include this device?')}</summary><p class="source-note">${tx('Галочка означает, что известные данные проходят порог. Знак вопроса показывает, что нужно уточнить характеристику или найти замер.', 'A check means the available data meets the threshold. A question mark means a specification or measurement is missing.')}</p>${rows.map(row).join('')}</details></div></section>`;
}

function pageDevice(c, d) {
  const { tx, lang } = c, L = lang === 'ru' ? 0 : 1;
  const yn2 = (v) => (v === null ? '' : v ? tx('да', 'yes') : tx('нет', 'no'));
  const specs = [[tx('Процессор', 'Processor'), d.cpu], [tx('Видеоядро', 'GPU'), d.gpu], [tx('Память', 'Memory'), d.ram ? `${d.ram} GB ${d.ramType || ''}` : ''], [tx('Апгрейд памяти', 'Memory upgrade'), d.ramSoldered === true ? tx('распаяна, не расширяется', 'soldered, not upgradable') : d.ramSoldered === false ? tx('расширяется', 'upgradable') + (d.ramMax ? tx(', до ', ', up to ') + d.ramMax + ' GB' : '') : ''], [tx('Накопитель', 'Storage'), d.storage], [tx('Слотов SSD', 'SSD slots'), isNum(d.ssd) ? String(d.ssd) : ''], ['OCuLink', yn2(d.oculink)], ['USB4', yn2(d.usb4)], [tx('Отсеков под диски', 'Drive bays'), isNum(d.bays) ? String(d.bays) : ''], [tx('Сеть', 'Network'), d.lan], [tx('Видеопамять (VRAM)', 'Graphics memory (VRAM)'), isNum(d.vram) ? d.vram + ' GB' : ''], ['NPU', isNum(d.npu) ? d.npu + ' TOPS' : ''], [tx('Модели ИИ', 'AI models'), d.maxModel], [tx('TDP процессора', 'CPU TDP'), isNum(d.tdp) ? d.tdp + ' W' : ''], [tx('Температура CPU под нагрузкой', 'CPU temp under stress'), isNum(d.temp) ? d.temp + ' °C' : ''], [tx('Бренд', 'Brand'), d.brand], [tx('Цена', 'Price'), isNum(d.price) ? '$' + fmt(d.price, lang) : ''], [tx('Протестирован', 'Tested'), d.tested], [tx('Наличие', 'Availability'), isNum(d.avail) ? AVL[d.avail][L] : '']].filter((s) => s[1]);
  const mets = METRICS.filter((m) => isNum(d[m.k])).map((m) => { const v = d[m.k], ext = d.src[m.k] === 'ext'; return `<div class="mt"><span class="k wide" title="${esc(tx(m.hr, m.he))}">${esc(tx(m.ru, m.en))}</span><span class="bar"><i style="width:${pct(m.k, v).toFixed(0)}%"></i></span><span class="vv">${fmt(v, lang)} <small>${esc(metricUnit(m, c))}</small>${ext ? '<small class="ext" title="' + tx('Данные из внешнего источника', 'Data from an external source') + '">*</small>' : ''}</span></div>`; }).join('');
  const hasExt = METRICS.some((m) => isNum(d[m.k]) && d.src[m.k] === 'ext');
  const scores = [
    ['overall', tx('Общий', 'Overall')], ['perf', tx('Процессор', 'CPU')],
    ['gfx', tx('Графика', 'Graphics')], ['ai', tx('Локальный ИИ', 'Local AI')],
    ['cool', tx('Температура CPU', 'CPU temperature')], ['eff', tx('CPU на ватт TDP', 'CPU per watt of TDP')],
    ['value', tx('Баллы на доллар', 'Score per dollar')], ['avail', tx('Наличие', 'Availability')],
  ];
  const similar = DEV.filter((x) => x.demo === d.demo && x.slug !== d.slug).sort((a, b) => (fitKeys(b, 1).filter((u) => fitKeys(d, 1).includes(u)).length - fitKeys(a, 1).filter((u) => fitKeys(d, 1).includes(u)).length) || Math.abs(a.s.overall - d.s.overall) - Math.abs(b.s.overall - d.s.overall)).slice(0, 3);
  const art = d.image ? `<img src="${c.img(d.image)}" alt="${esc(d.name)}">` : pcArt(d);
  const desc = summary(d, c) || `${d.cpu}, ${d.ram || '?'} GB ${d.ramType || ''}, TDP ${d.tdp ?? '—'} W.`;
  const body = `<div class="wrap crumbs"><a href="${c.href('home')}">${tx('Главная', 'Home')}</a> / <a href="${c.href('catalog')}">${tx('Каталог', 'Catalog')}</a> / <span>${esc(d.name)}</span></div>
<section class="devhero"><div class="wrap dev-grid"><div class="devart">${art}${d.demo ? `<span class="demo">${tx('Демо', 'Demo')}</span>` : `<span class="score big"><b>${dash(d.s.overall)}</b><small>${tx('общий балл', 'overall score')}</small></span>`}</div><div class="devinfo"><div class="tags">${tagsHtml(d, c)}</div>${d.brand ? `<p class="brandline">${tx('Производитель', 'Brand')}: <a href="${c.href('brand', slugify(d.brand))}">${esc(d.brand)}</a></p>` : ''}<h1>${esc(d.name)}</h1>${summary(d, c) ? `<p class="lead">${esc(summary(d, c))}</p>` : ''}${passport(d, c)}<div class="buyrow"><span class="price lg">${isNum(d.price) ? '$' + fmt(d.price, lang) : ''}</span>${buyBtn(d, c, 'lg')}<a class="btn" href="${c.href('catalog')}?cmp=${d.slug}#compare">${tx('Сравнить', 'Compare')}</a></div>${d.demo ? `<p class="fine">${tx('Пример карточки с условными характеристиками и результатами.', 'A sample card with illustrative specifications and results.')}</p>` : ''}</div></div></section>
<section class="wrap sec dev-cols"><div class="panel"><h3>${tx('Результаты тестов', 'Test results')}</h3><div class="mts">${mets || `<p>${tx('Баллы бенчмарков пока не добавлены.', 'Benchmark scores have yet to be added.')}</p>`}</div>${d.reviews.length ? `<p class="source-note"><a class="text-link" href="#reviews">${tx('Обзоры и источники', 'Reviews and sources')}</a></p>` : ''}${hasExt ? `<p class="fine">* ${tx('данные из внешнего источника', 'data from an external source')}</p>` : ''}</div>${d.demo ? '' : `<div class="panel"><h3>${tx('Баллы сайта от 0 до 100', 'Site scores on a 0–100 scale')}</h3><p>${tx('Баллы показывают место модели внутри каталога. Они зависят от того, какие результаты для неё есть.', 'Scores show how the model compares within the catalog. They depend on which results are available.')}</p><div class="mts">${scores.map(([key, label]) => sbar(label, d.s[key])).join('')}</div><p class="source-note"><a class="text-link" href="${c.href('method')}">${tx('Как считаются баллы', 'How the scores are calculated')}</a></p></div>`}</section>
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
  const yes = ranked.filter((d) => d.fit[u.key].st === 'yes');
  const maybe = ranked.filter((d) => d.fit[u.key].st === 'maybe');
  const others = crit.uses.filter((x) => x.key !== u.key);
  const limits = (rules) => `<ul class="list">${rules.map((q) => `<li>${rlabel(q, L)}</li>`).join('')}</ul>`;
  const body = `${pagehead(tx('Подбор под задачу', 'Guide'), tx(u.h1Ru, u.h1En), tx(u.descRu, u.descEn))}
<section class="wrap sec two"><div class="panel"><h3>${tx('Что проверить перед покупкой', 'What to check before buying')}</h3><p>${tx(u.whyRu, u.whyEn)}</p></div>
<div class="panel"><h3>${tx('Условия отбора в каталоге', 'How this shortlist is filtered')}</h3><p>${tx('Это пороги для подбора. Требования вашей программы или игры могут отличаться.', 'These are shortlist thresholds. Your software or game may have different requirements.')}</p>${limits(u.req)}
${u.pref.length ? `<details><summary>${tx('Что даёт модели преимущество', 'What can move a model up the list')}</summary>${limits(u.pref)}</details>` : ''}</div></section>
<section class="wrap sec">${head2(tx('Модели, которые прошли отбор', 'Models on the shortlist'))}${yes.length ? `<div class="cards">${yes.map((d) => card(d, c)).join('')}</div>` : emptyBox(tx('Пока ни одна карточка не подтверждает все условия. Попробуйте поискать модель в полном каталоге.', 'No cards meet all the conditions yet. Try browsing the full catalog.'))}<p class="more"><a class="text-link" href="${c.href('catalog')}">${tx('Открыть весь каталог', 'Browse the full catalog')}</a></p></section>
${maybe.length ? `<section class="wrap sec">${head2(tx('Нужно уточнить', 'Needs a closer look'), tx('Для этих моделей пока не хватает данных, чтобы проверить все условия. В карточке видно, что нужно уточнить.', 'There isn’t enough data to check every condition for these models. Open a card to see what to look up.'))}<div class="cards">${maybe.map((d) => card(d, c)).join('')}</div></section>` : ''}
<section class="wrap sec">${head2(tx('Другие задачи', 'Other use cases'))}<div class="chips">${others.map((x) => `<a class="chip" href="${x.page ? c.href(x.page) : c.href('use', x.key)}">${tx(x.ru, x.en)}</a>`).join('')}</div></section>`;
  return { body, title: tx(`${u.h1Ru} | ${NAME}`, `${u.h1En} | ${NAME}`), desc: tx(u.descRu, u.descEn), jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: tx(u.h1Ru, u.h1En), inLanguage: lang }] };
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
  const bs = allBrands().filter((b) => brandDevs(b).some((d) => !d.demo)).sort((a, b) => brandDevs(b).length - brandDevs(a).length);
  const body = `${pagehead(tx('Производители', 'Brands'), tx('Кто делает мини-ПК', 'Who makes mini PCs'), tx('Производителей мини-ПК не так много. Здесь собрана информация о каждом: откуда компания, что выпускает и какие её модели есть в базе.', 'There are not that many mini PC makers. Here is what we know about each: where it is from, what it makes and which models are in the database.'))}
<section class="wrap sec"><div class="tiles">${bs.map((b) => `<a class="tile" href="${c.href('brand', b.slug)}">${ic('box')}<b>${esc(b.name)}</b><span>${esc((lang === 'ru' ? b.descRu : b.descEn) || b.country || tx('Модели в каталоге', 'Devices in the catalog'))}</span><em>${brandDevs(b).length}</em></a>`).join('') || emptyBox(tx('Производителей пока нет.', 'No brands yet.'))}</div></section>`;
  return { body, title: tx(`Производители мини-ПК | ${NAME}`, `Mini PC brands | ${NAME}`), desc: tx('Производители мини-ПК: кто они, что выпускают и какие их модели протестированы в базе.', 'Mini PC brands: who they are, what they make and which of their models are tested in the database.'), data: '' };
}
function pageBrand(c, b) {
  const { tx, lang } = c;
  const list = brandDevs(b), text = lang === 'ru' ? b.descRu : b.descEn;
  const meta = [[tx('Страна', 'Country'), b.country], [tx('Основана', 'Founded'), b.founded], [tx('Сайт', 'Website'), safeUrl(b.site) ? `<a href="${esc(b.site)}" target="_blank" rel="noopener nofollow">${esc(b.site.replace(/^https?:\/\//, ''))}</a>` : '']].filter((x) => x[1]);
  const body = `${pagehead(tx('Производитель', 'Brand'), esc(b.name), esc(text || tx('Модели этого бренда, которые есть в каталоге.', 'Browse this brand’s devices in the catalog.')))}
${meta.length ? `<section class="wrap sec"><div class="panel"><div class="spec">${meta.map(([k, v]) => `<div><span>${k}</span><span>${typeof v === 'string' && v.startsWith('<a') ? v : esc(v)}</span></div>`).join('')}</div></div></section>` : ''}
<section class="wrap sec">${head2(tx('Модели в базе', 'Models in the database'))}${list.length ? `<div class="cards">${list.map((d) => card(d, c)).join('')}</div>` : emptyBox(tx('Моделей этого производителя пока нет.', 'No models from this brand yet.'))}</section>`;
  return { body, title: tx(`Модели ${b.name} | ${NAME}`, `${b.name} devices | ${NAME}`), noindex: list.length > 0 && list.every((d) => d.demo), desc: text || tx(`Мини-ПК ${b.name}: тесты и характеристики моделей в базе.`, `${b.name} mini PCs: tests and specs of models in the database.`), jsonld: [{ '@context': 'https://schema.org', '@type': 'Brand', name: b.name, ...(safeUrl(b.site) ? { url: b.site } : {}) }], data: '' };
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
    write(`${dir}/index.html`, layout(c, { ...o, key: 'brand', slug: b.slug }));
    if (!o.noindex) urls.push(dir);
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
