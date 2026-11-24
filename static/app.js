(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var J = function (id) { var e = document.getElementById(id); try { return e ? JSON.parse(e.textContent) : null; } catch (x) { return null; } };
  var DEV = J('dev-data') || [], T = J('i18n') || {};
  var bySlug = {}; DEV.forEach(function (d) { bySlug[d.slug] = d; });
  var isN = function (v) { return typeof v === 'number' && isFinite(v); };

  // язык
  $$('[data-setlang]').forEach(function (a) {
    a.addEventListener('click', function (e) { ls.set('mpb-lang', a.getAttribute('data-setlang')); if (a.getAttribute('href') === '#') e.preventDefault(); });
  });
  ls.set('mpb-lang', document.documentElement.lang);

  // копирование
  function copyText(t, btn) {
    var done = function (ok) { if (!btn) return; var o = btn.getAttribute('data-o') || btn.textContent; btn.setAttribute('data-o', o); btn.textContent = ok ? T.copied : T.copyFail; setTimeout(function () { btn.textContent = o; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); else done(false);
  }
  $$('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyText(b.getAttribute('data-copy'), b); }); });

  // контакты
  var build = $('#build');
  if (build) {
    build.addEventListener('click', function () {
      var v = function (id) { return ($('#c-' + id).value || '').trim() || '—'; };
      var m = ($('#c-msg').value || '').trim();
      $('#c-out').value = T.msg.replace('{name}', v('name')).replace('{model}', v('model')).replace('{country}', v('country')).replace('{msg}', m);
    });
    $('#copyout').addEventListener('click', function () { copyText($('#c-out').value, $('#copyout')); });
  }

  /* ---------- сравнение (localStorage) ---------- */
  var cmp = [];
  try { cmp = JSON.parse(ls.get('mpb-cmp') || '[]').filter(function (s) { return true; }); } catch (e) { cmp = []; }
  var params = new URLSearchParams(location.search);
  if (params.get('cmp') && cmp.indexOf(params.get('cmp')) < 0) cmp.push(params.get('cmp'));
  cmp = cmp.slice(-4);
  function saveCmp() { ls.set('mpb-cmp', JSON.stringify(cmp)); }
  function renderCmp() {
    var box = $('#cmpbox'); if (!box) return;
    var list = cmp.map(function (s) { return bySlug[s]; }).filter(Boolean);
    if (list.length < 2) { box.innerHTML = '<div class="empty">' + (list.length ? T.cmpOne : T.cmpEmpty) + '</div>'; return; }
    var rows = [['CPU', 'cpu', 0], ['RAM, GB', 'ram', 1], ['PassMark', 'pm_total', 1], ['PassMark CPU', 'pm_cpu', 1], ['Cinebench R23', 'cb23', 1], ['Steel Nomad Light', 'sn_light', 1], ['SSD read MB/s', 'cdm_r', 1], ['LLM tok/s', 'llm', 1], ['TDP, W', 'tdp', -1], ['CPU °C', 'temp', -1], ['$', 'price', -1], ['score', 's', 1]];
    var h = '<table><thead><tr><th></th>' + list.map(function (d) { return '<th><a href="' + d.url + '">' + d.name + '</a></th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var vals = list.map(function (d) { return r[1] === 's' ? d.s.overall : d[r[1]]; });
      var nums = vals.filter(isN), best = nums.length && r[2] ? (r[2] > 0 ? Math.max.apply(0, nums) : Math.min.apply(0, nums)) : null;
      h += '<tr><td>' + r[0] + '</td>' + vals.map(function (v) { return '<td class="' + (best !== null && v === best && nums.length > 1 ? 'best' : '') + '">' + (v == null || v === '' ? '—' : v) + '</td>'; }).join('') + '</tr>';
    });
    box.innerHTML = h + '</tbody></table>';
  }
  function syncChecks() { $$('[data-cmp]').forEach(function (c) { c.checked = cmp.indexOf(c.getAttribute('data-cmp')) >= 0; }); }
  document.addEventListener('change', function (e) {
    var c = e.target.closest && e.target.closest('[data-cmp]'); if (!c) return;
    var s = c.getAttribute('data-cmp'), i = cmp.indexOf(s);
    if (c.checked && i < 0) { if (cmp.length >= 4) { c.checked = false; alert(T.cmpMax); return; } cmp.push(s); }
    if (!c.checked && i >= 0) cmp.splice(i, 1);
    saveCmp(); renderCmp();
  });
  syncChecks(); renderCmp();

  /* ---------- каталог ---------- */
  var cards = $('#cards');
  var page = document.body.getAttribute('data-page');
  var cardEl = {}; $$('.card', cards || document).forEach(function (c) { cardEl[c.getAttribute('data-slug')] = c; });
  function showCards(vis, order) {
    var none = $('#none'); var n = 0;
    (order || DEV).forEach(function (d) { var el = cardEl[d.slug || d]; if (!el) return; var show = vis[d.slug || d]; el.hidden = !show; if (show) { n++; cards.appendChild(el); } });
    if (none) none.hidden = n > 0;
    return n;
  }

  if (page === 'catalog') {
    var st = { f: {}, flag: { unk: true }, s: {}, q: '' };
    var W = {}; $$('[data-w]').forEach(function (r) { W[r.getAttribute('data-w')] = +r.value; });
    var sliders = $$('[data-s]');
    var winnersBox = $('#winners');
    var catKeys = Object.keys(T.cats || {});
    var infoOf = function (k, d) { return d.s[k] + '/100'; };
    function weighted(d) {
      var tot = 0, sum = 0; Object.keys(W).forEach(function (k) { if (d.s[k] == null) return; tot += W[k]; sum += W[k] * d.s[k]; });
      return tot ? Math.round(sum / tot) : -1;
    }
    function pass(d) {
      var q = st.q.toLowerCase();
      if (q && (d.name + ' ' + (d.cpu || '') + ' ' + (d.vendor || '')).toLowerCase().indexOf(q) < 0) return false;
      for (var k in st.f) {
        var set = st.f[k]; if (!set.length) continue;
        var ok = set.some(function (v) {
          if (k === 'use') return d.uses.indexOf(v) >= 0;
          if (k === 'ram') return String(d.ram) === v;
          return String(d[k]) === v;
        });
        if (!ok) return false;
      }
      for (var f in st.flag) { if (!st.flag[f] || f === 'unk') continue; if (f === 'stock') { if (!(d.avail > 0)) return false; } else if (!d[f]) return false; }
      for (var s in st.s) {
        var o = st.s[s], v = d[s];
        if (o.kind === 'min' && o.v > o.lo) { if (!isN(v)) { if (!st.flag.unk) return false; } else if (v < o.v) return false; }
        if (o.kind === 'max' && o.v < o.hi) { if (!isN(v)) { if (!st.flag.unk) return false; } else if (v > o.v) return false; }
      }
      return true;
    }
    function apply() {
      var sort = $('#sort').value;
      DEV.forEach(function (d) { d._my = weighted(d); });
      var list = DEV.filter(pass);
      var key = function (d) { return sort === 'my' ? d._my : sort === 'price' ? -(d.price || 1e9) : sort === 'new' ? Date.parse(d.tested) || 0 : (d.s[sort] == null ? -1 : d.s[sort]); };
      var ordered = list.slice().sort(function (a, b) { return key(b) - key(a); });
      var vis = {}; list.forEach(function (d) { vis[d.slug] = 1; });
      var all = ordered.concat(DEV.filter(function (d) { return !vis[d.slug]; }));
      showCards(vis, all);
      $$('[data-score]').forEach(function (b) { var d = bySlug[b.closest('.card').getAttribute('data-slug')]; var v = sort === 'my' ? d._my : d.s.overall; b.textContent = v == null || v < 0 ? '—' : v; });
      $('#count').textContent = T.found + list.length + T.of + DEV.length;
      if (winnersBox) {
        var h = '';
        catKeys.forEach(function (k) {
          var a = list.filter(function (d) { return d.s[k] != null; }).sort(function (x, y) { return y.s[k] - x.s[k]; }); if (!a.length) return;
          var run = a.slice(1, 3).map(function (d, i) { return (i + 2) + '. ' + d.name; }).join(' · ');
          h += '<a class="rk" href="' + a[0].url + '"><span class="h">' + T.icons[({ overall: 'overall', ai: 'ai', gfx: 'gfx', quiet: 'quiet', eff: 'eff', value: 'value', avail: 'avail' })[k]] + T.cats[k] + '</span><span class="n">' + a[0].name + '</span><span class="v">' + infoOf(k, a[0]) + '</span>' + (run ? '<span class="ru">' + run + '</span>' : '') + '</a>';
        });
        winnersBox.innerHTML = h ? '<div class="ranks">' + h + '</div>' : '';
      }
      var p = new URLSearchParams(); (st.f.use || []).forEach(function (u) { p.append('use', u); });
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
    }
    $$('.chip[data-f]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-f'), v = b.getAttribute('data-v'); st.f[k] = st.f[k] || [];
        var i = st.f[k].indexOf(v); if (i >= 0) st.f[k].splice(i, 1); else st.f[k].push(v);
        b.setAttribute('aria-pressed', i < 0); apply();
      });
    });
    $$('[data-flag]').forEach(function (c) { c.addEventListener('change', function () { st.flag[c.getAttribute('data-flag')] = c.checked; apply(); }); });
    sliders.forEach(function (r) {
      var k = r.getAttribute('data-s'), kind = r.getAttribute('data-kind');
      st.s[k] = { kind: kind, v: +r.value, lo: +r.min, hi: +r.max };
      r.addEventListener('input', function () {
        st.s[k].v = +r.value; var off = kind === 'min' ? st.s[k].v <= st.s[k].lo : st.s[k].v >= st.s[k].hi;
        $('#o-' + k).textContent = off ? (kind === 'min' ? T.any : T.noLimit) : (kind === 'min' ? '≥ ' : '≤ ') + r.value; apply();
      });
    });
    $$('[data-w]').forEach(function (r) { r.addEventListener('input', function () { W[r.getAttribute('data-w')] = +r.value; $('#wo-' + r.getAttribute('data-w')).textContent = r.value; if ($('#sort').value === 'my') apply(); else apply(); }); });
    $('#sort').addEventListener('change', apply);
    $('#q').addEventListener('input', function () { st.q = this.value.trim(); apply(); });
    function reset() {
      st.f = {}; st.flag = { unk: true }; st.q = ''; $('#q').value = '';
      $$('.chip[data-f]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      $$('[data-flag]').forEach(function (c) { c.checked = c.getAttribute('data-flag') === 'unk'; });
      sliders.forEach(function (r) { var k = r.getAttribute('data-s'), o = st.s[k]; r.value = o.kind === 'min' ? o.lo : o.hi; o.v = +r.value; $('#o-' + k).textContent = o.kind === 'min' ? T.any : T.noLimit; });
      $('#sort').value = 'my';
    }
    function setChip(k, v) { st.f[k] = [v]; var b = $('.chip[data-f="' + k + '"][data-v="' + v + '"]'); if (b) b.setAttribute('aria-pressed', 'true'); }
    var presets = {
      office: function () { setChip('use', 'office'); },
      ai: function () { setChip('use', 'ai'); $('#sort').value = 'ai'; },
      game: function () { $('#sort').value = 'gfx'; },
      budget: function () { $('#sort').value = 'value'; },
      cool: function () { setChip('hc', 'cool'); $('#sort').value = 'eff'; }
    };
    $$('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-preset'); reset(); if (presets[p]) presets[p](); apply(); if (p !== 'reset') { var c = $('#cards'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    });
    (params.getAll('use') || []).forEach(function (u) { setChip('use', u); });
    var fl = params.get('flag'); if (fl) { var cb = $('[data-flag="' + fl + '"]'); if (cb) { cb.checked = true; st.flag[fl] = true; } }
    apply();
  }

  /* ---------- ИИ ---------- */
  if (page === 'ai') {
    var need = 0;
    function applyAi() {
      var vis = {}, n = 0; DEV.forEach(function (d) { var el = cardEl[d.slug]; if (!el) return; var ok = !need || (d.vram || 0) >= need; el.hidden = !ok; vis[d.slug] = ok; if (ok) n++; });
      var none = $('#none'); if (none) none.hidden = n > 0 || !Object.keys(cardEl).length;
      var c = $('#aicount'); if (c) c.textContent = T.found + n + T.of + Object.keys(cardEl).length;
    }
    $$('[data-aim]').forEach(function (b) {
      b.addEventListener('click', function () { need = +b.getAttribute('data-aim'); $$('[data-aim]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); applyAi(); });
      if (b.getAttribute('aria-pressed') === 'true') need = +b.getAttribute('data-aim');
    });
    applyAi();
  }

  /* ---------- NAS ---------- */
  if (page === 'nas') {
    var nf = { bays: 0, lan: 0 };
    var ns = $('#nsort');
    var nasList = DEV.filter(function (d) { return cardEl[d.slug]; });
    function applyNas() {
      var key = ns.value, vis = {};
      var list = nasList.filter(function (d) { return (d.bays || 0) >= nf.bays && (d.lanG || 0) >= nf.lan; });
      list.forEach(function (d) { vis[d.slug] = 1; });
      var val = function (d) { return key === 'bays' ? -(d.bays || 0) : key === 'lan' ? -(d.lanG || 0) : isN(d[key]) ? d[key] : 1e9; };
      var ordered = list.sort(function (a, b) { return val(a) - val(b); }).concat(nasList.filter(function (d) { return !vis[d.slug]; }));
      var n = showCards(vis, ordered);
      var c = $('#nascount'); if (c) c.textContent = T.found + n + T.of + nasList.length;
    }
    $$('[data-nas]').forEach(function (b) {
      b.addEventListener('click', function () { var k = b.getAttribute('data-nas'); nf[k] = +b.getAttribute('data-v'); $$('[data-nas="' + k + '"]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); applyNas(); });
    });
    ns.addEventListener('change', applyNas); applyNas();
  }
})();
