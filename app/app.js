'use strict';

/* ================= データ・定数 ================= */
const DAY_NAMES = ['平日', '土曜', '日祝'];
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const ROUTES = {
  '学園通経由': { mark: '学', key: 'gaku', short: '学園通' },
  '快速': { mark: '快', key: 'kai', short: '快速' },
  '横浜西経由': { mark: '横', key: 'yoko', short: '横浜西' },
  '周船寺経由': { mark: '周', key: 'sus', short: '周船寺' },
  '糸島（前原）': { mark: '前', key: 'ito', short: '糸島' },
};
const rinfo = (r) => ROUTES[r] || { mark: '?', key: 'gaku', short: r };

// 祝日（内閣府公表分）。日祝ダイヤで運行。
const HOLIDAYS = new Set([
  '2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04',
  '2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12',
  '2026-11-03','2026-11-23',
  '2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29','2027-05-03',
  '2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03',
  '2027-11-23',
]);

const CAMPUS = '伊都キャンパス（どこでも）';
const isCampus = (n) => n.startsWith('九大') && n !== '九大学研都市駅';
const POPULAR = [CAMPUS, '九大学研都市駅', '九大ビッグオレンジ', '周船寺', '前原駅北口'];

const ICON_BUS = '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="13.5" rx="3"/><path d="M5 10.5h14M8.5 20.5l1-3.5M15.5 20.5l-1-3.5"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z"/></svg>';
const ICON_CHEV = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg>';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const pad = (n) => String(n).padStart(2, '0');
const fmt = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const disp = (n) => n === CAMPUS ? '伊都キャンパス' : n;
const short = (n) => n === CAMPUS ? '伊都キャンパス' : n.replace(/（.*?）/, '');
const after = (m) => m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}`;

let DATA = null;
const state = {
  from: store.get('from', '九大学研都市駅'),
  to: store.get('to', CAMPUS),
  when: null,            // null = 現在時刻出発 / {mode:'dep'|'arr', day, min}
  off: new Set(store.get('routesOff', [])),
  sort: 'all',
  pane: 'search',
  ttDay: null,
  results: [],
  cur: null,              // 詳細表示中の便
};
let favs = store.get('favs', []);          // [[from, to]]
let hist = store.get('hist', []);          // [[from, to]]
let stopHist = store.get('stopHist', []);  // [name]
let favStops = store.get('favStops', []);  // [name]

// のりば（"1番" など）。データに無ければ空文字
const platOf = (stopEntry) => (DATA.plats && stopEntry[2]) ? DATA.plats[stopEntry[2]] : '';
const platLabel = (p) => p ? (p === '降車場' ? p : `${p}のりば`) : '';

function dayType(date) {
  // 年末年始など、バス会社が別ダイヤを指定している日を優先
  const o = DATA && DATA.dayOverrides && DATA.dayOverrides[ymd(date).replace(/-/g, '')];
  if (o != null) return o;
  const w = date.getDay();
  if (w === 0 || HOLIDAYS.has(ymd(date))) return 2;
  if (w === 6) return 1;
  return 0;
}
function query() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (state.when) return { ...state.when, now, nowMin, live: false };
  return { mode: 'dep', day: dayType(now), min: nowMin, now, nowMin, live: true };
}
const dateLabel = (d) => `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`;

/* ================= 便の検索 ================= */
// [{dep, arr, r, at, dest, t, ai, bi}]（出発順）
function journeys(day, from, to, all) {
  const a = DATA.stops.indexOf(from), b = DATA.stops.indexOf(to);
  const toCampus = to === CAMPUS;
  const out = [];
  if (a < 0 || (b < 0 && !toCampus) || a === b) return out;
  for (const t of DATA.trips) {
    if (t.d !== day || (!all && state.off.has(t.r))) continue;
    let ai = -1, bi = -1;
    for (let k = 0; k < t.s.length; k++) {
      const i = t.s[k][0];
      if (ai < 0) { if (i === a) ai = k; continue; }
      if (toCampus ? isCampus(DATA.stops[i]) : i === b) { bi = k; break; }
    }
    if (ai >= 0 && bi > ai) {
      const fare = DATA.fares ? DATA.fares[`${t.s[ai][0]},${t.s[bi][0]}`] : null;
      out.push({
        dep: t.s[ai][1], arr: t.s[bi][1], r: t.r, at: DATA.stops[t.s[bi][0]], dest: DATA.stops[t.s[t.s.length - 1][0]], t, ai, bi,
        plat: platOf(t.s[ai]), arrPlat: platOf(t.s[bi]), fare: fare ?? null,
      });
    }
  }
  out.sort((x, y) => x.dep - y.dep || x.arr - y.arr);
  return out;
}

const reachCache = new Map();
function reachable(from) {
  if (reachCache.has(from)) return reachCache.get(from);
  const a = DATA.stops.indexOf(from);
  const set = new Set();
  for (const t of DATA.trips) {
    const k = t.s.findIndex(([i]) => i === a);
    if (k < 0) continue;
    for (let j = k + 1; j < t.s.length; j++) {
      const n = DATA.stops[t.s[j][0]];
      set.add(n);
      if (isCampus(n) && !isCampus(from)) set.add(CAMPUS);
    }
  }
  reachCache.set(from, set);
  return set;
}
function fixRoute() {
  const to = reachable(state.from);
  if (!to.has(state.to)) state.to = to.has(CAMPUS) ? CAMPUS : to.has('九大学研都市駅') ? '九大学研都市駅' : [...to][0];
  store.set('from', state.from); store.set('to', state.to);
}

/* ================= 画面遷移（Androidの戻るボタン対応） ================= */
const TAB_OF = { 's-home': 's-home', 's-results': 's-home', 's-detail': 's-home', 's-table': 's-table', 's-more': 's-more' };
let stack = ['s-home'];
const overlays = [];
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.hidden = s.id !== id);
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.t === TAB_OF[id]));
  window.scrollTo(0, 0);
  render();
}
function push(id) { stack.push(id); history.pushState({ n: stack.length }, ''); show(id); }
function openOverlay(el) { el.hidden = false; overlays.push(el); history.pushState({ o: overlays.length }, ''); }
window.addEventListener('popstate', () => {
  if (overlays.length) { overlays.pop().hidden = true; return; }
  if (stack.length > 1) { stack.pop(); show(stack[stack.length - 1]); }
});
const goBack = () => history.back();
const curScreen = () => stack[stack.length - 1];

/* ================= ホーム ================= */
function renderHome() {
  const q = query();
  const fit = (el, n) => { el.style.fontSize = n.length > 11 ? '17px' : n.length > 8 ? '19px' : ''; };
  $('heroDate').textContent = `${dateLabel(q.now)} ${q.now.getHours()}:${pad(q.now.getMinutes())}`;
  $('fromName').textContent = disp(state.from); fit($('fromName'), disp(state.from));
  $('toName').textContent = disp(state.to); fit($('toName'), disp(state.to));
  $('toSub').textContent = state.to === CAMPUS ? 'キャンパス内で最初に着く停留所まで' : '';
  const ICON_CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const ICON_CAL = '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
  $('dayPill').innerHTML = `${ICON_CAL}<b>${DAY_NAMES[q.day]}</b>ダイヤ`;
  $('whenBtn').innerHTML = q.live
    ? `${ICON_CLOCK}<b>今すぐ</b>出発`
    : `${ICON_CLOCK}<b>${fmt(q.min)}</b>${q.mode === 'dep' ? '出発' : '到着'}`;
  const nx = q.live ? journeys(q.day, state.from, state.to).find((j) => j.dep >= q.min) : null;
  $('nextLine').innerHTML = nx
    ? `<div class="nx-l">次のバス</div><div class="nx-t">${fmt(nx.dep)}<small>発</small></div>
       <div class="nx-r">あと <b>${after(nx.dep - q.min)}</b><br>${nx.plat ? `<span class="platchip">${platLabel(nx.plat)}</span> ` : ''}${esc(rinfo(nx.r).short)}・${esc(short(nx.at))} ${fmt(nx.arr)}着</div>`
    : `<div class="nx-msg">${q.live ? '本日の運行は終了しました' : `${DAY_NAMES[q.day]} ${fmt(q.min)} ${q.mode === 'dep' ? '出発' : '到着'}で検索します`}</div>`;

  $('opts').innerHTML = Object.entries(ROUTES).map(([r, v]) =>
    `<button class="opt${state.off.has(r) ? ' off' : ''}" data-r="${r}" style="--c:var(--r-${v.key})"><span class="ic">${v.mark}</span>${v.short}<i>${state.off.has(r) ? 'オフ' : 'オン'}</i></button>`).join('');
  $('opts').querySelectorAll('.opt').forEach((b) => b.onclick = () => {
    const r = b.dataset.r;
    if (state.off.has(r)) state.off.delete(r); else state.off.add(r);
    if (state.off.size === Object.keys(ROUTES).length) { state.off.delete(r); toast('すべてオフにはできません'); }
    store.set('routesOff', [...state.off]); renderHome();
  });

  document.querySelectorAll('.seg-head button').forEach((b) => b.classList.toggle('on', b.dataset.p === state.pane));
  for (const p of ['search', 'hist', 'favs']) $('p-' + p).hidden = p !== state.pane;
  if (state.pane === 'hist') renderPairList($('histList'), hist, '検索履歴はまだありません');
  if (state.pane === 'favs') renderPairList($('favList'), favs, '便の詳細画面の「お気に入り」で追加できます', true);
}

function renderPairList(ul, pairs, empty, isFav) {
  const { day, min } = query();
  ul.innerHTML = pairs.map(([f, t], i) => {
    const nx = journeys(day, f, t).find((j) => j.dep >= min);
    return `<li><div class="row"><span class="ico">${ICON_BUS}</span>
      <button class="nm" data-i="${i}">${esc(short(f))} → ${esc(short(t))}<small>${nx ? `次 ${fmt(nx.dep)}発（あと${after(nx.dep - min)}）` : '本日の便は終了'}</small></button>
      ${isFav ? `<button class="star on" data-del="${i}" aria-label="登録解除">${ICON_STAR}</button>` : ''}</div></li>`;
  }).join('') || `<li class="empty">${empty}</li>`;
  ul.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
    const [f, t] = pairs[+b.dataset.i]; state.from = f; state.to = t; fixRoute(); search();
  });
  ul.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    favs.splice(+b.dataset.del, 1); store.set('favs', favs); renderHome(); toast('登録を解除しました');
  });
}

function search() {
  hist = [[state.from, state.to], ...hist.filter(([a, b]) => !(a === state.from && b === state.to))].slice(0, 15);
  store.set('hist', hist);
  state.sort = 'all';
  if (curScreen() === 's-results') show('s-results'); else push('s-results');
}

/* ================= 停留所検索 ================= */
let searchTarget = 'from';
function openSearch(target) {
  searchTarget = target;
  $('q').value = '';
  $('q').placeholder = target === 'from' ? '乗る停留所' : '降りる停留所';
  renderSearch();
  openOverlay($('search'));
  setTimeout(() => $('q').focus(), 50);
}
function candidates() {
  if (searchTarget === 'from') return DATA.stops.filter((s) => reachable(s).size);
  return [...reachable(state.from)];
}
function renderSearch() {
  const cand = candidates();
  const qv = $('q').value.trim();
  const row = (n) => `<li><div class="row"><span class="ico${isCampus(n) || n === CAMPUS ? ' camp' : ''}">${n === CAMPUS ? ICON_PIN : ICON_BUS}</span>
    <button class="nm" data-pick="${esc(n)}">${esc(disp(n))}${n === CAMPUS ? '<small>キャンパス内で最初に着く停留所</small>' : ''}</button>
    <button class="star${favStops.includes(n) ? ' on' : ''}" data-star="${esc(n)}" aria-label="お気に入り">${ICON_STAR}</button></div></li>`;
  let html = '';
  if (qv) {
    const norm = (s) => s.replace(/[（）()\s]/g, '');
    const hits = cand.filter((n) => norm(disp(n)).includes(norm(qv)));
    html = `<div class="s-sec">「${esc(qv)}」の候補</div><ul class="list">${hits.map(row).join('') || '<li class="empty">見つかりませんでした</li>'}</ul>`;
  } else {
    const chips = [...new Set([...favStops, ...POPULAR])].filter((n) => cand.includes(n));
    html += `<div class="s-sec">お気に入り／よく使う</div><div class="chips">${chips.map((n) => `<button data-pick="${esc(n)}">${esc(disp(n))}</button>`).join('')}</div>`;
    const h = stopHist.filter((n) => cand.includes(n));
    if (h.length) html += `<div class="s-sec">入力履歴<button class="act" id="clrStopHist">削除</button></div><ul class="list">${h.map(row).join('')}</ul>`;
    const camp = cand.filter((n) => isCampus(n)).sort((x, y) => x.localeCompare(y, 'ja'));
    const others = cand.filter((n) => !isCampus(n) && n !== CAMPUS).sort((x, y) => x.localeCompare(y, 'ja'));
    if (camp.length) html += `<div class="s-sec">伊都キャンパス内のバス停</div><ul class="list">${camp.map(row).join('')}</ul>`;
    if (others.length) html += `<div class="s-sec">その他のバス停</div><ul class="list">${others.map(row).join('')}</ul>`;
  }
  $('searchBody').innerHTML = html;
  $('searchBody').querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => pickStop(b.dataset.pick));
  $('searchBody').querySelectorAll('[data-star]').forEach((b) => b.onclick = () => {
    const n = b.dataset.star;
    favStops = favStops.includes(n) ? favStops.filter((x) => x !== n) : [n, ...favStops];
    store.set('favStops', favStops); renderSearch();
  });
  const clr = $('clrStopHist');
  if (clr) clr.onclick = () => { stopHist = []; store.set('stopHist', []); renderSearch(); };
}
function pickStop(n) {
  if (n !== CAMPUS) { stopHist = [n, ...stopHist.filter((x) => x !== n)].slice(0, 8); store.set('stopHist', stopHist); }
  if (searchTarget === 'from') state.from = n; else state.to = n;
  fixRoute();
  goBack();
  setTimeout(render, 0);
}

/* ================= 日時指定 ================= */
function openWhen() {
  const q = query();
  setSeg('wMode', 'm', q.mode);
  setSeg('wDay', 'd', String(q.day));
  $('wTime').value = `${pad(Math.floor(q.min / 60))}:${pad(q.min % 60)}`;
  openOverlay($('whenSheet'));
}
function setSeg(id, key, val) { $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[key] === val)); }
function segVal(id, key) { return $(id).querySelector('button.on').dataset[key]; }

/* ================= 検索結果（縦軸＝時刻） ================= */
function renderResults() {
  const q = query();
  $('resTitle').textContent = `${short(state.from)} → ${short(state.to)}`;
  $('resSub').textContent = `${q.live ? dateLabel(q.now) + ' ' : DAY_NAMES[q.day] + 'ダイヤ '}${fmt(q.min)} ${q.mode === 'dep' ? '出発' : '到着'}`;
  document.querySelectorAll('#sortTabs button').forEach((b) => b.classList.toggle('on', b.dataset.s === state.sort));

  const list = journeys(q.day, state.from, state.to);
  let js = q.mode === 'dep' ? list.filter((j) => j.dep >= q.min).slice(0, 10) : list.filter((j) => j.arr <= q.min).slice(-8);
  state.results = js;
  if (!js.length) {
    $('cols').innerHTML = `<p class="cols-empty">${q.mode === 'dep' ? 'この時刻以降の便はありません' : 'この時刻までに着く便はありません'}<br>${DAY_NAMES[q.day]}ダイヤ</p>`;
    return;
  }

  const avail = Math.max(320, window.innerHeight - 190);
  const minDur = Math.min(...js.map((j) => j.arr - j.dep));
  const room = avail - 120;
  let ppm = Math.min(7, 90 / minDur);
  let t0, t1;
  // 少なくとも3本は画面に収まるよう縮尺を下げる（下限 2px/分）
  if (q.mode === 'dep') {
    t0 = js[0].dep - q.min <= 40 ? q.min : js[0].dep - 6;
    const span3 = Math.max(...js.slice(0, 3).map((j) => j.arr)) - t0;
    ppm = Math.max(2, Math.min(ppm, room / span3));
    js = js.filter((j, i) => i < 3 || (j.arr - t0) * ppm <= room);
    t1 = Math.max(...js.map((j) => j.arr));
  } else {
    t1 = q.min;
    const span3 = t1 - Math.min(...js.slice(-3).map((j) => j.dep));
    ppm = Math.max(2, Math.min(ppm, room / span3));
    js = js.filter((j, i) => i >= js.length - 3 || (t1 - j.dep) * ppm <= room);
    t0 = Math.min(...js.map((j) => j.dep)) - 2;
  }
  const TOP = 68, y = (t) => TOP + (t - t0) * ppm;
  const H = Math.ceil(y(t1) + 80);
  const minArr = Math.min(...js.map((j) => j.arr));
  const minD = Math.min(...js.map((j) => j.arr - j.dep));
  if (state.sort === 'fast') js = [...js].sort((x, z) => x.arr - z.arr || x.dep - z.dep);
  if (state.sort === 'short') js = [...js].sort((x, z) => (x.arr - x.dep) - (z.arr - z.dep) || x.dep - z.dep);

  const line = q.min >= t0 && q.min <= t1 + 1
    ? `<i class="now" style="top:${y(q.min)}px"></i><span class="nowtk" style="top:${y(q.min)}px">${fmt(q.min)}</span>` : '';
  const cols = js.map((j, k) => {
    const r = rinfo(j.r);
    const h = (j.arr - j.dep) * ppm;
    const tags = (j.arr === minArr ? '<i class="tg t-fast">最速</i>' : '') + (j.arr - j.dep === minD ? '<i class="tg t-short">最短</i>' : '');
    return `<article class="col" style="--c:var(--r-${r.key})">
      <div class="c-top" style="top:${y(j.dep) - (j.plat ? 64 : 46)}px">${j.plat ? `<div class="c-plat">${esc(j.plat)}</div>` : ''}<div class="c-dur">${j.arr - j.dep}分</div><div class="c-dep">${fmt(j.dep)}</div></div>
      <div class="pill" style="top:${y(j.dep) - 14}px;height:${h + 28}px">
        <span class="node">${r.mark}</span><span class="seg"></span>
        ${h >= 52 ? `<span class="lname">${esc(r.short)}</span><span class="seg"></span>` : ''}
        <span class="endmark">${ICON_BUS}</span>
      </div>
      <div class="c-bot" style="top:${y(j.arr) + 18}px">
        <div class="c-arr">${fmt(j.arr)}</div>
        ${j.fare ? `<div class="c-fare">${j.fare}円</div>` : ''}
        ${q.live ? `<div class="c-wait">あと${after(Math.max(0, j.dep - q.nowMin))}</div>` : ''}
        <div class="c-tags">${tags}</div>
      </div>
      <button class="col-hit" data-k="${k}" aria-label="${fmt(j.dep)}発の詳細"></button>
    </article>`;
  }).join('');
  $('cols').innerHTML = `<div class="tl-inner" style="height:${H}px"><div class="grid">${line}</div>${cols}</div>`;
  $('cols').querySelectorAll('.col-hit').forEach((b) => b.onclick = () => openDetail(js[+b.dataset.k]));
}

/* ================= 経路詳細 ================= */
function openDetail(j) { state.cur = j; state.midOpen = false; push('s-detail'); }
function renderDetail() {
  const j = state.cur;
  if (!j) return;
  const q = query();
  const r = rinfo(j.r);
  $('detTitle').textContent = `${fmt(j.dep)} → ${fmt(j.arr)}`;
  $('detSub').textContent = q.live ? `${dateLabel(q.now)}・${DAY_NAMES[q.day]}ダイヤ` : `${DAY_NAMES[q.day]}ダイヤ`;
  const mids = j.t.s.slice(j.ai + 1, j.bi);
  const isFav = favs.some(([a, b]) => a === state.from && b === state.to);
  const idx = state.results.indexOf(j);
  $('detail').innerHTML = `
    <div class="route" style="--c:var(--r-${r.key})">
      <div class="rt-row dep">
        <div class="rt-time">${fmt(j.dep)}<small>発</small></div>
        <div class="rt-mk"><i class="dot"></i></div>
        <div class="rt-body">
          <div class="rt-lbl">乗る</div>
          <div class="rt-name">${esc(DATA.stops[j.t.s[j.ai][0]])}</div>
          <div class="rt-tags">${j.plat ? `<span class="platchip">${esc(platLabel(j.plat))}</span>` : ''}${j.ai === 0 ? '<span class="tagsoft">始発</span>' : ''}
            <button class="chip" id="chgTime">出発時刻を変更 ${ICON_CHEV}</button></div>
        </div>
      </div>
      <div class="rt-row leg2">
        <div class="rt-time"></div>
        <div class="rt-mk"></div>
        <div class="rt-body">
          <div class="rt-badge"><span class="bi">${ICON_BUS}</span>${esc(j.r)}</div>
          <div class="rt-line">昭和バス 九州大学線 ・ <b>${esc(short(j.dest))}</b> 行</div>
          <div class="rt-meta">乗車 <b>${j.arr - j.dep}分</b>　<b>${mids.length + 1}</b> 停留所先で降りる</div>
          ${mids.length ? `<button class="mid-toggle${state.midOpen ? ' open' : ''}" id="midT">途中の停留所（${mids.length}）${ICON_DOWN}</button>` : ''}
        </div>
      </div>
      ${state.midOpen ? mids.map(([i, m]) => `<div class="rt-row mid"><div class="rt-time">${fmt(m)}</div><div class="rt-mk"><i class="sdot"></i></div><div class="rt-body"><div class="rt-name">${esc(DATA.stops[i])}</div></div></div>`).join('') : ''}
      <div class="rt-row arr">
        <div class="rt-time">${fmt(j.arr)}<small>着</small></div>
        <div class="rt-mk"><i class="dot"></i></div>
        <div class="rt-body">
          <div class="rt-lbl">降りる</div>
          <div class="rt-name">${esc(j.at)}</div>
          ${j.arrPlat ? `<div class="rt-tags"><span class="platchip soft">${esc(platLabel(j.arrPlat))}に到着</span></div>` : ''}
        </div>
      </div>
    </div>
    <div class="summary">
      <div class="big">所要<b>${j.arr - j.dep}</b>分　乗換<b>0</b>回${j.fare ? `　<b>${j.fare}</b>円` : ''}</div>
      <div class="sub">${esc(short(state.from))} ${fmt(j.dep)}発 → ${esc(short(j.at))} ${fmt(j.arr)}着</div>
    </div>
    <div class="d-btns">
      <button id="dPrev"${idx <= 0 ? ' disabled style="opacity:.4"' : ''}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>前の便</button>
      <button id="dFav"><svg viewBox="0 0 24 24" style="${isFav ? 'fill:#f1b400;stroke:#f1b400' : ''}"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z"/></svg>${isFav ? 'お気に入り済み' : 'お気に入り'}</button>
      <button id="dNext"${idx < 0 || idx >= state.results.length - 1 ? ' disabled style="opacity:.4"' : ''}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>次の便</button>
    </div>
    <p class="d-note">時刻は昭和バスの公表ダイヤです。道路状況により遅れることがあります。</p>`;
  $('chgTime').onclick = () => openTTSheet(state.from, state.to, q.day);
  const mt = $('midT');
  if (mt) mt.onclick = () => { state.midOpen = !state.midOpen; renderDetail(); };
  $('dFav').onclick = () => {
    const i = favs.findIndex(([a, b]) => a === state.from && b === state.to);
    if (i >= 0) { favs.splice(i, 1); toast('登録を解除しました'); } else { favs.unshift([state.from, state.to]); toast('お気に入りに追加しました'); }
    store.set('favs', favs); renderDetail();
  };
  $('dPrev').onclick = () => { if (idx > 0) { state.cur = state.results[idx - 1]; renderDetail(); } };
  $('dNext').onclick = () => { if (idx >= 0 && idx < state.results.length - 1) { state.cur = state.results[idx + 1]; renderDetail(); } };
}

/* ================= 時刻表 ================= */
function renderTT(el, from, to, day, onPick) {
  const q = query();
  const list = journeys(day, from, to, true);
  const isToday = q.live && day === q.day;
  const nxt = isToday ? list.find((j) => j.dep >= q.nowMin) : null;
  const platSet = [...new Set(list.map((j) => j.plat).filter(Boolean))].sort();
  const multiPlat = platSet.length > 1;
  const byHour = new Map();
  list.forEach((j) => { const h = Math.floor(j.dep / 60); if (!byHour.has(h)) byHour.set(h, []); byHour.get(h).push(j); });
  let html = '';
  for (const [h, js] of byHour) {
    html += `<div class="ttrow"><div class="hr">${h}</div><div class="mins">${js.map((j) => {
      const r = rinfo(j.r);
      const cls = isToday && j.dep < q.nowMin ? 'past' : j === nxt ? 'nx' : '';
      return `<button class="${cls}" data-k="${list.indexOf(j)}"><sup style="color:var(--r-${r.key})">${r.mark}</sup><span class="m">${pad(j.dep % 60)}</span>${multiPlat && j.plat ? `<span class="pl">${esc(j.plat)}</span>` : ''}</button>`;
    }).join('')}</div></div>`;
  }
  const used = [...new Set(list.map((j) => j.r))];
  el.innerHTML = html
    ? html + `<div class="legend">${used.map((r) => `<b style="color:var(--r-${rinfo(r).key})">${rinfo(r).mark}</b>${esc(r)}`).join('　')}<br>${platSet.length ? `のりば：${platSet.map(platLabel).join('・')}${multiPlat ? '（各時刻の下に表示）' : ''}<br>` : ''}全${list.length}本・時刻をタップで詳細</div>`
    : '<p class="none">この区間・曜日の便はありません</p>';
  el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => onPick(list[+b.dataset.k]));
  if (nxt) { const b = el.querySelector('.nx'); if (b) setTimeout(() => b.scrollIntoView({ block: 'center' }), 0); }
}

function openTTSheet(from, to, day) {
  const q = query();
  $('shTag').textContent = `${DAY_NAMES[day]}ダイヤ`;
  $('shTitle').textContent = `${short(from)} 発の時刻表`;
  $('shSub').textContent = `${short(to)} 方面${q.live ? '・' + dateLabel(q.now) : ''}・時刻をタップでその便に変更`;
  openOverlay($('ttSheet'));
  renderTT($('shTable'), from, to, day, (j) => {
    state.when = { mode: 'dep', day, min: j.dep };
    goBack();
    setTimeout(() => {
      renderResults(); // 選んだ時刻で結果を作り直す
      if (curScreen() === 's-detail') { state.cur = state.results.find((x) => x.t === j.t) || j; renderDetail(); }
    }, 0);
  });
}

function renderTable() {
  const q = query();
  const d = state.ttDay ?? q.day;
  $('ttFrom').textContent = short(state.from);
  $('ttTo').textContent = short(state.to);
  $('ttDays').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.d === d));
  renderTT($('ttMain'), state.from, state.to, d, (j) => {
    state.when = { mode: 'dep', day: d, min: j.dep };
    stack = ['s-home'];
    show('s-home');
    renderResults();
    openDetail(state.results.find((x) => x.t === j.t) || j);
  });
}

/* ================= 共通 ================= */
function render() {
  if (!DATA) return;
  const id = curScreen();
  if (id === 's-home') renderHome();
  if (id === 's-results') renderResults();
  if (id === 's-detail') renderDetail();
  if (id === 's-table') renderTable();
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 1800);
}

async function main() {
  try {
    DATA = await (await fetch('data/timetable.json', { cache: 'no-cache' })).json();
  } catch (e) {
    $('nextLine').textContent = '時刻表データを読み込めませんでした。通信状態を確認してください。';
    return;
  }
  const ymdJa = (s) => s.replace(/(\d{4})(\d{2})(\d{2})/, '$1年$2月$3日');
  $('source').textContent = `データ：${DATA.source}／${ymdJa(DATA.fetchedFor)}改正ダイヤ${DATA.validUntil ? `（${ymdJa(DATA.validUntil)}まで有効）` : ''}`;
  // 以前のデータの停留所名（例：周船寺（バス））を新しい名前に寄せ、見つからないものは除く
  const known = (n) => n === CAMPUS || DATA.stops.includes(n);
  const fixName = (n) => known(n) ? n : known(n.replace(/（.*?）|［.*?］/g, '')) ? n.replace(/（.*?）|［.*?］/g, '') : null;
  state.from = fixName(state.from) || '九大学研都市駅';
  state.to = fixName(state.to) || CAMPUS;
  const fixPairs = (ps) => ps.map(([a, b]) => [fixName(a), fixName(b)]).filter(([a, b]) => a && b);
  favs = fixPairs(favs); hist = fixPairs(hist);
  stopHist = stopHist.map(fixName).filter(Boolean); favStops = favStops.map(fixName).filter(Boolean);
  store.set('favs', favs); store.set('hist', hist); store.set('stopHist', stopHist); store.set('favStops', favStops);
  fixRoute();
  history.replaceState({ n: 1 }, '');

  document.querySelectorAll('.seg-head button').forEach((b) => b.onclick = () => { state.pane = b.dataset.p; renderHome(); });
  $('fromBtn').onclick = () => openSearch('from');
  $('toBtn').onclick = () => openSearch('to');
  $('ttFrom').onclick = () => openSearch('from');
  $('ttTo').onclick = () => openSearch('to');
  $('swap').onclick = () => {
    const f = state.from, t = state.to;
    state.from = t === CAMPUS ? '九大ビッグオレンジ' : t;
    state.to = f;
    fixRoute(); renderHome();
  };
  $('dayPill').onclick = openWhen;
  $('whenBtn').onclick = openWhen;
  $('goBtn').onclick = search;
  $('q').oninput = renderSearch;
  $('searchClose').onclick = goBack;
  document.querySelectorAll('[data-back]').forEach((b) => b.onclick = goBack);
  document.querySelectorAll('[data-close]').forEach((b) => b.onclick = goBack);
  document.querySelectorAll('.sheet-wrap').forEach((w) => w.onclick = (e) => { if (e.target === w) goBack(); });
  $('wMode').onclick = (e) => { const b = e.target.closest('button'); if (b) setSeg('wMode', 'm', b.dataset.m); };
  $('wDay').onclick = (e) => { const b = e.target.closest('button'); if (b) setSeg('wDay', 'd', b.dataset.d); };
  $('wNow').onclick = () => { state.when = null; goBack(); setTimeout(render, 0); };
  $('wOk').onclick = () => {
    const [h, m] = ($('wTime').value || '0:0').split(':').map(Number);
    state.when = { mode: segVal('wMode', 'm'), day: +segVal('wDay', 'd'), min: h * 60 + m };
    goBack(); setTimeout(render, 0);
  };
  $('sortTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { state.sort = b.dataset.s; renderResults(); } };
  $('ttDays').onclick = (e) => { const b = e.target.closest('button'); if (b) { state.ttDay = +b.dataset.d; renderTable(); } };
  $('shareBtn').onclick = async () => {
    const j = state.cur; if (!j) return;
    const text = `${short(state.from)} ${fmt(j.dep)}発 → ${short(j.at)} ${fmt(j.arr)}着（昭和バス ${j.r}・${short(j.dest)}行）`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('コピーしました'); } } catch {}
  };
  $('clearHist').onclick = () => { hist = []; store.set('hist', []); toast('検索履歴を削除しました'); };
  document.querySelectorAll('.tabbar button').forEach((b) => b.onclick = () => {
    while (overlays.length) overlays.pop().hidden = true;
    stack = [b.dataset.t];
    show(b.dataset.t);
  });

  render();
  setInterval(() => { if (curScreen() === 's-home' && !overlays.length) renderHome(); }, 15000);
  setInterval(() => { if (state.when == null && curScreen() === 's-results') renderResults(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
main();
