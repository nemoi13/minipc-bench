(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var slugify = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
  var cfg = { owner: '', repo: '', branch: 'main', token: '' };
  try { Object.assign(cfg, JSON.parse(lsGet('mpb-gh') || '{}')); } catch (e) {}
  var S = { crit: null, dev: [], brands: [], sha: {}, imgs: {}, dirty: false, cur: null, curIdx: -1, curBrand: -1, src: 'файл сайта' };

  function status(msg, kind) { var e = $('#status'); e.hidden = !msg; e.textContent = msg || ''; e.className = 'banner ' + (kind || ''); }
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b) { return decodeURIComponent(escape(atob(b.replace(/\s/g, '')))); }
  function api(path, method, body) {
    var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path + (method === 'PUT' ? '' : '?ref=' + encodeURIComponent(cfg.branch));
    return fetch(url, { method: method || 'GET', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.message || r.status); e.status = r.status; throw e; } return j; });
    });
  }
  var hasCfg = function () { return cfg.owner && cfg.repo && cfg.token; };

  /* ---------- загрузка ---------- */
  var LOCAL = window.MPB || { crit: { uses: [], metrics: [] }, dev: [], brands: [] };
  function loadFile(p) { return Promise.resolve(p === 'devices.json' ? LOCAL.dev : LOCAL.brands); }
  function load() {
    var crit = hasCfg() ? api('data/criteria.json', 'GET').then(function (x) { return JSON.parse(b64dec(x.content)); }) : Promise.resolve(LOCAL.crit);
    var pull = function (name) {
      if (!hasCfg()) return loadFile(name).then(function (v) { return { v: v, sha: null }; });
      return api('data/' + name, 'GET').then(function (j) { return { v: JSON.parse(b64dec(j.content)), sha: j.sha }; });
    };
    return Promise.all([crit, pull('devices.json'), pull('brands.json')]).then(function (a) {
      S.crit = a[0]; S.dev = a[1].v; S.brands = a[2].v; S.sha = { 'devices.json': a[1].sha, 'brands.json': a[2].sha };
      S.src = hasCfg() ? 'GitHub (актуальная версия)' : 'файл сайта (может отставать)';
    });
  }

  /* ---------- публикация ---------- */
  function putFile(path, contentB64, msg) {
    return api(path, 'GET').then(function (j) { return j.sha; }, function (e) { if (e.status === 404) return null; throw e; }).then(function (sha) {
      var body = { message: msg, content: contentB64, branch: cfg.branch }; if (sha) body.sha = sha; return api(path, 'PUT', body);
    });
  }
  function publish() {
    if (!hasCfg()) { download('devices.json', JSON.stringify(S.dev, null, 1)); download('brands.json', JSON.stringify(S.brands, null, 1)); status('Токен не задан, поэтому файлы скачаны. Загрузите их в папку data/ репозитория на GitHub (Add file → Upload files).', 'err'); return; }
    status('Публикую…');
    var jobs = [putFile('data/devices.json', b64enc(JSON.stringify(S.dev, null, 1)), 'Обновление базы устройств'), putFile('data/brands.json', b64enc(JSON.stringify(S.brands, null, 1)), 'Обновление производителей')];
    Object.keys(S.imgs).forEach(function (slug) { jobs.push(putFile('images/' + slug + '.jpg', S.imgs[slug].split(',')[1], 'Фото: ' + slug)); });
    Promise.all(jobs).then(function () { S.imgs = {}; S.dirty = false; status('Готово. Сайт обновится примерно через минуту (вкладка Actions на GitHub покажет сборку).', 'ok'); }).catch(function (e) { status('Не получилось: ' + e.message + '. Проверьте токен и права (Contents: Read and write).', 'err'); });
  }
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  /* ---------- заполненность ---------- */
  function missing(d) {
    var core = S.crit.metrics.filter(function (m) { return m.core && !(d.bench && d.bench[m.k] != null); }).map(function (m) { return m.ru.split(',')[0]; });
    ['tdp', 'price', 'buyUrl'].forEach(function (k) { if (d[k] == null || d[k] === '') core.push({ tdp: 'TDP', price: 'цена', buyUrl: 'ссылка на покупку' }[k]); });
    return core;
  }
  function fill(d) { var total = S.crit.metrics.filter(function (m) { return m.core; }).length + 3, m = missing(d).length; return Math.round(100 * (total - m) / total); }

  /* ---------- виды ---------- */
  function view() {
    var t = (location.hash || '#devices').slice(1); if (['devices', 'brands', 'connect'].indexOf(t) < 0) t = 'devices';
    $$('#tabs a').forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('data-t') === t ? 'page' : 'false'); if (a.getAttribute('data-t') !== t) a.removeAttribute('aria-current'); });
    var v = $('#view');
    if (t === 'connect') return viewConnect(v);
    if (!S.crit) { v.innerHTML = '<p>Загружаю…</p>'; return; }
    if (t === 'brands') return viewBrands(v);
    if (S.cur) return viewForm(v);
    viewList(v);
  }
  function viewConnect(v) {
    v.innerHTML = '<h2>Подключение к GitHub</h2><div class="panel"><p>Админка сама записывает изменения в ваш репозиторий. Данные хранятся только в этом браузере.</p><ol class="list"><li>GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate.</li><li>Repository access: Only select repositories → ваш репозиторий. Permissions → <b>Contents: Read and write</b>.</li><li>Скопируйте токен сюда.</li></ol><div class="grid"><div class="fld"><label>Ник на GitHub</label><input id="g-owner" value="' + esc(cfg.owner) + '"></div><div class="fld"><label>Репозиторий</label><input id="g-repo" value="' + esc(cfg.repo) + '"></div><div class="fld"><label>Ветка</label><input id="g-branch" value="' + esc(cfg.branch) + '"></div><div class="fld"><label>Токен</label><input id="g-token" type="password" value="' + esc(cfg.token) + '"></div></div><div class="row"><button class="btn pri" id="g-save" type="button">Сохранить и загрузить данные</button><button class="btn" id="g-clear" type="button">Забыть токен</button></div></div>';
    $('#g-save').onclick = function () { cfg = { owner: $('#g-owner').value.trim(), repo: $('#g-repo').value.trim(), branch: $('#g-branch').value.trim() || 'main', token: $('#g-token').value.trim() }; lsSet('mpb-gh', JSON.stringify(cfg)); status('Загружаю…'); load().then(function () { status('Подключено. Источник данных: ' + S.src, 'ok'); location.hash = '#devices'; view(); }).catch(function (e) { status('Ошибка: ' + e.message, 'err'); }); };
    $('#g-clear').onclick = function () { cfg.token = ''; lsSet('mpb-gh', JSON.stringify(cfg)); $('#g-token').value = ''; status('Токен удалён из браузера.', 'ok'); };
  }
  function viewList(v) {
    v.innerHTML = '<div class="row"><h2 style="flex:1">Устройства (' + S.dev.length + ')</h2><button class="btn pri" id="add" type="button">Добавить устройство</button></div><p class="miss">Источник данных: ' + esc(S.src) + '</p><div class="tw"><table><thead><tr><th>Название</th><th>Производитель</th><th>Заполнено</th><th>Не хватает</th><th></th></tr></thead><tbody>' + S.dev.map(function (d, i) {
      var m = missing(d); return '<tr><td><b>' + esc(d.name) + '</b>' + (d.demo ? ' <span class="tag hot">demo</span>' : '') + (d.status === 'draft' ? ' <span class="tag">черновик</span>' : '') + '</td><td>' + esc(d.brand) + '</td><td><span class="fillb"><i style="width:' + fill(d) + '%"></i></span>' + fill(d) + '%</td><td class="miss">' + esc(m.slice(0, 4).join(', ')) + (m.length > 4 ? ' и ещё ' + (m.length - 4) : '') + '</td><td><button class="btn sm" data-edit="' + i + '" type="button">Править</button> <button class="btn sm" data-del="' + i + '" type="button">Удалить</button></td></tr>';
    }).join('') + '</tbody></table></div>';
    $('#add').onclick = function () { S.cur = { status: 'published', ff: 'mini', uses: [], bench: {}, benchSrc: {}, reviews: [] }; S.curIdx = -1; view(); };
    $$('[data-edit]', v).forEach(function (b) { b.onclick = function () { S.curIdx = +b.getAttribute('data-edit'); S.cur = JSON.parse(JSON.stringify(S.dev[S.curIdx])); S.cur.bench = S.cur.bench || {}; S.cur.benchSrc = S.cur.benchSrc || {}; S.cur.reviews = S.cur.reviews || []; S.cur.uses = S.cur.uses || []; view(); }; });
    $$('[data-del]', v).forEach(function (b) { b.onclick = function () { var i = +b.getAttribute('data-del'); if (b.getAttribute('data-sure')) { S.dev.splice(i, 1); S.dirty = true; view(); } else { b.setAttribute('data-sure', '1'); b.textContent = 'Точно удалить?'; } }; });
  }
  var NUM = [['ram', 'ОЗУ, ГБ'], ['ramMax', 'ОЗУ максимум, ГБ'], ['ssd', 'Слотов SSD'], ['bays', 'Отсеков (NAS)'], ['tdp', 'TDP процессора, Вт'], ['temp', 'Темп. CPU под нагрузкой, °C'], ['vram', 'Видеопамять для ИИ, ГБ'], ['npu', 'NPU, TOPS'], ['lanG', 'Сеть, Гбит/с'], ['lanPorts', 'Сетевых портов'], ['price', 'Цена, $']];
  var TXT = [['cpu', 'Процессор'], ['gpu', 'Видеоядро'], ['vendor', 'Платформа (Intel/AMD…)'], ['ramType', 'Тип ОЗУ (DDR5, LPDDR5X…)'], ['storage', 'Накопитель'], ['lan', 'Сеть (текстом)'], ['maxModel', 'Макс. модель ИИ'], ['tested', 'Дата теста (ГГГГ-ММ-ДД)'], ['buyUrl', 'Ссылка на покупку']];
  var TRI = [['ramSoldered', 'ОЗУ распаяна?'], ['oculink', 'OCuLink'], ['usb4', 'USB4 / Thunderbolt']];
  function triSel(k, v) { return '<div class="fld"><label>' + TRI.filter(function (x) { return x[0] === k; })[0][1] + '</label><select data-tri="' + k + '"><option value="">не знаю</option><option value="true"' + (v === true ? ' selected' : '') + '>да</option><option value="false"' + (v === false ? ' selected' : '') + '>нет</option></select></div>'; }
  function viewForm(v) {
    var d = S.cur, h = '<h2>' + (S.curIdx < 0 ? 'Новое устройство' : esc(d.name)) + '</h2>';
    h += '<fieldset><legend>Основное</legend><div class="grid"><div class="fld"><label>Название</label><input data-k="name" value="' + esc(d.name) + '"></div><div class="fld"><label>Производитель</label><input data-k="brand" list="bl" value="' + esc(d.brand) + '"><datalist id="bl">' + S.brands.map(function (b) { return '<option value="' + esc(b.name) + '">'; }).join('') + '</datalist></div><div class="fld"><label>Адрес страницы (латиницей)</label><input data-k="slug" value="' + esc(d.slug) + '" placeholder="создастся из названия"></div><div class="fld"><label>Тип</label><select data-k="ff"><option value="mini"' + (d.ff === 'mini' ? ' selected' : '') + '>Мини-ПК</option><option value="nas"' + (d.ff === 'nas' ? ' selected' : '') + '>NAS</option></select></div><div class="fld"><label>Наличие</label><select data-k="avail">' + [['', 'не знаю'], ['instock', 'в наличии'], ['limited', 'ограниченно'], ['out', 'нет']].map(function (o) { return '<option value="' + o[0] + '"' + ((d.avail || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div><div class="fld"><label>Статус</label><select data-k="status"><option value="published"' + (d.status !== 'draft' ? ' selected' : '') + '>опубликовано</option><option value="draft"' + (d.status === 'draft' ? ' selected' : '') + '>черновик</option></select></div></div><label class="cmpl"><input type="checkbox" data-k="demo"' + (d.demo ? ' checked' : '') + '> демонстрационные данные</label></fieldset>';
    h += '<fieldset><legend>Характеристики (паспорт)</legend><div class="grid">' + TXT.map(function (x) { return '<div class="fld"><label>' + x[1] + '</label><input data-k="' + x[0] + '" value="' + esc(d[x[0]]) + '"></div>'; }).join('') + NUM.map(function (x) { return '<div class="fld"><label>' + x[1] + '</label><input data-n="' + x[0] + '" inputmode="decimal" value="' + esc(d[x[0]]) + '"></div>'; }).join('') + TRI.map(function (x) { return triSel(x[0], d[x[0]]); }).join('') + '</div></fieldset>';
    h += '<fieldset><legend>Подходит для (ручная отметка поверх правил сайта)</legend><div class="uses">' + S.crit.uses.map(function (u) { return '<label class="cmpl"><input type="checkbox" data-use="' + u.key + '"' + (d.uses.indexOf(u.key) >= 0 ? ' checked' : '') + '> ' + esc(u.ru) + '</label>'; }).join('') + '</div></fieldset>';
    h += '<fieldset><legend>Бенчмарки (пустое поле просто пропускается)</legend><div class="fld"><label>Быстрый ввод: строки вида pm_cpu=10800 или pm_total 2595</label><textarea id="quick" rows="3" placeholder="pm_total=2595.7&#10;sn_light=550&#10;llm=24"></textarea></div><button type="button" class="btn sm" id="quickgo">Разобрать</button><div style="height:12px"></div>' + S.crit.metrics.map(function (m) {
      var src = (d.benchSrc && d.benchSrc[m.k]) || 'own';
      return '<div class="bm' + (m.core ? ' core' : '') + '"><span title="' + esc(m.hr) + '">' + esc(m.ru) + ' <small class="miss">(' + m.k + ', ' + m.u + ')</small></span><input data-b="' + m.k + '" inputmode="decimal" value="' + esc(d.bench[m.k]) + '"><select data-bs="' + m.k + '"><option value="own"' + (src === 'own' ? ' selected' : '') + '>мой замер</option><option value="ext"' + (src === 'ext' ? ' selected' : '') + '>из источника</option></select></div>';
    }).join('') + '</fieldset>';
    h += '<fieldset><legend>Описание</legend><div class="grid"><div class="fld"><label>Кратко по-русски</label><textarea data-k="sumRu" rows="3">' + esc(d.sumRu) + '</textarea></div><div class="fld"><label>Кратко по-английски</label><textarea data-k="sumEn" rows="3">' + esc(d.sumEn) + '</textarea></div></div></fieldset>';
    h += '<fieldset><legend>Ссылки на обзоры</legend><div id="revs">' + d.reviews.map(revRow).join('') + '</div><button class="btn sm" type="button" id="addrev">Добавить ссылку</button></fieldset>';
    h += '<fieldset><legend>Фото</legend><div class="photo" id="photo">' + (S.imgs[d.slug] ? '<img src="' + S.imgs[d.slug] + '" alt="">' : '<p class="miss">Выберите файл: размер уменьшится до 1200 px автоматически. Фото сохранится как images/' + esc(d.slug || 'адрес') + '.jpg</p>') + '</div><input type="file" id="file" accept="image/*"></fieldset>';
    h += '<div class="bar2"><button class="btn pri" id="save" type="button">Сохранить в список</button><button class="btn" id="cancel" type="button">Отмена</button></div>';
    v.innerHTML = h;
    $('#cancel').onclick = function () { S.cur = null; view(); };
    $('#addrev').onclick = function () { collect(); S.cur.reviews.push({ title: '', url: '', lang: 'ru' }); view(); };
    $$('[data-rm]', v).forEach(function (b) { b.onclick = function () { collect(); S.cur.reviews.splice(+b.getAttribute('data-rm'), 1); view(); }; });
    $('#quickgo').onclick = function () { collect(); $('#quick').value.split(/\n/).forEach(function (l) { var m = l.match(/^\s*([a-z0-9_]+)\s*[=:\s]\s*([\d.,]+)/i); if (m && S.crit.metrics.some(function (x) { return x.k === m[1]; })) S.cur.bench[m[1]] = parseFloat(m[2].replace(',', '.')); }); view(); };
    $('#file').onchange = function () { collect(); var f = this.files[0]; if (!f) return; var slug = S.cur.slug || slugify(S.cur.name); if (!slug) { status('Сначала укажите название.', 'err'); return; } var img = new Image(); img.onload = function () { var w = Math.min(1200, img.width), hgt = Math.round(img.height * w / img.width), c = document.createElement('canvas'); c.width = w; c.height = hgt; c.getContext('2d').drawImage(img, 0, 0, w, hgt); S.cur.slug = slug; S.imgs[slug] = c.toDataURL('image/jpeg', 0.85); view(); }; img.src = URL.createObjectURL(f); };
    $('#save').onclick = function () {
      collect(); var d2 = S.cur; if (!d2.name) { status('Укажите название.', 'err'); return; }
      d2.slug = slugify(d2.slug) || slugify(d2.name); if (!d2.slug) { status('Для адреса нужны латинские буквы: заполните поле «Адрес страницы».', 'err'); return; }
      if (S.dev.some(function (x, i) { return x.slug === d2.slug && i !== S.curIdx; })) { status('Такой адрес уже есть.', 'err'); return; }
      if (S.curIdx < 0) S.dev.push(d2); else S.dev[S.curIdx] = d2;
      if (d2.brand && !S.brands.some(function (b) { return slugify(b.name) === slugify(d2.brand); })) S.brands.push({ slug: slugify(d2.brand), name: d2.brand, country: '', site: '', descRu: '', descEn: '' });
      S.dirty = true; S.cur = null; status('Сохранено в списке. Нажмите «Опубликовать на сайт», чтобы отправить на сайт.', 'ok'); view();
    };
  }
  function revRow(r, i) { return '<div class="rv"><input data-rt="' + i + '" placeholder="Название обзора" value="' + esc(r.title) + '"><input data-ru="' + i + '" placeholder="https://…" value="' + esc(r.url) + '"><button class="btn sm" type="button" data-rm="' + i + '">Убрать</button></div>'; }
  function collect() {
    var d = S.cur, v = $('#view');
    $$('[data-k]', v).forEach(function (e) { var k = e.getAttribute('data-k'); d[k] = e.type === 'checkbox' ? e.checked : e.value.trim(); });
    $$('[data-n]', v).forEach(function (e) { var n = parseFloat(String(e.value).replace(',', '.')); d[e.getAttribute('data-n')] = isFinite(n) ? n : null; });
    $$('[data-tri]', v).forEach(function (e) { d[e.getAttribute('data-tri')] = e.value === '' ? null : e.value === 'true'; });
    d.uses = $$('[data-use]', v).filter(function (e) { return e.checked; }).map(function (e) { return e.getAttribute('data-use'); });
    d.bench = {}; d.benchSrc = {};
    $$('[data-b]', v).forEach(function (e) { var n = parseFloat(String(e.value).replace(',', '.')); if (isFinite(n)) { var k = e.getAttribute('data-b'); d.bench[k] = n; var sel = $('[data-bs="' + k + '"]', v); if (sel && sel.value === 'ext') d.benchSrc[k] = 'ext'; } });
    d.reviews = $$('[data-rt]', v).map(function (e) { var i = e.getAttribute('data-rt'); return { title: e.value.trim(), url: $('[data-ru="' + i + '"]', v).value.trim(), lang: 'ru' }; }).filter(function (r) { return r.url; });
    if (!d.avail) delete d.avail;
  }
  function viewBrands(v) {
    var h = '<div class="row"><h2 style="flex:1">Производители (' + S.brands.length + ')</h2><button class="btn pri" id="addb" type="button">Добавить</button></div>';
    h += S.brands.map(function (b, i) { return '<fieldset data-bi="' + i + '"><legend>' + esc(b.name) + '</legend><div class="grid"><div class="fld"><label>Название</label><input data-bf="name" value="' + esc(b.name) + '"></div><div class="fld"><label>Страна</label><input data-bf="country" value="' + esc(b.country) + '"></div><div class="fld"><label>Год основания</label><input data-bf="founded" value="' + esc(b.founded) + '"></div><div class="fld"><label>Сайт</label><input data-bf="site" value="' + esc(b.site) + '" placeholder="https://"></div></div><div class="grid"><div class="fld"><label>О производителе (RU)</label><textarea data-bf="descRu" rows="4">' + esc(b.descRu) + '</textarea></div><div class="fld"><label>About the brand (EN)</label><textarea data-bf="descEn" rows="4">' + esc(b.descEn) + '</textarea></div></div><button class="btn sm" data-bdel="' + i + '" type="button">Удалить</button></fieldset>'; }).join('');
    h += '<div class="bar2"><button class="btn pri" id="bsave" type="button">Сохранить в список</button></div>';
    v.innerHTML = h;
    $('#addb').onclick = function () { bsync(); S.brands.push({ slug: '', name: 'Новый производитель' }); view(); };
    $$('[data-bdel]', v).forEach(function (b) { b.onclick = function () { bsync(); S.brands.splice(+b.getAttribute('data-bdel'), 1); S.dirty = true; view(); }; });
    $('#bsave').onclick = function () { bsync(); S.dirty = true; status('Сохранено в списке. Нажмите «Опубликовать на сайт».', 'ok'); view(); };
  }
  function bsync() { $$('[data-bi]').forEach(function (f) { var b = S.brands[+f.getAttribute('data-bi')]; $$('[data-bf]', f).forEach(function (e) { b[e.getAttribute('data-bf')] = e.value.trim(); }); b.slug = slugify(b.name); }); }

  $('#publish').onclick = publish;
  window.addEventListener('hashchange', function () { S.cur = null; view(); });
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  view();
  load().then(function () { status(hasCfg() ? '' : 'Токен не подключён: можно править и скачать файлы. Чтобы сайт обновлялся сам, откройте вкладку «Подключение».', hasCfg() ? '' : 'err'); view(); }).catch(function (e) { status('Не удалось загрузить данные: ' + e.message, 'err'); });
})();
