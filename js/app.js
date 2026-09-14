/* Accommodation classification app — O‘zMSt 958:2026 + O‘zMSt 125:2024 (amendment 1, 2026)
   Single-page, offline-capable, no login. State is stored in localStorage and can be exported/imported as JSON. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const STARS = [1, 2, 3, 4, 5];
  const KEY = 'hcs2_state_v1';
  const S958 = window.STD958, S125 = window.STD125, TRS = window.TR || {};

  // ---------------------------------------------------------------- state
  let state = { lang: 'uz', currentId: null, step: 1, assessments: [] };
  let filters = { q958: '', f958: null, q125: '', f125: null };
  let open958 = new Set(), open125 = new Set();
  let saveTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.assessments)) state = Object.assign(state, s); }
    } catch (e) { console.warn('load failed', e); }
    if (!['uz', 'ru', 'en'].includes(state.lang)) state.lang = 'uz';
  }
  function save(immediate) {
    setSaveState('saving');
    clearTimeout(saveTimer);
    const doSave = () => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); setSaveState('saved'); }
      catch (e) { console.error(e); toast(t('storageFull'), 'error'); setSaveState(''); }
    };
    if (immediate) doSave(); else saveTimer = setTimeout(doSave, 350);
  }
  function setSaveState(k) { const el = $('#saveState'); if (el) el.textContent = k ? t(k) : ''; }

  // ---------------------------------------------------------------- i18n
  function t(key, vars) {
    const pack = window.UI[state.lang] || window.UI.uz;
    let s = pack[key] != null ? pack[key] : (window.UI.uz[key] != null ? window.UI.uz[key] : key);
    if (vars) Object.keys(vars).forEach(k => { s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    return s;
  }
  function tr(key, uz) { if (state.lang !== 'uz' && TRS[state.lang] && TRS[state.lang][key]) return TRS[state.lang][key]; return uz; }
  function applyUiText() {
    $$('[data-ui]').forEach(el => { el.textContent = t(el.dataset.ui); });
    $$('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
    $$('#langSwitch button').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
    document.documentElement.lang = state.lang;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const starStr = n => n > 0 ? '★'.repeat(n) : '—';
  const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString(state.lang === 'en' ? 'en-GB' : 'ru-RU'); };
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const uid = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------------------------------------------------------------- model
  function newAssessment(type) {
    return {
      id: uid(), type: type || '958', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      facility: { name: '', address: '', region: '', kind: '', rooms: '', beds: '', floors: '', contact: '', phone: '', email: '', inspector: '', date: todayIso(), target: 3,
        seasonal: false, heritage: false, rural: false, naturalWater: false, sensorDoors: false, brand: false },
      a958: {}, a125: {}
    };
  }
  const cur = () => state.assessments.find(a => a.id === state.currentId) || null;
  const typeOf = a => a.type || 'both';
  const has958 = a => typeOf(a) !== '125';
  const has125 = a => typeOf(a) !== '958' && !!clsOf(a);
  const typeLabel = a => typeOf(a) === '958' ? t('type958') : typeOf(a) === '125' ? t('type125') : t('type958') + ' + ' + t('type125');
  // ordered visible steps for an assessment
  const stepsOf = a => typeOf(a) === '958' ? [1, 2, 4] : typeOf(a) === '125' ? [1, 3, 4] : [1, 2, 3, 4];
  const nextStep = (a, n) => { const st = stepsOf(a); const i = st.indexOf(n); return st[Math.min(st.length - 1, i + 1)]; };
  const prevStep = (a, n) => { const st = stepsOf(a); const i = st.indexOf(n); return st[Math.max(0, i - 1)]; };
  function touch(a) { a.updatedAt = new Date().toISOString(); save(); schedulePush(a); }
  // ---------------------------------------------------------------- cloud sync
  const C = window.Cloud || { enabled: false };
  const pushTimers = {};
  function summaryOf(a) {
    const e958 = eval958(a); const cls = has125(a) ? clsOf(a) : null; const eT = cls ? eval125(a, a.facility.target) : null; const best = cls && (has958(a) ? e958.compliant : true) ? bestStar(a) : 0;
    const complete = (!has958(a) || (e958.hasAnnex && e958.unanswered.length === 0)) && (!cls || progress125(a).answered === progress125(a).total);
    return { facility_name: a.facility.name || '', facility_kind: a.facility.kind || '', region: a.facility.region || '', target_star: cls ? a.facility.target : null,
      result_star: best, compliant_958: has958(a) ? e958.compliant : null, complete, points: eT ? eT.points : null, threshold: eT ? eT.threshold : null, assessed_on: a.facility.date || null, assess_type: typeOf(a) };
  }
  function schedulePush(a) {
    if (!C.enabled || !C.user || !C.isActive()) return;
    clearTimeout(pushTimers[a.id]);
    pushTimers[a.id] = setTimeout(() => pushNow(a), 1500);
  }
  async function pushNow(a) {
    if (!C.enabled || !C.user || !C.isActive()) return;
    setSaveState('syncing');
    try { await C.push(a, summaryOf(a)); a.cloudSyncedAt = a.updatedAt; setSaveState('cloudSynced'); }
    catch (e) { console.warn('push failed', e); setSaveState(navigator.onLine ? 'cloudError' : 'cloudOffline'); }
  }
  async function pushPending() { for (const a of state.assessments) { if (a.cloudSyncedAt !== a.updatedAt) await pushNow(a); } }
  async function pullFromCloud() {
    if (!C.enabled || !C.user || !C.isActive()) return;
    try {
      const remote = await C.pullMine(); let changed = false;
      remote.forEach(r => {
        const local = state.assessments.find(x => x.id === r.id);
        if (!local) { r.cloudSyncedAt = r.updatedAt; state.assessments.push(r); changed = true; }
        else if ((r.updatedAt || '') > (local.updatedAt || '')) { Object.assign(local, r, { cloudSyncedAt: r.updatedAt }); changed = true; }
      });
      // assessments created before sign-in belong to this user now
      state.assessments.forEach(a => { if (!a.owner_id) { a.owner_id = C.user.id; a.owner_name = C.profile.full_name || C.profile.email; } });
      if (changed) save(true);
    } catch (e) { console.warn('pull failed', e); }
    await pushPending();
  }
  window.addEventListener('online', () => { if (C.enabled) pushPending(); });
  const kindInfo = kind => S958.kinds.find(k => k.id === kind) || null;
  const kindName = kind => { const k = kindInfo(kind); return k ? tr('958kind:' + k.id, k.name) : ''; };
  const groupName = g => S958.groups[g] ? tr('958grp:' + g, S958.groups[g].name) : '';
  const clsName = c => S125.thresholds[c] ? tr('125thr:' + c, S125.thresholds[c].name) : '';
  function annexFor(a) {
    const k = kindInfo(a.facility.kind); if (!k) return null;
    const g = S958.groups[k.group]; const ax = S958['annex' + g.annex];
    return { key: g.annex, col: g.col, annex: ax, group: k.group };
  }
  function facilityFlags(a) {
    const f = a.facility; const rooms = parseInt(f.rooms, 10);
    return { seasonal: !!f.seasonal, heritage: !!f.heritage, rural: !!f.rural, naturalWater: !!f.naturalWater, small15: Number.isFinite(rooms) && rooms > 0 && rooms <= 15, sensorDoors: !!f.sensorDoors };
  }
  function ruleMatches(rule, a) {
    const flags = facilityFlags(a);
    if (rule.kinds && rule.kinds.includes(a.facility.kind)) return true;
    if (rule.flags && rule.flags.some(fl => flags[fl])) return true;
    return false;
  }

  // ---------------------------------------------------------------- 958 logic
  // Returns flat list of leaves with applicability for the current facility
  function leaves958(a) {
    const ax = annexFor(a); if (!ax) return [];
    const out = [];
    ax.annex.sections.forEach(sec => {
      sec.items.forEach(item => {
        const leaves = item.sub ? item.sub : [item];
        leaves.forEach(leaf => {
          const notes = [].concat(sec.notes || [], item.notes || [], leaf === item ? [] : (leaf.notes || []));
          let applies = true, reasons = [], info = [];
          if (ax.col != null) {
            const mark = leaf.marks && leaf.marks[ax.col];
            if (!mark || !mark.req) { applies = false; reasons.push(t('notApplicable')); }
            else notes.push(...(mark.notes || []));
          }
          const rules = ax.annex.rules || {};
          const secNotes = new Set(sec.notes || []);
          [...new Set(notes)].forEach(n => {
            const r = rules[n];
            if (!r) { if (!secNotes.has(n)) info.push(n); return; }
            if (r.type === 'exempt' && ruleMatches(r, a)) { if (applies) reasons.push(t('exemptBy', { n })); applies = false; info.push(n); }
            else if (r.type === 'only' && !ruleMatches(r, a)) { if (applies) reasons.push(t('onlyFor', { n })); applies = false; info.push(n); }
            else if (!secNotes.has(n)) info.push(n);
          });
          out.push({ sec, item, leaf, key: ax.key, id: leaf.id, applies, reasons, info: [...new Set(info)], parent: leaf === item ? null : item });
        });
      });
    });
    return out;
  }
  function eval958(a) {
    const all = has958(a) ? leaves958(a) : []; const app = all.filter(l => l.applies);
    const res = { total: all.length, applicable: app.length, yes: 0, no: [], na: [], unanswered: [], compliant: false, hasAnnex: all.length > 0 };
    app.forEach(l => {
      const ans = a.a958[l.id];
      if (!ans || !ans.v) res.unanswered.push(l);
      else if (ans.v === 'yes') res.yes++;
      else if (ans.v === 'no') res.no.push(l);
      else res.na.push(l);
    });
    res.answered = res.yes + res.no.length + res.na.length;
    res.compliant = res.hasAnnex && res.unanswered.length === 0 && res.no.length === 0;
    return res;
  }

  // ---------------------------------------------------------------- 125 logic
  const clsOf = a => { const k = kindInfo(a.facility.kind); return k ? k.cls : null; };
  const items125 = () => { const out = []; S125.categories.forEach(c => c.items.forEach(it => out.push(Object.assign({ cat: c }, it)))); return out; };
  const ITEMS125 = items125(); const ITEM125 = {}; ITEMS125.forEach(i => ITEM125[i.id] = i);
  const leaves125 = () => ITEMS125.filter(i => !i.header);
  function isMandatory(item, star, a) {
    if (item.header) return false;
    const cls = clsOf(a); const ann = item.ann || []; const flags = facilityFlags(a);
    let m = item.m.includes(star);
    if (cls === 'aparthotel') { if (ann.includes('A8')) m = false; if (ann.includes('A9')) m = true; }
    if (cls === 'specialized') { if (ann.includes('A10')) m = false; if (ann.includes('A11')) m = true; }
    if (flags.heritage && ann.includes('A7')) m = false;
    if (flags.sensorDoors && ann.includes('A3')) m = false;
    return m;
  }
  function mandatoryStars(item, a) { return STARS.filter(s => isMandatory(item, s, a)); }
  function selectedTierRank(tier, a) {
    const ids = S125.tiers[tier] || []; let best = -1;
    ids.forEach(id => { const ans = a.a125[id]; if (ans && ans.v === 'yes') { const r = ITEM125[id].rank; if (r > best) best = r; } });
    return best;
  }
  function satisfied125(item, a) {
    const ans = a.a125[item.id];
    if (item.rule) return !!(ans && ans.v === 'yes' && Number(ans.qty) > 0);
    if (item.tier != null) return selectedTierRank(item.tier, a) >= item.rank;
    return !!(ans && ans.v === 'yes');
  }
  function earned125(item, a) {
    const ans = a.a125[item.id]; if (!ans || ans.v !== 'yes') return 0;
    if (item.rule) return Math.min(item.rule.max, item.rule.per_unit * Math.max(0, Number(ans.qty) || 0));
    return item.points;
  }
  function threshold(a, star) { const cls = clsOf(a); return cls ? S125.thresholds[cls].min[String(star)] : null; }
  function eval125(a, star) {
    const cls = clsOf(a); if (!cls) return null;
    const leaves = leaves125(); let points = 0; const byCat = {};
    leaves.forEach(it => { const e = earned125(it, a); points += e; byCat[it.cat.id] = (byCat[it.cat.id] || 0) + e; });
    const mandatory = leaves.filter(it => isMandatory(it, star, a));
    const missing = mandatory.filter(it => !satisfied125(it, a));
    const thr = threshold(a, star);
    return { star, cls, points, byCat, mandatory, missing, threshold: thr, shortfall: Math.max(0, thr - points), achieved: missing.length === 0 && points >= thr };
  }
  function bestStar(a) { let best = 0; STARS.forEach(s => { const e = eval125(a, s); if (e && e.achieved) best = s; }); return best; }
  function progress125(a) { const leaves = leaves125(); const answered = leaves.filter(it => a.a125[it.id] && a.a125[it.id].v).length; return { answered, total: leaves.length }; }
  function maxPoints125() { // max counting only the top tier of each tier group
    let sum = 0; const tierMax = {};
    leaves125().forEach(it => { if (it.tier != null) tierMax[it.tier] = Math.max(tierMax[it.tier] || 0, it.points); else sum += it.points; });
    return sum + Object.values(tierMax).reduce((x, y) => x + y, 0);
  }

  // ---------------------------------------------------------------- navigation
  function showPage(p) {
    $$('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
    $$('#mainTabs button').forEach(b => b.classList.toggle('active', b.dataset.page === p));
    if (p === 'list') renderList();
    if (p === 'assess') { if (!cur()) { showPage('list'); return; } showStep(state.step || 1); }
    if (p === 'standards') renderStandards();
    if (p === 'registry') renderRegistry();
    if (p === 'users') renderUsers();
    window.scrollTo({ top: 0 });
  }
  function showStep(n) {
    const a = cur(); if (!a) return;
    if (n > 1 && !facilityValid(a).ok) { toast(t('stepLocked'), 'error'); n = 1; }
    state.step = n; save();
    if (!stepsOf(a).includes(n)) n = stepsOf(a)[0];
    $$('.step').forEach(el => el.classList.toggle('hidden', el.id !== 'step-' + n));
    $$('#stepper button').forEach(b => { const s = +b.dataset.step; b.classList.toggle('hidden', !stepsOf(a).includes(s)); b.classList.toggle('active', s === n); b.classList.toggle('done', stepDone(a, s)); b.disabled = s > 1 && !facilityValid(a).ok; });
    $('#stepper').style.gridTemplateColumns = `repeat(${stepsOf(a).length}, minmax(0, 1fr))`;
    stepsOf(a).forEach((s, i) => { const el = $(`#stepper button[data-step="${s}"] .n`); if (el) el.textContent = i + 1; });
    $$('[data-goto]').forEach(b => { const from = +b.closest('.step').id.replace('step-', ''); b.dataset.gotoResolved = b.dataset.dir === 'back' ? prevStep(a, from) : nextStep(a, from); });
    if (n === 1) renderStep1(a); if (n === 2) renderStep2(a); if (n === 3) renderStep3(a); if (n === 4) renderStep4(a);
    window.scrollTo({ top: 0 });
  }
  function stepDone(a, s) {
    if (s === 1) return facilityValid(a).ok;
    if (s === 2) { const e = eval958(a); return e.hasAnnex && e.unanswered.length === 0; }
    if (s === 3) { if (!has125(a)) return facilityValid(a).ok; const p = progress125(a); return p.answered === p.total; }
    return false;
  }
  function facilityValid(a) {
    const f = a.facility; const missing = [];
    if (!f.name.trim()) missing.push(t('fName'));
    if (!f.kind) missing.push(t('fKind'));
    if (typeOf(a) === '125' && f.kind && !clsOf(a)) missing.push(t('pointsGroup'));
    if (!f.date) missing.push(t('fDate'));
    return { ok: missing.length === 0, missing };
  }

  // ---------------------------------------------------------------- list page
  function renderList() {
    const box = $('#assessList');
    if (!state.assessments.length) { box.innerHTML = `<div class="card empty"><div class="big">★</div><h3>${esc(t('noAssessments'))}</h3><p>${esc(t('noAssessmentsHint'))}</p></div>`; return; }
    const list = state.assessments.slice().sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''));
    box.innerHTML = list.map(a => {
      const e958 = eval958(a); const cls = has125(a) ? clsOf(a) : null; const best = cls ? bestStar(a) : 0;
      const p125 = cls ? progress125(a) : null; const gate = has958(a) ? e958.compliant : true;
      let badge = `<span class="badge info">${esc(typeLabel(a))}</span> `;
      if (!e958.hasAnnex && !cls) badge += `<span class="badge">${esc(t('incomplete'))}</span>`;
      else if (e958.unanswered.length || (p125 && p125.answered < p125.total)) badge += `<span class="badge warn">${esc(t('incomplete'))}</span>`;
      else if (!gate) badge += `<span class="badge m">${esc(t('nonCompliant'))}</span>`;
      else if (cls) badge += best ? `<span class="badge gold">${starStr(best)}</span>` : `<span class="badge m">${esc(t('notAchieved'))}</span>`;
      else badge += `<span class="badge ok">${esc(t('compliant'))}</span>`;
      const pct = Math.round(100 * (e958.answered + (p125 ? p125.answered : 0)) / Math.max(1, e958.applicable + (p125 ? p125.total : 0)));
      return `<div class="card assess-card" data-id="${a.id}">
        <div style="min-width:0">
          <div class="name">${esc(a.facility.name || t('untitled'))} ${badge}</div>
          <div class="sub">${a.owner_name && C.enabled && C.isAdmin() && a.owner_id !== C.user.id ? esc(a.owner_name) + ' · ' : ''}${esc(kindName(a.facility.kind))}${a.facility.region ? ' · ' + esc(a.facility.region) : ''} · ${esc(fmtDate(a.facility.date))} ${cls ? ' · ' + esc(t('fTarget')) + ': ' + starStr(a.facility.target) + ' · ' + eval125(a, a.facility.target).points + ' ' + esc(t('pts')) : ''}</div>
          <div class="progress" style="margin-top:8px;max-width:320px"><span style="width:${pct}%"></span></div>
        </div>
        <div class="actions">
          <button class="btn primary sm" data-act="open">${esc(t('open'))}</button>
          <button class="btn sm" data-act="dup">${esc(t('duplicate'))}</button>
          <button class="btn sm" data-act="json">${esc(t('exportJson'))}</button>
          <button class="btn danger sm" data-act="del">${esc(t('delete'))}</button>
        </div></div>`;
    }).join('');
  }
  $('#assessList').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const card = e.target.closest('[data-id]'); const a = state.assessments.find(x => x.id === card.dataset.id); if (!a) return;
    if (b.dataset.act === 'open') { state.currentId = a.id; state.step = facilityValid(a).ok ? (state.step || 1) : 1; save(); showPage('assess'); }
    if (b.dataset.act === 'dup') { const c = JSON.parse(JSON.stringify(a)); c.id = uid(); c.createdAt = c.updatedAt = new Date().toISOString(); c.facility.name = (c.facility.name || '') + ' (2)'; state.assessments.push(c); save(); renderList(); }
    if (b.dataset.act === 'json') exportJson(a);
    if (b.dataset.act === 'del') { if (confirm(t('confirmDelete'))) { state.assessments = state.assessments.filter(x => x.id !== a.id); if (state.currentId === a.id) state.currentId = null; save(true); renderList(); if (C.enabled && C.user) C.remove(a.id).catch(e => console.warn(e)); } }
  });
  const startNew = type => { const a = newAssessment(type); state.assessments.push(a); state.currentId = a.id; state.step = 1; save(); showPage('assess'); };
  $('#btnNew958').onclick = () => startNew('958'); $('#btnNew125').onclick = () => startNew('125');
  $('#importFile').onchange = e => { const f = e.target.files[0]; if (f) importJsonFile(f); e.target.value = ''; };

  // ---------------------------------------------------------------- step 1
  function renderStep1(a) {
    const f = a.facility;
    const sel = $('#kindSelect');
    const groups = ['hotel', 'bnb', 'specialized', 'individual', 'hostel', 'dormitory'];
    const only125 = typeOf(a) === '125';
    sel.innerHTML = `<option value="">${esc(t('selectKind'))}</option>` + groups.filter(g => !only125 || S958.kinds.some(k => k.group === g && k.cls)).map(g => `<optgroup label="${esc(groupName(g))}">` +
      S958.kinds.filter(k => k.group === g && (!only125 || k.cls)).map(k => `<option value="${k.id}">${esc(kindName(k.id))}</option>`).join('') + '</optgroup>').join('');
    $('#targetGroup').classList.toggle('hidden', typeOf(a) === '958');
    $('#assessTypeBadge').textContent = typeLabel(a);
    $$('#step-1 [data-f]').forEach(el => { const k = el.dataset.f; el.value = f[k] == null ? '' : f[k]; el.classList.remove('invalid'); });
    updateKindDisplay(a);
    const sp = $('#starPicker'); sp.innerHTML = STARS.map(s => `<button type="button" data-star="${s}" class="${f.target === s ? 'active' : ''}"><span class="s">${starStr(s)}</span>${s}</button>`).join('');
    const flagDefs = [['seasonal', 'flagSeasonal', 'flagSeasonalD'], ['heritage', 'flagHeritage', 'flagHeritageD'], ['rural', 'flagRural', 'flagRuralD'], ['naturalWater', 'flagNaturalWater', 'flagNaturalWaterD'], ['sensorDoors', 'flagSensorDoors', 'flagSensorDoorsD'], ['brand', 'flagBrand', 'flagBrandD']];
    $('#flagGrid').innerHTML = flagDefs.map(([k, l, d]) => `<label class="check ${f[k] ? 'on' : ''}"><input type="checkbox" data-flag="${k}" ${f[k] ? 'checked' : ''}><span><span class="lbl">${esc(t(l))}</span><br><span class="desc">${esc(t(d))}</span></span></label>`).join('');
  }
  function updateKindDisplay(a) {
    const k = kindInfo(a.facility.kind);
    $('#groupDisplay').value = k ? `${groupName(k.group)} — ${t('annex')} ${S958.groups[k.group].annex}` : '';
    $('#clsDisplay').textContent = k ? (k.cls ? `${t('pointsGroup')}: ${clsName(k.cls)}` : t('noPoints')) : '';
    $('#targetGroup').style.opacity = k && !k.cls ? .5 : 1;
    $('#noPointsNote').textContent = k && !k.cls ? t('noPoints') : '';
  }
  $('#step-1').addEventListener('input', e => {
    const a = cur(); if (!a) return; const el = e.target;
    if (el.dataset.f) { a.facility[el.dataset.f] = el.type === 'number' ? el.value : el.value; el.classList.remove('invalid'); if (el.dataset.f === 'kind') updateKindDisplay(a); touch(a); }
  });
  $('#step-1').addEventListener('change', e => {
    const a = cur(); if (!a) return; const el = e.target;
    if (el.dataset.flag) { a.facility[el.dataset.flag] = el.checked; el.closest('.check').classList.toggle('on', el.checked); touch(a); }
  });
  $('#starPicker').addEventListener('click', e => { const b = e.target.closest('button[data-star]'); if (!b) return; const a = cur(); a.facility.target = +b.dataset.star; touch(a); $$('#starPicker button').forEach(x => x.classList.toggle('active', x === b)); });
  $('#btnStep1Next').onclick = () => {
    const a = cur(); const v = facilityValid(a);
    if (!v.ok) { toast(t('fillRequired', { fields: v.missing.join(', ') }), 'error'); ['name', 'kind', 'date'].forEach(k => { if (!String(a.facility[k] || '').trim()) $(`#step-1 [data-f="${k}"]`).classList.add('invalid'); }); return; }
    showStep(nextStep(a, 1));
  };
  $$('[data-goto]').forEach(b => { b.dataset.dir = b.textContent.includes('←') ? 'back' : 'next'; b.onclick = () => showStep(+(b.dataset.gotoResolved || b.dataset.goto)); });
  $('#stepper').addEventListener('click', e => { const b = e.target.closest('button[data-step]'); if (b && !b.disabled) showStep(+b.dataset.step); });

  // ---------------------------------------------------------------- step 2 (958)
  function noteText(key, n, annex) { const notes = annex.notes || {}; return tr(`958${key}note:${n}`, notes[n] || ''); }
  function renderStep2(a) {
    const ax = annexFor(a); const box = $('#list958');
    if (!ax) { box.innerHTML = ''; return; }
    $('#annexLabel').textContent = `— ${tr('958' + ax.key + ':title', ax.annex.title)}`;
    const leaves = leaves958(a); const q = filters.q958.trim().toLowerCase();
    const bySec = new Map(); leaves.forEach(l => { if (!bySec.has(l.sec.id)) bySec.set(l.sec.id, []); bySec.get(l.sec.id).push(l); });
    let html = '';
    bySec.forEach((ls, secId) => {
      const sec = ls[0].sec; const app = ls.filter(l => l.applies); const done = app.filter(l => a.a958[l.id] && a.a958[l.id].v).length;
      const visible = ls.filter(l => {
        if (q) { const txt = (tr(`958${ax.key}:${l.id}`, l.leaf.title) + ' ' + (l.parent ? tr(`958${ax.key}:${l.parent.id}`, l.parent.title) : '') + ' ' + l.id).toLowerCase(); if (!txt.includes(q)) return false; }
        if (filters.f958 === 'unanswered') return l.applies && !(a.a958[l.id] && a.a958[l.id].v);
        if (filters.f958 === 'no') return a.a958[l.id] && a.a958[l.id].v === 'no';
        return true;
      });
      if (!visible.length) return;
      const isOpen = open958.has(secId) || !!q || !!filters.f958 || (open958.size === 0 && html === '');
      html += `<div class="section ${isOpen ? 'open' : ''}" data-sec="${secId}"><div class="sec-head"><h3>${esc(sec.id)}. ${esc(tr(`958${ax.key}sec:${sec.id}`, sec.title))}</h3><span class="cnt mono">${done}/${app.length}</span><span class="arrow">▾</span></div><div class="sec-progress"><span style="width:${app.length ? Math.round(100 * done / app.length) : 100}%"></span></div><div class="sec-body">${(sec.notes || []).filter(n => !(ax.annex.rules || {})[n]).length ? `<div class="sec-notes">${(sec.notes || []).filter(n => !(ax.annex.rules || {})[n]).map(n => `(${n}) ${esc(noteText(ax.key, n, ax.annex))}`).join('<br>')}</div>` : ''}`;
      let lastParent = null;
      visible.forEach(l => {
        if (l.parent && l.parent !== lastParent) { html += `<div class="item parent"><div><span class="id">${esc(l.parent.id)}</span>${esc(tr(`958${ax.key}:${l.parent.id}`, l.parent.title))}</div></div>`; }
        lastParent = l.parent;
        html += renderRow958(a, l, ax);
      });
      html += '</div></div>';
    });
    box.innerHTML = html || `<div class="card empty">${esc(t('none'))}</div>`;
    updateProgress958(a);
  }
  function renderRow958(a, l, ax) {
    const ans = a.a958[l.id] || {}; const v = l.applies ? (ans.v || '') : '';
    const title = tr(`958${ax.key}:${l.id}`, l.leaf.title);
    const infoNotes = l.info.map(n => `<div>• (${n}) ${esc(noteText(ax.key, n, ax.annex))}</div>`).join('');
    const hasExtra = !!(ans.note || (ans.photos && ans.photos.length));
    const allNotes = [...new Set([].concat(l.item.notes || [], l.leaf === l.item ? [] : (l.leaf.notes || []), (ax.col != null && l.leaf.marks && l.leaf.marks[ax.col]) ? l.leaf.marks[ax.col].notes : []))];
    return `<div class="item ${l.applies ? (v ? 'answered-' + v : '') : 'na'} ${hasExtra ? 'open-extras' : ''}" id="i958-${esc(l.id)}" data-id="${esc(l.id)}">
      <div><span class="id">${esc(l.id)}</span><span class="txt">${esc(title)}</span>${allNotes.length ? `<sup class="fn">${allNotes.join(', ')}</sup>` : ''}
        <div class="meta">${l.leaf.changed ? `<span class="badge new">${esc(t('changed'))}</span>` : ''}${l.applies ? '' : l.reasons.map(r => `<span class="badge">${esc(r)}</span>`).join('')}</div>
        ${infoNotes ? `<div class="notes">${infoNotes}</div>` : ''}
        ${ans.v === 'na' && l.applies ? `<div class="notes" style="color:var(--warning)">${esc(t('naMandatoryWarn'))}</div>` : ''}
      </div>
      <div class="item-actions">
        ${l.applies ? `<div class="seg"><button class="yes ${v === 'yes' ? 'active' : ''}" data-v="yes">${esc(t('yes'))}</button><button class="no ${v === 'no' ? 'active' : ''}" data-v="no">${esc(t('no'))}</button><button class="na ${v === 'na' ? 'active' : ''}" data-v="na" title="${esc(t('naFull'))}">${esc(t('na'))}</button></div>
        <button class="btn sm ghost" data-extra="1">✎ ${esc(t('addNote'))}</button>` : ''}
      </div>
      <div class="extras">
        <textarea data-note="1" placeholder="${esc(t('note'))}">${esc(ans.note || '')}</textarea>
        <div class="photos">${(ans.photos || []).map((p, i) => `<div class="ph"><img src="${p}" alt=""><button data-rmphoto="${i}">×</button></div>`).join('')}<label class="add" title="${esc(t('photo'))}">📷<input type="file" accept="image/*" capture="environment" data-photo="1"></label></div>
      </div></div>`;
  }
  function updateProgress958(a) {
    const e = eval958(a); const pct = e.applicable ? Math.round(100 * e.answered / e.applicable) : 0;
    $('#progress958Text').textContent = `${e.answered} ${t('of')} ${e.applicable} ${t('answered')}`;
    const bar = $('#progress958Bar'); bar.style.width = pct + '%'; bar.parentElement.className = 'progress ' + (e.no.length ? 'danger' : (e.unanswered.length ? '' : 'ok'));
    $$('#list958 .section').forEach(secEl => {
      const secId = secEl.dataset.sec; const ls = leaves958(a).filter(l => l.sec.id === secId && l.applies); const done = ls.filter(l => a.a958[l.id] && a.a958[l.id].v).length;
      $('.cnt', secEl).textContent = `${done}/${ls.length}`; $('.sec-progress span', secEl).style.width = (ls.length ? Math.round(100 * done / ls.length) : 100) + '%';
    });
  }
  $('#list958').addEventListener('click', e => {
    const a = cur(); if (!a) return;
    const head = e.target.closest('.sec-head');
    if (head) { const sec = head.parentElement; sec.classList.toggle('open'); const id = sec.dataset.sec; if (sec.classList.contains('open')) open958.add(id); else open958.delete(id); return; }
    const row = e.target.closest('.item[data-id]'); if (!row) return; const id = row.dataset.id;
    const vb = e.target.closest('button[data-v]');
    if (vb) { const ans = a.a958[id] || (a.a958[id] = {}); ans.v = ans.v === vb.dataset.v ? '' : vb.dataset.v; touch(a);
      $$('button[data-v]', row).forEach(b => b.classList.toggle('active', b.dataset.v === ans.v)); row.className = row.className.replace(/answered-\w+/g, '').trim() + (ans.v ? ' answered-' + ans.v : ''); updateProgress958(a); return; }
    if (e.target.closest('button[data-extra]')) { row.classList.toggle('open-extras'); return; }
    const rm = e.target.closest('button[data-rmphoto]');
    if (rm) { const ans = a.a958[id]; if (ans && ans.photos) { ans.photos.splice(+rm.dataset.rmphoto, 1); touch(a); rm.parentElement.remove(); } }
  });
  $('#list958').addEventListener('input', e => { const a = cur(); const row = e.target.closest('.item[data-id]'); if (!a || !row || !e.target.dataset.note) return; const ans = a.a958[row.dataset.id] || (a.a958[row.dataset.id] = {}); ans.note = e.target.value; touch(a); });
  $('#list958').addEventListener('change', e => { if (e.target.dataset.photo) { const row = e.target.closest('.item[data-id]'); addPhoto(e.target, 'a958', row.dataset.id, row); } });
  $('#search958').oninput = e => { filters.q958 = e.target.value; renderStep2(cur()); };
  $$('[data-filter958]').forEach(b => b.onclick = () => { filters.f958 = filters.f958 === b.dataset.filter958 ? null : b.dataset.filter958; $$('[data-filter958]').forEach(x => x.classList.toggle('active', x.dataset.filter958 === filters.f958)); renderStep2(cur()); });
  $('#expand958').onclick = () => { const a = cur(); const all = $$('#list958 .section'); const anyClosed = all.some(s => !s.classList.contains('open')); all.forEach(s => { s.classList.toggle('open', anyClosed); if (anyClosed) open958.add(s.dataset.sec); else open958.delete(s.dataset.sec); }); $('#expand958').textContent = anyClosed ? t('collapseAll') : t('expandAll'); };

  // ---------------------------------------------------------------- photos
  function addPhoto(input, store, id, row) {
    const file = input.files[0]; if (!file) return; const a = cur();
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1024; let w = img.width, h = img.height; if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
        const data = c.toDataURL('image/jpeg', 0.72);
        const ans = a[store][id] || (a[store][id] = {}); (ans.photos || (ans.photos = [])).push(data); touch(a);
        const box = $('.photos', row); const div = document.createElement('div'); div.className = 'ph'; div.innerHTML = `<img src="${data}" alt=""><button data-rmphoto="${ans.photos.length - 1}">×</button>`; box.insertBefore(div, $('label.add', box));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file); input.value = '';
  }

  // ---------------------------------------------------------------- step 3 (125)
  function renderStep3(a) {
    const cls = has125(a) ? clsOf(a) : null; const box = $('#list125');
    $('#noPoints125').classList.toggle('hidden', !!cls);
    if (!cls) { box.innerHTML = ''; $('#progress125Text').textContent = ''; $('#progress125Bar').style.width = '0%'; $('#groupLabel125').textContent = ''; return; }
    $('#groupLabel125').textContent = `— ${clsName(cls)}`;
    const q = filters.q125.trim().toLowerCase(); const target = a.facility.target;
    let html = '';
    S125.categories.forEach(c => {
      const leaves = c.items.filter(i => !i.header); const done = leaves.filter(i => a.a125[i.id] && a.a125[i.id].v).length;
      const visible = c.items.filter(i => {
        if (q) { const txt = (tr('125:' + i.id, i.text) + ' ' + i.label).toLowerCase(); if (!txt.includes(q)) return false; }
        if (i.header) return !filters.f125;
        if (filters.f125 === 'unanswered') return !(a.a125[i.id] && a.a125[i.id].v);
        if (filters.f125 === 'mandatory') return isMandatory(i, target, a);
        return true;
      });
      if (!visible.length) return;
      const isOpen = open125.has(c.id) || !!q || !!filters.f125 || (open125.size === 0 && html === '');
      const catPts = leaves.reduce((s, i) => s + earned125(i, a), 0);
      html += `<div class="section ${isOpen ? 'open' : ''}" data-sec="${c.id}"><div class="sec-head"><h3>${esc(c.id)}. ${esc(tr('125cat:' + c.id, c.name))}${c.ref ? ` <span class="badge info">${esc(c.ref)}</span>` : ''}</h3><span class="cnt mono"><span class="pts">${catPts} ${esc(t('pts'))}</span> · ${done}/${leaves.length}</span><span class="arrow">▾</span></div><div class="sec-progress"><span style="width:${leaves.length ? Math.round(100 * done / leaves.length) : 0}%"></span></div><div class="sec-body">`;
      visible.forEach(i => { html += i.header ? `<div class="item parent"><div><span class="id">${esc(i.label)}</span>${esc(tr('125:' + i.id, i.text))}${i.ann.length ? ' ' + i.ann.map(x => `<span class="badge info">${x}</span>`).join(' ') : ''}</div></div>` : renderRow125(a, i); });
      html += '</div></div>';
    });
    box.innerHTML = html || `<div class="card empty">${esc(t('none'))}</div>`;
    updateProgress125(a);
  }
  function renderRow125(a, i) {
    const ans = a.a125[i.id] || {}; const v = ans.v || ''; const target = a.facility.target;
    const mStars = mandatoryStars(i, a); const isM = mStars.includes(target);
    const annNotes = i.ann.map(x => `<div>• ${x}: ${esc(tr('125ann:' + x, S125.annotations[x] || ''))}</div>`).join('');
    const hasExtra = !!(ans.note || (ans.photos && ans.photos.length));
    const ptsLabel = i.rule ? t('perUnit', { p: i.rule.per_unit, m: i.rule.max }) : `${i.points} ${t('pts')}`;
    return `<div class="item ${v ? 'answered-' + v : ''} ${hasExtra ? 'open-extras' : ''}" id="i125-${esc(i.id)}" data-id="${esc(i.id)}">
      <div><span class="id">${esc(i.label)}</span><span class="txt">${esc(tr('125:' + i.id, i.text))}</span>
        <div class="meta"><span class="pts">${esc(ptsLabel)}</span>
          ${mStars.length ? `<span class="badge ${isM ? 'm' : ''}">${esc(t('mandatoryFor', { stars: mStars.map(s => s + '★').join(' ') }))}</span>` : `<span class="badge">${esc(t('optionalItem'))}</span>`}
          ${i.ann.map(x => `<span class="badge info">${x}</span>`).join('')}
          ${i.tier != null ? `<span class="tier-note">${esc(t('tierHint'))}</span>` : ''}
        </div>
        ${annNotes ? `<div class="notes">${annNotes}</div>` : ''}
      </div>
      <div class="item-actions">
        ${i.rule ? `<input type="number" class="input qty" min="0" inputmode="numeric" data-qty="1" value="${esc(ans.qty || '')}" placeholder="${esc(t('qty'))}">` : ''}
        <div class="seg"><button class="yes ${v === 'yes' ? 'active' : ''}" data-v="yes">${esc(t('yes'))}</button><button class="no ${v === 'no' ? 'active' : ''}" data-v="no">${esc(t('no'))}</button></div>
        <button class="btn sm ghost" data-extra="1">✎</button>
      </div>
      <div class="extras">
        <textarea data-note="1" placeholder="${esc(t('note'))}">${esc(ans.note || '')}</textarea>
        <div class="photos">${(ans.photos || []).map((p, k) => `<div class="ph"><img src="${p}" alt=""><button data-rmphoto="${k}">×</button></div>`).join('')}<label class="add" title="${esc(t('photo'))}">📷<input type="file" accept="image/*" capture="environment" data-photo="1"></label></div>
      </div></div>`;
  }
  function updateProgress125(a) {
    if (!has125(a)) return; const p = progress125(a); const e = eval125(a, a.facility.target); if (!e) return;
    $('#progress125Text').innerHTML = `<strong>${e.points}</strong> / ${e.threshold} ${esc(t('pts'))} · ${p.answered}/${p.total}`;
    const bar = $('#progress125Bar'); bar.style.width = Math.round(100 * p.answered / p.total) + '%'; bar.parentElement.className = 'progress ' + (e.points >= e.threshold ? 'ok' : '');
    $$('#list125 .section').forEach(secEl => {
      const c = S125.categories.find(x => x.id === secEl.dataset.sec); const leaves = c.items.filter(i => !i.header);
      const done = leaves.filter(i => a.a125[i.id] && a.a125[i.id].v).length; const pts = leaves.reduce((s, i) => s + earned125(i, a), 0);
      $('.cnt', secEl).innerHTML = `<span class="pts">${pts} ${esc(t('pts'))}</span> · ${done}/${leaves.length}`; $('.sec-progress span', secEl).style.width = Math.round(100 * done / leaves.length) + '%';
    });
  }
  function setAnswer125(a, id, v) {
    const it = ITEM125[id]; const ans = a.a125[id] || (a.a125[id] = {});
    ans.v = ans.v === v ? '' : v;
    if (ans.v === 'yes' && it.tier != null) { (S125.tiers[it.tier] || []).forEach(o => { if (o !== id && a.a125[o] && a.a125[o].v === 'yes') { a.a125[o].v = 'no'; const r = $(`#i125-${CSS.escape(o)}`); if (r) { $$('button[data-v]', r).forEach(b => b.classList.toggle('active', b.dataset.v === 'no')); r.className = r.className.replace(/answered-\w+/g, '').trim() + ' answered-no'; } } }); }
    touch(a);
  }
  $('#list125').addEventListener('click', e => {
    const a = cur(); if (!a) return;
    const head = e.target.closest('.sec-head');
    if (head) { const sec = head.parentElement; sec.classList.toggle('open'); if (sec.classList.contains('open')) open125.add(sec.dataset.sec); else open125.delete(sec.dataset.sec); return; }
    const row = e.target.closest('.item[data-id]'); if (!row) return; const id = row.dataset.id;
    const vb = e.target.closest('button[data-v]');
    if (vb) { setAnswer125(a, id, vb.dataset.v); const v = a.a125[id].v; $$('button[data-v]', row).forEach(b => b.classList.toggle('active', b.dataset.v === v)); row.className = row.className.replace(/answered-\w+/g, '').trim() + (v ? ' answered-' + v : ''); updateProgress125(a); return; }
    if (e.target.closest('button[data-extra]')) { row.classList.toggle('open-extras'); return; }
    const rm = e.target.closest('button[data-rmphoto]');
    if (rm) { const ans = a.a125[id]; if (ans && ans.photos) { ans.photos.splice(+rm.dataset.rmphoto, 1); touch(a); rm.parentElement.remove(); } }
  });
  $('#list125').addEventListener('input', e => {
    const a = cur(); const row = e.target.closest('.item[data-id]'); if (!a || !row) return; const id = row.dataset.id; const ans = a.a125[id] || (a.a125[id] = {});
    if (e.target.dataset.note) { ans.note = e.target.value; touch(a); }
    if (e.target.dataset.qty) { ans.qty = e.target.value; if (Number(ans.qty) > 0 && ans.v !== 'yes') { ans.v = 'yes'; $$('button[data-v]', row).forEach(b => b.classList.toggle('active', b.dataset.v === 'yes')); row.className = row.className.replace(/answered-\w+/g, '').trim() + ' answered-yes'; } touch(a); updateProgress125(a); }
  });
  $('#list125').addEventListener('change', e => { if (e.target.dataset.photo) { const row = e.target.closest('.item[data-id]'); addPhoto(e.target, 'a125', row.dataset.id, row); } });
  $('#search125').oninput = e => { filters.q125 = e.target.value; renderStep3(cur()); };
  $$('[data-filter125]').forEach(b => b.onclick = () => { filters.f125 = filters.f125 === b.dataset.filter125 ? null : b.dataset.filter125; $$('[data-filter125]').forEach(x => x.classList.toggle('active', x.dataset.filter125 === filters.f125)); renderStep3(cur()); });
  $('#expand125').onclick = () => { const all = $$('#list125 .section'); const anyClosed = all.some(s => !s.classList.contains('open')); all.forEach(s => { s.classList.toggle('open', anyClosed); if (anyClosed) open125.add(s.dataset.sec); else open125.delete(s.dataset.sec); }); $('#expand125').textContent = anyClosed ? t('collapseAll') : t('expandAll'); };

  // ---------------------------------------------------------------- step 4 (result)
  function renderStep4(a) {
    const e958 = eval958(a); const cls = has125(a) ? clsOf(a) : null; const target = a.facility.target; const ax = has958(a) ? annexFor(a) : null;
    const eT = cls ? eval125(a, target) : null; const best = cls ? bestStar(a) : 0; const gate = has958(a) ? e958.compliant : true;
    const incomplete = e958.unanswered.length > 0 || (cls && progress125(a).answered < progress125(a).total);
    let hero;
    if (cls) {
      const finalStar = gate ? best : 0;
      hero = `<div class="result-hero ${finalStar ? 'pass' : 'fail'}"><div class="stars ${finalStar ? '' : 'none'}">${starStr(finalStar)}</div>
        <h2>${finalStar ? `${esc(t('achieved'))}: ${finalStar}★` : esc(t('notAchieved'))}</h2>
        <div>${has958(a) ? (e958.compliant ? `<span class="badge ok">${esc(t('genReqs'))}: ${esc(t('compliant'))}</span>` : `<span class="badge m">${esc(t('genReqs'))}: ${esc(incomplete && !e958.no.length ? t('incomplete') : t('nonCompliant'))}</span>`) : ''}
        <span class="badge ${eT.achieved && gate ? 'ok' : 'warn'}">${esc(t('fTarget'))} ${starStr(target)}: ${esc(eT.achieved && gate ? t('targetMet') : t('targetNotMet'))}</span></div></div>`;
    } else {
      hero = `<div class="result-hero ${e958.compliant ? 'pass' : 'fail'}"><div class="stars ${e958.compliant ? '' : 'none'}">${e958.compliant ? '✔' : '✖'}</div>
        <h2>${esc(t('genReqs'))}: ${esc(e958.compliant ? t('compliant') : (incomplete && !e958.no.length ? t('incomplete') : t('nonCompliant')))}</h2>
        <div class="small muted">${esc(kindName(a.facility.kind))} — ${esc(t('annex'))} ${ax ? ax.key : ''}</div></div>`;
    }
    let kpis = `<div class="kpis">`;
    if (has958(a)) kpis += `<div class="kpi ${e958.no.length ? 'bad' : (e958.unanswered.length ? 'warn' : 'ok')}"><div class="l">${esc(t('genReqs'))}</div><div class="v">${e958.yes + e958.na.length}/${e958.applicable}</div><div class="small muted">${e958.no.length} ✖ · ${e958.unanswered.length} ${esc(t('unanswered'))}</div></div>`;
    if (eT) kpis += `<div class="kpi ${eT.points >= eT.threshold ? 'ok' : 'bad'}"><div class="l">${esc(t('pointsTotal'))} (${starStr(target)})</div><div class="v">${eT.points} / ${eT.threshold}</div><div class="small muted">${esc(t('shortfall'))}: ${eT.shortfall}</div></div>
      <div class="kpi ${eT.missing.length ? 'bad' : 'ok'}"><div class="l">${esc(t('mandatoryMet'))} (${starStr(target)})</div><div class="v">${eT.mandatory.length - eT.missing.length}/${eT.mandatory.length}</div></div>
      <div class="kpi"><div class="l">${esc(t('progress'))}</div><div class="v">${progress125(a).answered}/${progress125(a).total}</div><div class="small muted">MSt 125</div></div>`;
    kpis += '</div>';
    let starTable = '';
    if (cls) {
      starTable = `<div class="card"><div class="card-title"><h3>${esc(t('starTable'))}</h3><span class="badge info">${esc(clsName(cls))}</span></div><div class="table-wrap"><table class="tbl"><tr><th>${esc(t('star'))}</th><th class="num">${esc(t('mandatoryMet'))}</th><th class="num">${esc(t('points'))}</th><th class="num">${esc(t('threshold'))}</th><th>${esc(t('status'))}</th></tr>` +
        STARS.map(s => { const e = eval125(a, s); const st = e.achieved ? `<span class="badge ok">${esc(t('achievedShort'))}</span>` : (e.missing.length ? `<span class="badge m">${esc(t('missingMandatory'))}: ${e.missing.length}</span>` : `<span class="badge warn">${esc(t('shortfall'))}: ${e.shortfall}</span>`);
          return `<tr class="${s === target ? 'hl' : ''}"><td>${starStr(s)}</td><td class="num">${e.mandatory.length - e.missing.length}/${e.mandatory.length}</td><td class="num">${e.points}</td><td class="num">${e.threshold}</td><td>${st}</td></tr>`; }).join('') + '</table></div></div>';
    }
    let gap = '';
    if (eT && !(eT.achieved && gate)) {
      gap += `<div class="card"><div class="card-title"><h3>${esc(t('gapTitle'))} (${starStr(target)})</h3></div>`;
      if (eT.missing.length) gap += `<p class="small muted"><strong>${esc(t('gapMandatory'))}</strong></p>` + eT.missing.map(i => `<div class="list-item"><a href="#" data-jump125="${esc(i.id)}"><b>${esc(i.label)}</b> ${esc(tr('125:' + i.id, i.text))}</a><span class="pts">${i.points} ${esc(t('pts'))}</span></div>`).join('');
      if (eT.shortfall > 0) {
        const cands = leaves125().filter(i => !satisfied125(i, a) && !(a.a125[i.id] && a.a125[i.id].v === 'yes')).sort((x, y) => y.points - x.points).slice(0, 12);
        gap += `<p class="small muted" style="margin-top:8px"><strong>${esc(t('gapPoints', { n: eT.shortfall }))}</strong></p>` + cands.map(i => `<div class="list-item info"><a href="#" data-jump125="${esc(i.id)}"><b>${esc(i.label)}</b> ${esc(tr('125:' + i.id, i.text))}</a><span class="pts">+${i.points}</span></div>`).join('');
      }
      gap += '</div>';
    }
    let g958 = '';
    if (has958(a) && (e958.no.length || e958.unanswered.length || e958.na.length)) {
      g958 = `<div class="card"><div class="card-title"><h3>${esc(t('genReqs'))}</h3></div>`;
      if (e958.no.length) g958 += `<p class="small muted"><strong>${esc(t('failed958'))} (${e958.no.length})</strong></p>` + e958.no.map(l => `<div class="list-item"><a href="#" data-jump958="${esc(l.id)}"><b>${esc(l.id)}</b> ${esc(tr(`958${ax.key}:${l.id}`, l.leaf.title))}</a></div>`).join('');
      if (e958.unanswered.length) g958 += `<p class="small muted" style="margin-top:8px"><strong>${esc(t('unanswered958'))} (${e958.unanswered.length})</strong></p>` + e958.unanswered.slice(0, 30).map(l => `<div class="list-item warn"><a href="#" data-jump958="${esc(l.id)}"><b>${esc(l.id)}</b> ${esc(tr(`958${ax.key}:${l.id}`, l.leaf.title))}</a></div>`).join('') + (e958.unanswered.length > 30 ? `<div class="small muted">… +${e958.unanswered.length - 30}</div>` : '');
      if (e958.na.length) g958 += `<p class="small muted" style="margin-top:8px"><strong>${esc(t('naFlagged'))} (${e958.na.length})</strong></p>` + e958.na.map(l => `<div class="list-item info"><a href="#" data-jump958="${esc(l.id)}"><b>${esc(l.id)}</b> ${esc(tr(`958${ax.key}:${l.id}`, l.leaf.title))}</a><span class="small">${esc((a.a958[l.id] || {}).note || '')}</span></div>`).join('');
      g958 += '</div>';
    }
    let cats = '';
    if (eT) {
      cats = `<div class="card"><div class="card-title"><h3>${esc(t('byCategory'))}</h3><span class="badge">${eT.points} / ${maxPoints125()}</span></div>` + S125.categories.map(c => { const max = c.items.filter(i => !i.header).reduce((s, i) => s + i.points, 0); const got = eT.byCat[c.id] || 0; return `<div class="cat-bar"><span>${esc(c.id)}. ${esc(tr('125cat:' + c.id, c.name))}</span><span class="mono">${got} / ${max}</span><div class="progress"><span style="width:${max ? Math.round(100 * got / max) : 0}%"></span></div></div>`; }).join('') + '</div>';
    }
    $('#resultView').innerHTML = hero + kpis + starTable + gap + g958 + cats;
  }
  $('#resultView').addEventListener('click', e => {
    const j1 = e.target.closest('[data-jump125]'); const j2 = e.target.closest('[data-jump958]'); if (!j1 && !j2) return; e.preventDefault();
    if (j1) { const id = j1.dataset.jump125; const cat = ITEM125[id].cat.id; open125.add(cat); showStep(3); setTimeout(() => { const el = $(`#i125-${CSS.escape(id)}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--gold)'; setTimeout(() => el.style.outline = '', 2500); } }, 50); }
    if (j2) { const id = j2.dataset.jump958; const l = leaves958(cur()).find(x => x.id === id); if (l) open958.add(l.sec.id); showStep(2); setTimeout(() => { const el = $(`#i958-${CSS.escape(id)}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--gold)'; setTimeout(() => el.style.outline = '', 2500); } }, 50); }
  });
  $('#btnReset').onclick = () => { const a = cur(); if (a && confirm(t('confirmReset'))) { a.a958 = {}; a.a125 = {}; touch(a); renderStep4(a); } };

  // ---------------------------------------------------------------- report
  function buildReportHtml(a, opts) {
    const e958 = eval958(a); const cls = has125(a) ? clsOf(a) : null; const target = a.facility.target; const ax = has958(a) ? annexFor(a) : null;
    const eT = cls ? eval125(a, target) : null; const best = cls ? bestStar(a) : 0; const gate = has958(a) ? e958.compliant : true; const finalStar = gate ? best : 0; const f = a.facility;
    const ansTxt = v => v === 'yes' ? `<span class="yes">${esc(t('yes'))}</span>` : v === 'no' ? `<span class="no">${esc(t('no'))}</span>` : v === 'na' ? `<span class="na">${esc(t('na'))}</span>` : `<span class="none">—</span>`;
    const photos = ans => opts.photos && ans && ans.photos && ans.photos.length ? `<div class="rp-photos">${ans.photos.map(p => `<img src="${p}" alt="">`).join('')}</div>` : '';
    const note = ans => opts.notes && ans && ans.note ? esc(ans.note) : '';
    const basis = typeOf(a) === '958' ? `O‘zMSt 958:2026 «${esc(S958.title)}»` : typeOf(a) === '125' ? `O‘zMSt 125:2024 «${esc(S125.title)}» (${esc(S125.amendment)})` : esc(t('reportBasis'));
    let h = `<div class="rp-head"><div><h1>${esc(t('reportTitle'))} — ${esc(typeLabel(a))}</h1><div class="std">${basis}</div></div><div class="rp-stars">${cls ? starStr(finalStar) : (e958.compliant ? '✔' : '✖')}</div></div>`;
    h += `<div class="rp-info">
      <div><b>${esc(t('fName'))}</b><span>${esc(f.name)}</span></div><div><b>${esc(t('fKind'))}</b><span>${esc(kindName(f.kind))}</span></div>
      <div><b>${esc(t('fAddress'))}</b><span>${esc([f.region, f.address].filter(Boolean).join(', '))}</span></div><div><b>${esc(t('fGroup'))}</b><span>${esc(groupName((kindInfo(f.kind) || {}).group))} (${esc(t('annex'))} ${ax ? ax.key : ''})</span></div>
      <div><b>${esc(t('fRooms'))} / ${esc(t('fBeds'))}</b><span>${esc(f.rooms || '—')} / ${esc(f.beds || '—')}</span></div><div><b>${esc(t('fFloors'))}</b><span>${esc(f.floors || '—')}</span></div>
      <div><b>${esc(t('fContact'))}</b><span>${esc([f.contact, f.phone, f.email].filter(Boolean).join(', ') || '—')}</span></div><div><b>${esc(t('fInspector'))}</b><span>${esc(f.inspector || '—')}</span></div>
      <div><b>${esc(t('fDate'))}</b><span>${esc(fmtDate(f.date))}</span></div><div><b>${esc(t('fTarget'))}</b><span>${cls ? starStr(target) : '—'}</span></div>
      ${(() => { const fl = [['seasonal', 'flagSeasonal'], ['heritage', 'flagHeritage'], ['rural', 'flagRural'], ['naturalWater', 'flagNaturalWater'], ['sensorDoors', 'flagSensorDoors'], ['brand', 'flagBrand']].filter(x => f[x[0]]).map(x => t(x[1])); return fl.length ? `<div style="grid-column:1/-1"><b>${esc(t('fFlags'))}</b><span>${esc(fl.join('; '))}</span></div>` : ''; })()}
    </div>`;
    h += `<div class="rp-verdict">`;
    if (has958(a)) h += `<div class="big ${e958.compliant ? 'ok' : 'bad'}">${esc(t('genReqs'))}: ${esc(e958.compliant ? t('compliant') : (e958.no.length ? t('nonCompliant') : t('incomplete')))} (${e958.yes + e958.na.length}/${e958.applicable}${e958.no.length ? `, ✖ ${e958.no.length}` : ''}${e958.unanswered.length ? `, ${e958.unanswered.length} ${esc(t('unanswered'))}` : ''})</div>`;
    if (cls) h += `<div class="big ${finalStar ? 'ok' : 'bad'}">${finalStar ? `${esc(t('achieved'))}: ${starStr(finalStar)} (${finalStar})` : esc(t('notAchieved'))}</div><div>${esc(t('fTarget'))} ${starStr(target)}: ${esc(eT.achieved && gate ? t('targetMet') : t('targetNotMet'))} — ${esc(t('pointsTotal'))} <b>${eT.points}</b> / ${esc(t('threshold'))} <b>${eT.threshold}</b>; ${esc(t('mandatoryMet'))} <b>${eT.mandatory.length - eT.missing.length}/${eT.mandatory.length}</b></div>`;
    h += '</div>';
    if (cls) {
      h += `<h2>${esc(t('starTable'))} — ${esc(clsName(cls))}</h2><table><tr><th>${esc(t('star'))}</th><th class="c">${esc(t('mandatoryMet'))}</th><th class="c">${esc(t('points'))}</th><th class="c">${esc(t('threshold'))}</th><th>${esc(t('status'))}</th></tr>` +
        STARS.map(s => { const e = eval125(a, s); return `<tr><td>${starStr(s)}</td><td class="c">${e.mandatory.length - e.missing.length}/${e.mandatory.length}</td><td class="c">${e.points}</td><td class="c">${e.threshold}</td><td>${e.achieved ? `<span class="yes">${esc(t('achievedShort'))}</span>` : (e.missing.length ? `<span class="no">${esc(t('missingMandatory'))}: ${e.missing.length}</span>` : `<span class="none">${esc(t('shortfall'))}: ${e.shortfall}</span>`)}</td></tr>`; }).join('') + '</table>';
      if (eT.missing.length) h += `<h2>${esc(t('gapMandatory'))} (${starStr(target)})</h2><table><tr><th>${esc(t('reqNo'))}</th><th>${esc(t('requirement'))}</th><th class="c">${esc(t('points'))}</th></tr>` + eT.missing.map(i => `<tr><td class="c">${esc(i.label)}</td><td>${esc(tr('125:' + i.id, i.text))}</td><td class="c">${i.points}</td></tr>`).join('') + '</table>';
    }
    if (ax && e958.no.length) h += `<h2>${esc(t('failed958'))}</h2><table><tr><th>${esc(t('reqNo'))}</th><th>${esc(t('requirement'))}</th><th>${esc(t('notesCol'))}</th></tr>` + e958.no.map(l => `<tr><td class="c">${esc(l.id)}</td><td>${esc(tr(`958${ax.key}:${l.id}`, l.leaf.title))}${photos(a.a958[l.id])}</td><td>${note(a.a958[l.id])}</td></tr>`).join('') + '</table>';
    if (ax && e958.na.length) h += `<h2>${esc(t('naFlagged'))}</h2><table><tr><th>${esc(t('reqNo'))}</th><th>${esc(t('requirement'))}</th><th>${esc(t('notesCol'))}</th></tr>` + e958.na.map(l => `<tr><td class="c">${esc(l.id)}</td><td>${esc(tr(`958${ax.key}:${l.id}`, l.leaf.title))}</td><td>${note(a.a958[l.id])}</td></tr>`).join('') + '</table>';
    if (opts.full && ax) {
      h += `<h2>${esc(t('detail958'))} — ${esc(tr('958' + ax.key + ':title', ax.annex.title))}</h2><table><tr><th style="width:44px">${esc(t('reqNo'))}</th><th>${esc(t('requirement'))}</th><th class="c" style="width:56px">${esc(t('answer'))}</th><th style="width:22%">${esc(t('notesCol'))}</th></tr>`;
      const leaves = leaves958(a); let lastSec = null, lastPar = null;
      leaves.forEach(l => {
        if (l.sec !== lastSec) { h += `<tr><td class="sec" colspan="4">${esc(l.sec.id)}. ${esc(tr(`958${ax.key}sec:${l.sec.id}`, l.sec.title))}</td></tr>`; lastSec = l.sec; lastPar = null; }
        if (l.parent && l.parent !== lastPar) { h += `<tr><td class="c par">${esc(l.parent.id)}</td><td class="par" colspan="3">${esc(tr(`958${ax.key}:${l.parent.id}`, l.parent.title))}</td></tr>`; }
        lastPar = l.parent; const ans = a.a958[l.id] || {};
        h += `<tr><td class="c">${esc(l.id)}</td><td>${esc(tr(`958${ax.key}:${l.id}`, l.leaf.title))}${l.applies ? '' : ` <i style="color:#777">(${esc(l.reasons.join('; '))})</i>`}${photos(ans)}</td><td class="c">${l.applies ? ansTxt(ans.v) : '<span class="na">n/a</span>'}</td><td>${note(ans)}</td></tr>`;
      });
      h += '</table>';
      if (cls) {
        h += `<h2>${esc(t('detail125'))} — ${esc(clsName(cls))}</h2><table><tr><th style="width:44px">${esc(t('reqNo'))}</th><th>${esc(t('requirement'))}</th><th class="c">${esc(t('points'))}</th><th class="c">${esc(t('mand'))}</th><th class="c">${esc(t('answer'))}</th><th class="c">${esc(t('earned'))}</th><th style="width:18%">${esc(t('notesCol'))}</th></tr>`;
        S125.categories.forEach(c => {
          h += `<tr><td class="sec" colspan="7">${esc(c.id)}. ${esc(tr('125cat:' + c.id, c.name))}</td></tr>`;
          c.items.forEach(i => {
            if (i.header) { h += `<tr><td class="c par">${esc(i.label)}</td><td class="par" colspan="6">${esc(tr('125:' + i.id, i.text))}</td></tr>`; return; }
            const ans = a.a125[i.id] || {}; const ms = mandatoryStars(i, a);
            h += `<tr><td class="c">${esc(i.label)}</td><td>${esc(tr('125:' + i.id, i.text))}${photos(ans)}</td><td class="c">${i.rule ? `${i.rule.per_unit}×/${i.rule.max}` : i.points}</td><td class="c">${ms.length ? ms.join(',') : '—'}</td><td class="c">${ansTxt(ans.v)}${i.rule && ans.qty ? ` (${esc(ans.qty)})` : ''}</td><td class="c">${earned125(i, a)}</td><td>${note(ans)}</td></tr>`;
          });
        });
        h += '</table>';
      }
    }
    // footnotes used in this report
    if (ax) {
      const used = new Set(); leaves958(a).forEach(l => { [].concat(l.sec.notes || [], l.item.notes || [], l.leaf === l.item ? [] : (l.leaf.notes || []), (ax.col != null && l.leaf.marks && l.leaf.marks[ax.col]) ? l.leaf.marks[ax.col].notes : []).forEach(n => used.add(n)); });
      h += `<h2>${esc(t('footnotes'))} — ${esc(tr('958' + ax.key + ':title', ax.annex.title))}</h2><div class="rp-note">` + [...used].sort((x, y) => x - y).map(n => `<div><b>${n}</b> — ${esc(tr(`958${ax.key}note:${n}`, ax.annex.notes[n] || ''))}</div>`).join('') + '</div>';
      h += `<h2>${esc(t('bibliography'))} — ${esc(S958.standard)}</h2><div class="rp-note">` + (S958.references || []).map(r => `<div><b>${esc(r[0])}</b> ${esc(r[1])}</div>`).join('') + Object.keys(S958.bibliography || {}).map(n => `<div><b>[${n}]</b> ${esc(S958.bibliography[n])}</div>`).join('') + '</div>';
    }
    if (cls) {
      const usedAnn = new Set(); leaves125().forEach(i => (i.ann || []).forEach(x => usedAnn.add(x)));
      h += `<h2>${esc(t('footnotes'))} — ${esc(S125.standard)}</h2><div class="rp-note">` + [...usedAnn].sort().map(x => `<div><b>${x}</b> — ${esc(tr('125ann:' + x, S125.annotations[x] || ''))}</div>`).join('') + '</div>';
      h += `<h2>${esc(t('bibliography'))} — ${esc(S125.standard)}</h2><div class="rp-note">` + Object.keys(S125.bibliography || {}).map(n => `<div><b>[${n}]</b> ${esc(S125.bibliography[n])}</div>`).join('') + '</div>';
    }
    h += `<div class="rp-sign"><div>${esc(t('signInspector'))}: ${esc(f.inspector || '')}<br><br>______________________</div><div>${esc(t('signFacility'))}: ${esc(f.contact || '')}<br><br>______________________</div></div>`;
    h += `<div class="rp-foot">${esc(t('generated'))}: ${new Date().toLocaleString()} · ${esc(t('versionNote'))}</div>`;
    return h;
  }
  const reportOpts = () => ({ full: $('#optFull').checked, notes: $('#optNotes').checked, photos: $('#optPhotos').checked });
  function showReport() { const a = cur(); if (!a) return; $('#reportBody').innerHTML = buildReportHtml(a, reportOpts()); document.body.classList.add('printing'); $('#reportView').style.display = 'block'; window.scrollTo({ top: 0 }); }
  function closeReport() { document.body.classList.remove('printing'); $('#reportView').style.display = 'none'; }
  $('#btnReport').onclick = showReport;
  $('#btnCloseReport').onclick = closeReport;
  $('#btnPrint').onclick = () => { showReport(); setTimeout(() => window.print(), 150); };
  $('#btnPrint2').onclick = () => window.print();
  $('#btnJson').onclick = () => exportJson(cur());
  $('#btnExcel').onclick = () => exportExcel(cur());
  $('#btnExcel2').onclick = () => exportExcel(cur());
  $('#btnShare').onclick = () => {
    const a = cur(); const e958 = eval958(a); const cls = has125(a) ? clsOf(a) : null; const eT = cls ? eval125(a, a.facility.target) : null; const best = cls && (has958(a) ? e958.compliant : true) ? bestStar(a) : 0;
    const text = t('shareText', { name: a.facility.name || t('untitled'), result: cls ? (best ? `${t('achieved')} ${starStr(best)}` : t('notAchieved')) : t('genReqs'), pts: eT ? eT.points : '—', thr: eT ? eT.threshold : '—', c: e958.compliant ? t('compliant') : t('nonCompliant') });
    if (navigator.share) navigator.share({ title: t('reportTitle'), text }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(t('copied'), 'success'));
    else window.location.href = 'mailto:?subject=' + encodeURIComponent(t('reportTitle')) + '&body=' + encodeURIComponent(text);
  };

  // ---------------------------------------------------------------- export / import
  function download(name, blob) { const url = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); toast(t('exported'), 'success'); }
  const fileBase = a => ((a.facility.name || 'assessment').replace(/[^\wЀ-ӿ‘’ʻ-]+/g, '_').slice(0, 40)) + '_' + (a.facility.date || todayIso());
  function exportJson(a) { const payload = { app: 'star-rating-v2', version: 2, exportedAt: new Date().toISOString(), assessment: a }; download(fileBase(a) + '.json', new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' })); }
  function importJsonFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result); const list = d.assessment ? [d.assessment] : (Array.isArray(d.assessments) ? d.assessments : null);
        if (!list) throw new Error('bad');
        list.forEach(a => { if (!a.facility) throw new Error('bad'); const c = JSON.parse(JSON.stringify(a)); if (state.assessments.some(x => x.id === c.id)) c.id = uid(); c.a958 = c.a958 || {}; c.a125 = c.a125 || {}; state.assessments.push(c); });
        save(true); renderList(); toast(t('imported'), 'success');
      } catch (e) { toast(t('importError'), 'error'); }
    };
    r.readAsText(file);
  }
  function exportExcel(a) {
    const e958 = eval958(a); const cls = has125(a) ? clsOf(a) : null; const ax = has958(a) ? annexFor(a) : null; const target = a.facility.target; const f = a.facility;
    const summary = [[t('reportTitle') + ' — ' + typeLabel(a)], [], [t('fName'), f.name], [t('fKind'), kindName(f.kind)], [t('fAddress'), [f.region, f.address].filter(Boolean).join(', ')], [t('fRooms'), f.rooms], [t('fBeds'), f.beds], [t('fDate'), f.date], [t('fInspector'), f.inspector], [t('fContact'), [f.contact, f.phone, f.email].filter(Boolean).join(', ')], [],
      ...(has958(a) ? [[t('genReqs'), e958.compliant ? t('compliant') : (e958.no.length ? t('nonCompliant') : t('incomplete')), `${e958.yes + e958.na.length}/${e958.applicable}`]] : [])];
    if (cls) {
      const best = (has958(a) ? e958.compliant : true) ? bestStar(a) : 0; summary.push([t('achieved'), best || t('notAchieved')], [t('fTarget'), target], []);
      summary.push([t('star'), t('mandatoryMet'), t('points'), t('threshold'), t('status')]);
      STARS.forEach(s => { const e = eval125(a, s); summary.push([s, `${e.mandatory.length - e.missing.length}/${e.mandatory.length}`, e.points, e.threshold, e.achieved ? t('achievedShort') : (e.missing.length ? `${t('missingMandatory')}: ${e.missing.length}` : `${t('shortfall')}: ${e.shortfall}`)]); });
    }
    const rows958 = [[t('reqNo'), t('requirement'), 'Applicable', t('answer'), t('notesCol')]];
    if (ax) leaves958(a).forEach(l => { const ans = a.a958[l.id] || {}; rows958.push([l.id, (l.parent ? tr(`958${ax.key}:${l.parent.id}`, l.parent.title) + ' — ' : '') + tr(`958${ax.key}:${l.id}`, l.leaf.title), l.applies ? 'yes' : l.reasons.join('; '), l.applies ? (ans.v || '') : '', ans.note || '']); });
    const rows125 = [[t('reqNo'), 'Category', t('requirement'), t('points'), t('mand'), t('answer'), t('qty'), t('earned'), t('notesCol')]];
    if (cls) ITEMS125.forEach(i => { if (i.header) { rows125.push([i.label, tr('125cat:' + i.cat.id, i.cat.name), tr('125:' + i.id, i.text), '', '', '', '', '', '']); return; } const ans = a.a125[i.id] || {}; rows125.push([i.label, tr('125cat:' + i.cat.id, i.cat.name), tr('125:' + i.id, i.text), i.rule ? `${i.rule.per_unit}x max ${i.rule.max}` : i.points, mandatoryStars(i, a).join(','), ans.v || '', ans.qty || '', earned125(i, a), ans.note || '']); });
    if (window.XLSX) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), t('excelSummary'));
      if (ax) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows958), t('excel958'));
      if (cls) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows125), t('excel125'));
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      download(fileBase(a) + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    } else {
      toast(t('noExcelLib'));
      const csv = [summary, [[]], rows958, [[]], rows125].flat().map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\n');
      download(fileBase(a) + '.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    }
  }

  // ---------------------------------------------------------------- standards page
  let stdCls = 'hotel';
  const linkRefs = (text, prefix) => esc(text).replace(/\[(\d+)\]/g, (m, n) => `<a href="#${prefix}-${n}" class="ref">[${n}]</a>`);
  function markCell(m) { if (!m) return ''; return (m.req ? '+' : '−') + (m.notes && m.notes.length ? `<sup class="fn">${m.notes.join(', ')}</sup>` : ''); }
  function annexTableHtml(key) {
    const an = S958['annex' + key]; const cols = key === 'A' ? an.columns : null; const rules = an.rules || {};
    let h = `<h3 style="margin-top:14px">${esc(tr('958' + key + ':title', an.title))}</h3><div class="table-wrap"><table class="tbl annex"><tr><th>${esc(t('reqNo'))}</th><th>${esc(t('requirement'))}</th>${cols ? cols.map((c, i) => `<th class="num">${esc(tr('958Acol:' + i, c))}</th>`).join('') : ''}</tr>`;
    an.sections.forEach(sec => {
      h += `<tr><td colspan="${2 + (cols ? cols.length : 0)}" style="background:var(--gray-50)"><b>${esc(sec.id)}. ${esc(tr(`958${key}sec:${sec.id}`, sec.title))}</b>${sec.notes.length ? `<sup class="fn">${sec.notes.join(', ')}</sup>` : ''}</td></tr>`;
      sec.items.forEach(it => {
        const supIt = it.notes.length ? `<sup class="fn">${it.notes.join(', ')}</sup>` : '';
        if (it.sub) {
          h += `<tr><td class="mono">${esc(it.id)}</td><td colspan="${1 + (cols ? cols.length : 0)}"><b>${esc(tr(`958${key}:${it.id}`, it.title))}</b>${supIt}</td></tr>`;
          it.sub.forEach(x => { h += `<tr><td class="mono small muted">${esc(x.id)}</td><td>${esc(tr(`958${key}:${x.id}`, x.title))}${x.notes.length ? `<sup class="fn">${x.notes.join(', ')}</sup>` : ''}${x.changed ? ` <span class="badge new">${esc(t('changed'))}</span>` : ''}</td>${cols ? x.marks.map(m => `<td class="num">${markCell(m)}</td>`).join('') : ''}</tr>`; });
        } else {
          h += `<tr><td class="mono">${esc(it.id)}</td><td>${esc(tr(`958${key}:${it.id}`, it.title))}${supIt}${it.changed ? ` <span class="badge new">${esc(t('changed'))}</span>` : ''}</td>${cols ? it.marks.map(m => `<td class="num">${markCell(m)}</td>`).join('') : ''}</tr>`;
        }
      });
    });
    h += '</table></div>';
    h += `<div class="footnotes"><b>${esc(t('footnotes'))}</b>` + Object.keys(an.notes).map(n => `<div id="fn${key}-${n}" class="fn-row"><span class="fn-n">${n}</span><span>${esc(tr(`958${key}note:${n}`, an.notes[n]))}${rules[n] ? ` <span class="badge info">${rules[n].type === 'exempt' ? esc(t('exemptBy', { n })) : esc(t('onlyFor', { n }))}</span>` : ''}</span></div>`).join('') + '</div>';
    return h;
  }
  function renderStandards() {
    const a = cur(); const target = a ? a.facility.target : 0;
    let h = `<div class="card"><div class="card-title"><h2>${esc(S125.standard)} — ${esc(t('stdThresholds'))}</h2></div><p class="small muted">${esc(S125.amendment)}</p><div class="table-wrap"><table class="tbl"><tr><th></th>${STARS.map(s => `<th class="num">${starStr(s)}</th>`).join('')}</tr>` +
      Object.keys(S125.thresholds).map(k => `<tr><td>${esc(clsName(k))}</td>${STARS.map(s => `<td class="num">${S125.thresholds[k].min[s]}</td>`).join('')}</tr>`).join('') + '</table></div></div>';
    // mandatory matrix
    const fake = { facility: { kind: stdCls === 'hotel' ? 'hotel' : stdCls === 'aparthotel' ? 'aparthotel' : 'sanatorium', rooms: '' } };
    h += `<div class="card"><div class="card-title"><h2>${esc(t('stdCompare'))}</h2><select id="stdClsSel" style="width:auto">${Object.keys(S125.thresholds).map(k => `<option value="${k}" ${k === stdCls ? 'selected' : ''}>${esc(clsName(k))}</option>`).join('')}</select></div>
      <p class="small muted">${esc(t('legendM'))}. ${esc(t('starMatrixHint'))}</p><div class="table-wrap"><table class="tbl"><tr><th>${esc(t('reqNo'))}</th><th>${esc(t('requirement'))}</th><th class="num">${esc(t('points'))}</th>${STARS.map(s => `<th class="num">${s}★</th>`).join('')}</tr>`;
    STARS.forEach(() => { });
    const counts = STARS.map(s => leaves125().filter(i => isMandatory(i, s, fake)).length); const mpts = STARS.map(s => leaves125().filter(i => isMandatory(i, s, fake)).reduce((x, i) => x + i.points, 0));
    h += `<tr><td></td><td><b>${esc(t('mandCount'))} / ${esc(t('mandPts'))}</b></td><td></td>${STARS.map((s, k) => `<td class="num"><b>${counts[k]}</b> / ${mpts[k]}</td>`).join('')}</tr>`;
    S125.categories.forEach(c => { h += `<tr><td colspan="${3 + STARS.length}" style="background:var(--gray-50)"><b>${esc(c.id)}. ${esc(tr('125cat:' + c.id, c.name))}</b></td></tr>`; c.items.forEach(i => { const ms = i.header ? [] : mandatoryStars(i, fake); h += `<tr class="${i.header ? '' : ''}"><td class="mono">${esc(i.label)}</td><td>${i.header ? '<b>' : ''}${esc(tr('125:' + i.id, i.text))}${i.ann.length ? ' <span class="small muted">' + i.ann.join(', ') + '</span>' : ''}${i.header ? '</b>' : ''}</td><td class="num">${i.header ? '' : (i.rule ? `${i.rule.per_unit}×/${i.rule.max}` : i.points)}</td>${STARS.map(s => `<td class="num" style="${s === target ? 'background:var(--gold-soft)' : ''}">${ms.includes(s) ? '<b>m</b>' : ''}</td>`).join('')}</tr>`; }); });
    h += '</table></div></div>';
    h += `<div class="card"><div class="card-title"><h2>${esc(t('stdBreakfast'))}</h2></div><p class="small muted">${esc(S125.breakfast.note)}</p><div class="table-wrap"><table class="tbl"><tr><th>${esc(t('product'))}</th><th class="num">${esc(t('categoryI'))}</th><th class="num">${esc(t('categoryII'))}</th><th class="num">${esc(t('categoryIII'))}</th></tr>${S125.breakfast.rows.map(r => `<tr><td>${esc(tr('125bf:' + r[0], r[0]))}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td></tr>`).join('')}</table></div></div>`;
    h += `<div class="card"><div class="card-title"><h2>${esc(t('stdNotes125'))}</h2></div>${Object.keys(S125.annotations).map(k => `<div class="small" style="margin-bottom:4px"><b>${k}</b> — ${esc(tr('125ann:' + k, S125.annotations[k]))}</div>`).join('')}</div>`;
    h += `<div class="card"><div class="card-title"><h2>${esc(S958.standard)} — ${esc(t('stdKinds'))}</h2></div><p class="small muted">${esc(tr('958title', S958.title))} · ${esc(S958.effective)} · ${esc(S958.replaces)} →</p><div class="table-wrap"><table class="tbl"><tr><th>${esc(t('fGroup'))}</th><th>${esc(t('annex'))}</th><th>${esc(t('fKind'))}</th><th>${esc(t('pointsGroup'))}</th></tr>` +
      Object.keys(S958.groups).map(g => `<tr><td>${esc(groupName(g))}</td><td>${S958.groups[g].annex}${S958.groups[g].col != null ? ` (${esc(t('column'))} ${S958.groups[g].col + 1})` : ''}</td><td>${S958.kinds.filter(k => k.group === g).map(k => esc(kindName(k.id))).join(', ')}</td><td>${[...new Set(S958.kinds.filter(k => k.group === g && k.cls).map(k => clsName(k.cls)))].join(', ') || '—'}</td></tr>`).join('') + '</table></div></div>';
    h += `<div class="card"><div class="card-title"><h2>${esc(t('stdNotes958'))}</h2></div>` + ['A', 'B', 'C'].map(ax => `<h3 style="margin-top:10px">${esc(tr('958' + ax + ':title', S958['annex' + ax].title))}</h3>` + Object.keys(S958['annex' + ax].notes).map(n => `<div class="small" style="margin-bottom:3px"><b>${n}</b> — ${esc(tr(`958${ax}note:${n}`, S958['annex' + ax].notes[n]))}</div>`).join('')).join('') + '</div>';
    // normative documents, clauses and annex tables with footnotes
    h += `<div class="card"><div class="card-title"><h2>${esc(t('stdRefs'))}</h2></div><p class="small muted">${esc(t('refNote'))}</p>
      <h3>${esc(t('normRefs'))} — ${esc(S958.standard)}</h3>${(S958.references || []).map(r => `<div class="fn-row"><span class="fn-n" style="min-width:auto"><b>${esc(r[0])}</b></span><span>${esc(r[1])}</span></div>`).join('')}
      <h3 style="margin-top:14px">${esc(t('stdGeneral'))}</h3>${(S958.general || []).map(g => `<div class="fn-row"><span class="fn-n">${esc(g.id)}</span><span>${linkRefs(tr('958gen:' + g.id, g.text), 'bib958')}</span></div>`).join('')}
      <h3 style="margin-top:14px">${esc(t('bibliography'))} — ${esc(S958.standard)}</h3>${Object.keys(S958.bibliography || {}).map(n => `<div class="fn-row" id="bib958-${n}"><span class="fn-n">[${n}]</span><span>${esc(S958.bibliography[n])}</span></div>`).join('')}
      <h3 style="margin-top:14px">${esc(t('clauses125'))}</h3>${(S125.clauses || []).map(g => `<div class="fn-row"><span class="fn-n">${esc(g.id)}</span><span>${linkRefs(tr('125cl:' + g.id, g.text), 'bib125')}</span></div>`).join('')}
      <h3 style="margin-top:14px">${esc(t('bibliography'))} — ${esc(S125.standard)}</h3>${Object.keys(S125.bibliography || {}).map(n => `<div class="fn-row" id="bib125-${n}"><span class="fn-n">[${n}]</span><span>${esc(S125.bibliography[n])}</span></div>`).join('')}
    </div>`;
    h += `<div class="card"><div class="card-title"><h2>${esc(t('stdAnnexTables'))} — ${esc(S958.standard)}</h2></div><p class="small muted">${esc(t('refNote'))}</p>${annexTableHtml('A')}${annexTableHtml('B')}${annexTableHtml('C')}</div>`;
    $('#standardsView').innerHTML = h;
    const sel = $('#stdClsSel'); if (sel) sel.onchange = () => { stdCls = sel.value; renderStandards(); };
  }

  // ---------------------------------------------------------------- auth UI
  let authMode = 'signin';
  function showAuth(mode) {
    authMode = mode; const v = $('#authView'); v.classList.remove('hidden');
    $('#authForm').classList.toggle('hidden', mode === 'pending'); $('#authToggle').parentElement.classList.toggle('hidden', mode === 'pending');
    $('#authPending').classList.toggle('hidden', mode !== 'pending');
    $('#authNameGroup').classList.toggle('hidden', mode !== 'signup');
    $('#authSubmit').textContent = t(mode === 'signup' ? 'signUp' : 'signIn'); $('#authToggle').textContent = t(mode === 'signup' ? 'haveAccount' : 'noAccount');
    $('#authPassword').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $$('#authLang button').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
  }
  function hideAuth() { $('#authView').classList.add('hidden'); }
  function applyUserUi() {
    const box = $('#userBox');
    if (!C.enabled) { box.classList.add('hidden'); $('#tabRegistry').classList.add('hidden'); $('#tabUsers').classList.add('hidden'); return; }
    box.classList.toggle('hidden', !C.user);
    if (C.user) { $('#userName').textContent = (C.profile && (C.profile.full_name || C.profile.email)) || C.user.email; $('#userRole').textContent = t('role' + ((C.profile && C.profile.role) || 'pending').replace(/^./, c => c.toUpperCase())); }
    $('#tabRegistry').classList.toggle('hidden', !C.isAdmin()); $('#tabUsers').classList.toggle('hidden', !C.isAdmin());
  }
  async function enterApp() {
    hideAuth(); applyUserUi();
    if (C.enabled && C.user && !state.assessments.some(a => a.facility.inspector) ) { /* nothing */ }
    await pullFromCloud();
    showPage(state.currentId && cur() ? 'assess' : 'list');
  }
  async function gate() {
    if (!C.enabled) { applyUserUi(); showPage(state.currentId && cur() ? 'assess' : 'list'); return; }
    if (!C.user) { showAuth('signin'); return; }
    if (!C.isActive()) { applyUserUi(); showAuth('pending'); return; }
    await enterApp();
  }
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault(); const email = $('#authEmail').value.trim(); const pw = $('#authPassword').value; const btn = $('#authSubmit'); btn.disabled = true;
    try {
      if (authMode === 'signup') { const r = await C.signUp(email, pw, $('#authName').value.trim()); if (!r.session) { toast(t('checkEmail'), 'success'); showAuth('signin'); return; } }
      else await C.signIn(email, pw);
      await gate();
    } catch (err) { toast(t('authError', { msg: err.message || err }), 'error'); }
    finally { btn.disabled = false; }
  });
  $('#authToggle').onclick = () => showAuth(authMode === 'signup' ? 'signin' : 'signup');
  $('#authForgot').onclick = async () => { const email = $('#authEmail').value.trim(); if (!email) { $('#authEmail').focus(); return; } try { await C.resetPassword(email); toast(t('resetSent'), 'success'); } catch (err) { toast(t('authError', { msg: err.message }), 'error'); } };
  const doSignOut = async () => { await C.signOut(); state.currentId = null; save(true); applyUserUi(); showAuth('signin'); };
  $('#btnSignOut').onclick = doSignOut; $('#authPendingOut').onclick = doSignOut;
  $$('#authLang button').forEach(b => b.onclick = () => { state.lang = b.dataset.lang; save(); applyUiText(); showAuth(authMode); });
  if (C.enabled) C.onAuthChange = () => gate();

  // ---------------------------------------------------------------- registry (admin)
  let registryRows = [];
  const starOf = n => n ? '★'.repeat(n) : '—';
  function registryStatus(r) { if (!r.complete) return ['warn', t('inProgress')]; if (r.compliant_958 === false) return ['m', t('nonCompliant')]; if (r.threshold == null) return ['ok', t('compliant')]; return r.result_star ? ['gold', starOf(r.result_star)] : ['m', t('notAchieved')]; }
  async function renderRegistry(refetch) {
    const box = $('#registryList');
    if (!C.enabled || !C.isAdmin()) { box.innerHTML = ''; return; }
    if (refetch || !registryRows.length) { box.innerHTML = `<div class="card empty">${esc(t('syncing'))}</div>`; try { registryRows = await C.listAll(); } catch (e) { box.innerHTML = `<div class="card empty">${esc(t('cloudError'))}</div>`; return; } }
    const inspectors = [...new Set(registryRows.map(r => r.owner_name).filter(Boolean))].sort();
    const selI = $('#registryInspector'); const curI = selI.value; selI.innerHTML = `<option value="">${esc(t('allInspectors'))}</option>` + inspectors.map(i => `<option value="${esc(i)}" ${i === curI ? 'selected' : ''}>${esc(i)}</option>`).join('');
    const selS = $('#registryStatus'); const curS = selS.value; selS.innerHTML = [['', t('filterAll')], ['progress', t('inProgress')], ['nc', t('nonCompliant')], ['star', t('achieved')], ['nostar', t('notAchieved')]].map(([v, l]) => `<option value="${v}" ${v === curS ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const q = $('#registrySearch').value.trim().toLowerCase();
    const rows = registryRows.filter(r => {
      if (q && !((r.facility_name || '') + ' ' + (r.region || '') + ' ' + kindName(r.facility_kind)).toLowerCase().includes(q)) return false;
      if (curI && r.owner_name !== curI) return false;
      if (curS === 'progress' && r.complete) return false; if (curS === 'nc' && (!r.complete || r.compliant_958)) return false;
      if (curS === 'star' && !r.result_star) return false; if (curS === 'nostar' && (!r.complete || r.result_star || r.threshold == null)) return false;
      return true;
    });
    if (!rows.length) { box.innerHTML = `<div class="card empty">${esc(t('noRows'))}</div>`; return; }
    // group by facility name for history
    const groups = new Map(); rows.forEach(r => { const k = (r.facility_name || t('untitled')).trim().toLowerCase(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    box.innerHTML = [...groups.values()].map(list => {
      list.sort((x, y) => (y.assessed_on || '').localeCompare(x.assessed_on || '') || (y.updated_at || '').localeCompare(x.updated_at || ''));
      const latest = list[0]; const [cls, label] = registryStatus(latest);
      return `<div class="card tight"><div class="registry-row">
        <div><div class="fac" data-fac="${esc(latest.facility_name)}">${esc(latest.facility_name || t('untitled'))} <span class="badge ${cls}">${label}</span></div>
          <div class="meta"><span class="badge info">${esc(latest.assess_type === '125' ? t('type125') : latest.assess_type === '958' ? t('type958') : t('type958') + '+' + t('type125'))}</span><span>${esc(kindName(latest.facility_kind))}</span>${latest.region ? `<span>· ${esc(latest.region)}</span>` : ''}<span>· ${esc(fmtDate(latest.assessed_on))}</span><span>· ${esc(latest.owner_name || '')}</span>${latest.threshold != null ? `<span>· ${latest.points}/${latest.threshold} ${esc(t('pts'))}</span>` : ''}${list.length > 1 ? `<span class="badge info">${esc(t('history'))}: ${list.length}</span>` : ''}</div></div>
        <div class="row"><button class="btn primary sm" data-open="${esc(latest.id)}">${esc(t('openRemote'))}</button><button class="btn danger sm" data-del="${esc(latest.id)}">${esc(t('delete'))}</button></div>
        ${list.length > 1 ? `<div style="grid-column:1/-1" class="table-wrap"><table class="tbl"><tr><th>${esc(t('colDate'))}</th><th>${esc(t('colInspector'))}</th><th>${esc(t('col958'))}</th><th class="num">${esc(t('colPoints'))}</th><th>${esc(t('colStar'))}</th><th></th></tr>${list.map(r => { const [c2, l2] = registryStatus(r); return `<tr><td>${esc(fmtDate(r.assessed_on))}</td><td>${esc(r.owner_name || '')}</td><td>${r.compliant_958 == null ? '—' : (r.complete ? (r.compliant_958 ? '✔' : '✖') : '…')}</td><td class="num">${r.threshold != null ? `${r.points}/${r.threshold}` : '—'}</td><td><span class="badge ${c2}">${l2}</span></td><td><button class="btn sm" data-open="${esc(r.id)}">${esc(t('openRemote'))}</button></td></tr>`; }).join('')}</table></div>` : ''}
      </div></div>`;
    }).join('');
  }
  $('#registryList').addEventListener('click', async e => {
    const o = e.target.closest('[data-open]'); const d = e.target.closest('[data-del]'); const f = e.target.closest('[data-fac]');
    if (f) { $('#registrySearch').value = f.dataset.fac; renderRegistry(); return; }
    if (o) { try { const a = await C.load(o.dataset.open); if (!a) return; const i = state.assessments.findIndex(x => x.id === a.id); a.cloudSyncedAt = a.updatedAt; if (i >= 0) state.assessments[i] = a; else state.assessments.push(a); state.currentId = a.id; state.step = 4; save(true); showPage('assess'); } catch (err) { toast(t('cloudError'), 'error'); } }
    if (d) { if (!confirm(t('confirmDeleteRemote'))) return; try { await C.remove(d.dataset.del); state.assessments = state.assessments.filter(x => x.id !== d.dataset.del); save(true); renderRegistry(true); } catch (err) { toast(t('cloudError'), 'error'); } }
  });
  $('#registrySearch').oninput = () => renderRegistry(); $('#registryStatus').onchange = () => renderRegistry(); $('#registryInspector').onchange = () => renderRegistry();
  $('#btnRegistryRefresh').onclick = () => renderRegistry(true);
  $('#btnRegistryExcel').onclick = () => {
    const rows = [[t('colFacility'), t('colKind'), t('colRegion'), t('colDate'), t('colInspector'), t('col958'), t('colPoints'), t('threshold'), t('fTarget'), t('colStar'), t('status'), t('colUpdated')]];
    registryRows.forEach(r => rows.push([r.facility_name, kindName(r.facility_kind), r.region, r.assessed_on, r.owner_name, r.complete ? (r.compliant_958 ? 'yes' : 'no') : '', r.points, r.threshold, r.target_star, r.result_star, registryStatus(r)[1], (r.updated_at || '').slice(0, 16).replace('T', ' ')]));
    if (window.XLSX) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Registry'); download('registry_' + todayIso() + '.xlsx', new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); }
    else download('registry_' + todayIso() + '.csv', new Blob(['\ufeff' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }));
  };

  // ---------------------------------------------------------------- users (admin)
  async function renderUsers() {
    const box = $('#usersList'); if (!C.enabled || !C.isAdmin()) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="card empty">${esc(t('syncing'))}</div>`;
    let users = []; try { users = await C.listUsers(); } catch (e) { box.innerHTML = `<div class="card empty">${esc(t('cloudError'))}</div>`; return; }
    const roles = [['pending', t('rolePending')], ['inspector', t('roleInspector')], ['admin', t('roleAdmin')]];
    box.innerHTML = `<div class="card">` + users.map(u => `<div class="users-row"><div><div><b>${esc(u.full_name || '—')}</b> ${u.id === C.user.id ? '<span class="badge info">you</span>' : ''}</div><div class="small muted">${esc(u.email)} · ${esc(fmtDate(u.created_at))}</div></div>
      <select data-user="${u.id}" ${u.id === C.user.id ? 'disabled' : ''}>${roles.map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('') + '</div>';
  }
  $('#usersList').addEventListener('change', async e => { const sel = e.target.closest('select[data-user]'); if (!sel) return; try { await C.setRole(sel.dataset.user, sel.value); toast(t('roleSaved'), 'success'); } catch (err) { toast(t('cloudError'), 'error'); } });

  // ---------------------------------------------------------------- misc UI
  let toastTimer;
  function toast(msg, type) { const el = $('#toast'); el.textContent = msg; el.className = 'toast show ' + (type || ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }
  $$('#mainTabs button').forEach(b => b.onclick = () => showPage(b.dataset.page));
  $$('#langSwitch button').forEach(b => b.onclick = () => { state.lang = b.dataset.lang; save(); applyUiText(); const p = $('.page.active').id.replace('page-', ''); showPage(p); });
  window.addEventListener('afterprint', () => { /* keep report open for further actions */ });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('printing')) closeReport(); });

  // ---------------------------------------------------------------- init
  load(); applyUiText();
  (async () => {
    if (C.enabled) { try { await C.init(); } catch (e) { console.warn('cloud init failed', e); } }
    else if (window.CLOUD_CONFIG && (window.CLOUD_CONFIG.url || window.CLOUD_CONFIG.anonKey)) console.warn('Cloud config present but supabase library not loaded');
    await gate();
  })();
})();
