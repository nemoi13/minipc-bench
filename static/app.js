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
  var bySlug = Object.create(null); DEV.forEach(function (d) { bySlug[d.slug] = d; });
  var isN = function (v) { return typeof v === 'number' && isFinite(v); };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  var format = new Intl.NumberFormat(document.documentElement.lang);

  // язык
  $$('[data-setlang]').forEach(function (a) {
    a.addEventListener('click', function (e) { ls.set('mpb-lang', a.getAttribute('data-setlang')); if (a.getAttribute('href') === '#') e.preventDefault(); });
  });
  ls.set('mpb-lang', document.documentElement.lang);

  // копирование
  function copyText(t, btn) {
    var done = function (ok) { if (!btn) return; var o = btn.getAttribute('data-o') || btn.textContent; btn.setAttribute('data-o', o); btn.textContent = ok ? T.copied : T.copyFail; setTimeout(function () { btn.textContent = o; }, 1800); };
    if (!t) return;
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
  var params = new URLSearchParams(location.search);
  var cmpBox = $('#cmpbox');
  var cmpShare = $('#cmp-share');
  var cmpClear = $('#cmp-clear');
  function validSlugs(values) {
    return Array.isArray(values) ? Array.from(new Set(values.filter(function (slug) {
      return typeof slug === 'string' && !!bySlug[slug];
    }))).slice(0, 4) : [];
  }

  var linked = validSlugs(params.getAll('cmp'));
  if (cmpBox) {
    try { cmp = validSlugs(JSON.parse(ls.get('mpb-cmp') || '[]')); } catch (e) {}
    if (linked.length > 1) cmp = linked;
    if (linked.length === 1 && cmp.indexOf(linked[0]) < 0) cmp = cmp.slice(-3).concat(linked);
  }

  function saveCmp() { ls.set('mpb-cmp', JSON.stringify(cmp)); }
  function renderCmp() {
    if (!cmpBox) return;
    $('#cmp-count').textContent = cmp.length;
    cmpShare.hidden = cmp.length < 2;
    cmpClear.hidden = !cmp.length;
    var list = cmp.map(function (slug) { return bySlug[slug]; });
    if (list.length < 2) { cmpBox.innerHTML = '<div class="empty">' + (list.length ? T.cmpOne : T.cmpEmpty) + '</div>'; return; }
    var rows = [['CPU', 'cpu'], ['GPU', 'gpu'], ['RAM, GB', 'ram', 1], ['PassMark', 'pm_total', 1], ['PassMark CPU', 'pm_cpu', 1], ['Cinebench R23', 'cb23', 1], ['Steel Nomad Light', 'sn_light', 1], ['SSD read MB/s', 'cdm_r', 1], ['LLM tok/s', 'llm', 1], ['TDP, W', 'tdp', -1], ['CPU °C', 'temp', -1], ['$', 'price', -1], [T.score, 's', 1]];
    var h = '<table><thead><tr><td></td>' + list.map(function (d) {
      return '<th scope="col"><a href="' + esc(d.url) + '">' + esc(d.name) + '</a>' + (d.demo ? ' <span class="tag">' + T.demo + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead><tbody>';
    var hasDemo = list.some(function (d) { return d.demo; });
    rows.forEach(function (r) {
      var vals = list.map(function (d) { return r[1] === 's' ? d.s.overall : d[r[1]]; });
      if (vals.every(function (value) { return value == null || value === ''; })) return;
      var nums = vals.filter(isN);
      var best = r[2] && nums.length > 1 ? (r[2] > 0 ? Math.max.apply(null, nums) : Math.min.apply(null, nums)) : null;
      h += '<tr><th scope="row">' + r[0] + '</th>' + vals.map(function (v) {
        return '<td class="' + (best !== null && v === best && !hasDemo ? 'best' : '') + '">' + (v == null || v === '' ? '—' : isN(v) ? format.format(v) : esc(v)) + '</td>';
      }).join('') + '</tr>';
    });
    cmpBox.innerHTML = h + '</tbody></table>';
  }
  function syncChecks() { $$('[data-cmp]').forEach(function (c) { c.checked = cmp.indexOf(c.getAttribute('data-cmp')) >= 0; }); }
  function refreshCmp() {
    saveCmp();
    syncChecks();
    renderCmp();
  }
  if (cmpBox) {
    document.addEventListener('change', function (e) {
      if (!e.target.matches('[data-cmp]')) return;
      var checkbox = e.target;
      var slug = checkbox.getAttribute('data-cmp');
      if (checkbox.checked && cmp.length >= 4) {
        checkbox.checked = false;
        alert(T.cmpMax);
        return;
      }
      cmp = checkbox.checked ? validSlugs(cmp.concat(slug)) : cmp.filter(function (value) { return value !== slug; });
      refreshCmp();
      updateCatalogUrl();
    });
    cmpClear.addEventListener('click', function () {
      cmp = [];
      refreshCmp();
      updateCatalogUrl();
      $('.compare-jump').focus({ preventScroll: true });
    });
    cmpShare.addEventListener('click', function () {
      var link = new URL(location.pathname, location.origin);
      cmp.forEach(function (slug) { link.searchParams.append('cmp', slug); });
      link.hash = 'compare';
      copyText(link.href, cmpShare);
    });
    refreshCmp();
  }

  /* ---------- каталог ---------- */
  var cards = $('#cards');
  var page = document.body.getAttribute('data-page');
  var cardEl = Object.create(null); $$('.card', cards || document).forEach(function (c) { cardEl[c.getAttribute('data-slug')] = c; });
  function showCards(vis, order) {
    var none = $('#none'); var n = 0;
    (order || DEV).forEach(function (d) { var el = cardEl[d.slug || d]; if (!el) return; var show = vis[d.slug || d]; el.hidden = !show; if (show) { n++; cards.appendChild(el); } });
    if (none) none.hidden = n > 0;
    return n;
  }

  var updateCatalogUrl;
  if (page === 'catalog') {
    var st = { f: {}, flag: { unk: true }, s: {}, q: '' };
    var W = {}; $$('[data-w]').forEach(function (r) { W[r.getAttribute('data-w')] = +r.value; });
    var sliders = $$('[data-s]');
    var winnersBox = $('#winners');
    var filters = $('#fp');
    if (matchMedia('(max-width: 700px)').matches && !params.has('q') && !params.has('flag') && !params.has('use')) filters.open = false;
    var catKeys = Object.keys(T.cats || {});
    var infoOf = function (k, d) { return d.s[k] + '/100'; };
    function weighted(d) {
      var tot = 0, sum = 0; Object.keys(W).forEach(function (k) { if (d.s[k] == null) return; tot += W[k]; sum += W[k] * d.s[k]; });
      return tot ? Math.round(sum / tot) : -1;
    }
    function pass(d) {
      if (d.demo && !st.flag.demo) return false;
      var text = [d.name, d.brand, d.cpu, d.gpu, d.vendor].join(' ').toLowerCase();
      if (st.q && !st.q.toLowerCase().split(/\s+/).every(function (term) { return text.indexOf(term) >= 0; })) return false;
      for (var k in st.f) {
        var set = st.f[k]; if (!set.length) continue;
        var ok = set.some(function (v) {
          if (k === 'use') return d.uses.indexOf(v) >= 0;
          if (k === 'ram') return String(d.ram) === v;
          return String(d[k]) === v;
        });
        if (!ok) return false;
      }
      for (var f in st.flag) { if (!st.flag[f] || f === 'unk' || f === 'demo') continue; if (f === 'stock') { if (!(d.avail > 0)) return false; } else if (!d[f]) return false; }
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
      $$('[data-score]').forEach(function (b) {
        var d = bySlug[b.closest('.card').getAttribute('data-slug')];
        var v = sort === 'my' ? d._my : d.s.overall;
        b.textContent = v == null || v < 0 ? '—' : v;
        b.nextElementSibling.textContent = sort === 'my' ? T.my : T.score;
      });
      $('#count').textContent = T.found + list.length + T.of + DEV.filter(function (d) { return !d.demo || st.flag.demo; }).length;
      if (winnersBox) {
        var h = '';
        catKeys.forEach(function (k) {
          var a = list.filter(function (d) { return !d.demo && d.s[k] != null; }).sort(function (x, y) { return y.s[k] - x.s[k]; }); if (a.length < 2) return;
          var run = a.slice(1, 3).map(function (d, i) { return (i + 2) + '. ' + esc(d.name); }).join(' · ');
          h += '<a class="rk" href="' + esc(a[0].url) + '"><span class="h">' + T.icons[k] + T.cats[k] + '</span><span class="n">' + esc(a[0].name) + '</span><span class="v">' + infoOf(k, a[0]) + '</span>' + (run ? '<span class="ru">' + run + '</span>' : '') + '</a>';
        });
        winnersBox.innerHTML = h ? '<div class="ranks">' + h + '</div>' : '';
        $('#leaderboard').hidden = !h;
      }
      updateCatalogUrl();
    }
    updateCatalogUrl = function () {
      var p = new URLSearchParams();
      (st.f.use || []).forEach(function (use) { p.append('use', use); });
      Object.keys(st.flag).filter(function (flag) { return flag !== 'unk' && st.flag[flag]; }).forEach(function (flag) { p.append('flag', flag); });
      if (st.q) p.set('q', st.q);
      cmp.forEach(function (slug) { p.append('cmp', slug); });
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
    };
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
    $$('[data-w]').forEach(function (r) { r.addEventListener('input', function () { W[r.getAttribute('data-w')] = +r.value; $('#wo-' + r.getAttribute('data-w')).textContent = r.value; $('#sort').value = 'my'; apply(); }); });
    $('#sort').addEventListener('change', apply);
    $('#q').addEventListener('input', function () { st.q = this.value.trim(); apply(); });
    function reset() {
      st.f = {}; st.flag = { unk: true }; st.q = ''; $('#q').value = '';
      $$('.chip[data-f]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      $$('[data-flag]').forEach(function (c) { c.checked = c.getAttribute('data-flag') === 'unk'; });
      sliders.forEach(function (r) { var k = r.getAttribute('data-s'), o = st.s[k]; r.value = o.kind === 'min' ? o.lo : o.hi; o.v = +r.value; $('#o-' + k).textContent = o.kind === 'min' ? T.any : T.noLimit; });
      $$('[data-w]').forEach(function (r) {
        var key = r.getAttribute('data-w');
        r.value = r.defaultValue;
        W[key] = +r.value;
        $('#wo-' + key).textContent = r.value;
      });
      $('#sort').value = 'overall';
    }
    function setChip(k, v) {
      var b = $$('.chip[data-f="' + k + '"]').find(function (chip) { return chip.getAttribute('data-v') === v; });
      if (!b) return;
      st.f[k] = st.f[k] || [];
      if (st.f[k].indexOf(v) < 0) st.f[k].push(v);
      b.setAttribute('aria-pressed', 'true');
    }
    var presets = {
      office: function () { setChip('use', 'office'); },
      ai: function () { setChip('use', 'ai'); $('#sort').value = 'ai'; },
      game: function () { setChip('use', 'gaming'); $('#sort').value = 'gfx'; },
      cool: function () { setChip('hc', 'cool'); $('#sort').value = 'eff'; }
    };
    $$('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-preset'); reset(); if (presets[p]) presets[p](); apply(); if (p !== 'reset') { var c = $('#cards'); if (c) c.scrollIntoView({ block: 'start' }); } });
    });
    (params.getAll('use') || []).forEach(function (u) { setChip('use', u); });
    var flags = params.getAll('flag');
    if (linked.some(function (slug) { return bySlug[slug].demo; })) flags.push('demo');
    $$('[data-flag]').forEach(function (cb) {
      var key = cb.getAttribute('data-flag');
      if (flags.indexOf(key) >= 0) { cb.checked = true; st.flag[key] = true; }
    });
    st.q = params.get('q') || '';
    $('#q').value = st.q;
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
