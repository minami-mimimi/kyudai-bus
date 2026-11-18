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
  '筑肥線': { mark: '筑', key: 'jr', short: '筑肥線', train: true },
  '筑肥線（空港線直通）': { mark: '直', key: 'jr', short: '空港線直通', train: true },
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
const POPULAR = [CAMPUS, '九大学研都市駅', '九大ビッグオレンジ', '姪浜駅', '天神駅', '博多駅', '周船寺', '前原駅北口'];
// 乗り換えにかかる時間（分）。電車→バスは駅の改札から北口のバス乗り場まで歩く分を見込む
const XFER = { trainBus: 4, trainTrain: 2 };
const HUB = '九大学研都市駅';
// 九州大学の授業時間（分）。1限 8:40〜10:10 … 5限 16:40〜18:10
const PERIODS = [[1, 520, 610], [2, 630, 720], [3, 780, 870], [4, 890, 980], [5, 1000, 1090]];
const margin = () => store.get('margin', 10);   // バス停⇔教室の余裕（分）
const BACK_DEFAULT = '九大ビッグオレンジ';
// 今日（または指定日）の時間割。授業がなければ null
function todaySched(d = new Date()) {
  const x = sched[d.getDay()];
  return x && (x[0] || x[1]) ? [x[0] || x[1], x[1] || x[0]] : null;
}
const toCampusTrip = () => state.to === CAMPUS || isCampus(state.to);
const fromCampusTrip = () => isCampus(state.from) && !toCampusTrip();
// その便がどの授業に関係するか：行きは「◯限の何分前に着く」、帰りは「◯限が終わって何分後に出る」
function classInfo(j) {
  // 時間割があれば、今日の最初の授業（行き）を基準に「何分前／何分遅刻」
  const ts = state.dir === 'go' && query().live ? todaySched() : null;
  if (ts) {
    const range = PERIODS.slice(ts[0] - 1, ts[1]);
    const p = range.find(([, st]) => st >= j.arr);
    if (p) {
      const [n, st] = p, d = st - j.arr;
      if (d > 90) return null;  // 早すぎる便には付けない
      return { n, text: `${n}限 ${d}分前`, long: `${n}限（${fmt(st)}〜）の${d}分前に到着`, tight: d < margin() };
    }
    // 最後の授業にも間に合わない：その授業への遅れを30分以内なら表示
    const [n, st] = range[range.length - 1], d = j.arr - st;
    return d <= 30 ? { n, text: `${n}限 ${d}分遅刻`, long: `${n}限（${fmt(st)}〜）に${d}分遅れて到着`, tight: true, late: true } : null;
  }
  if (toCampusTrip()) {
    const p = PERIODS.find(([, st]) => st >= j.arr);
    if (!p || p[1] - j.arr > 100) return null;
    const before = p[1] - j.arr;
    return { n: p[0], text: `${p[0]}限 ${before}分前`, long: `${p[0]}限（${fmt(p[1])}〜）の${before}分前に到着`, tight: before < margin() };
  }
  if (fromCampusTrip()) {
    const p = [...PERIODS].reverse().find(([, , en]) => en <= j.dep);
    if (!p || j.dep - p[2] > 70) return null;
    const aft = j.dep - p[2];
    return { n: p[0], text: `${p[0]}限後 +${aft}分`, long: `${p[0]}限（〜${fmt(p[2])}）が終わって${aft}分後に出発`, tight: aft < margin() };
  }
  return null;
}

const ICON_BUS = '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="13.5" rx="3"/><path d="M5 10.5h14M8.5 20.5l1-3.5M15.5 20.5l-1-3.5"/></svg>';
const ICON_TRAIN = '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="14" rx="3.5"/><path d="M6 10h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9.5" cy="13.5" r=".9"/><circle cx="14.5" cy="13.5" r=".9"/></svg>';
const ICON_WALK = '<svg viewBox="0 0 24 24"><circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6 3 3v3M9 12l2-4.5 3 2.5 3 1M11 7.5L8 10v3"/></svg>';
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
const fmt = (m) => `${Math.floor(m / 60) % 24}:${pad(m % 60)}`;  // 24時以降は 0:xx と表示
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const disp = (n) => n === CAMPUS ? '伊都キャンパス' : n;
const short = (n) => n === CAMPUS ? '伊都キャンパス' : n.replace(/（.*?）/, '');
const after = (m) => m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}`;

let DATA = null;
let TRAIN_STOPS = new Set();   // 電車の駅（九大学研都市駅はバス停と共通）
let BUS_STOPS = new Set();
const state = {
  from: store.get('from', '九大学研都市駅'),
  to: store.get('to', CAMPUS),
  when: null,            // null = 現在時刻出発 / {mode:'dep'|'arr', day, min}
  off: new Set(store.get('routesOff', [])),
  sort: 'all',
  pane: 'search',
  ttDay: null,
  results: [],
  cur: null,
  midOpen: new Set(),
};
let favs = store.get('favs', []);
let hist = store.get('hist', []);
let stopHist = store.get('stopHist', []);
let favStops = store.get('favStops', []);
let commute = store.get('commute', null);   // 通学ルート {home, to, back}
let sched = store.get('sched', {});          // 時間割 {曜日(0=日): [最初の限, 最後の限]}（0 = なし）
let usage = store.get('usage', {});          // よく調べる区間 {'from|to': 回数}

// 停車情報 [停留所, 発車(分), のりば, 到着(分・発車と違うときだけ)]
const arrOf = (e) => e[3] ?? e[1];
const platOf = (e) => (DATA.plats && e[2]) ? DATA.plats[e[2]] : '';
const platLabel = (p) => p ? (p === '降車場' ? p : `${p}のりば`) : '';
const isTrain = (t) => t.m === 1;
// 行先。電車は九大学研都市より先を持っていないので、記録した行先か方面で示す
const destOf = (t) => t.h || (isTrain(t) && DATA.stops[t.s[t.s.length - 1][0]] === HUB ? '筑前前原・唐津方面' : DATA.stops[t.s[t.s.length - 1][0]]);

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

/* ================= 経路の検索 ================= */
function makeLeg(t, ai, bi) {
  const fare = DATA.fares && !isTrain(t) ? DATA.fares[`${t.s[ai][0]},${t.s[bi][0]}`] : null;
  return {
    t, ai, bi, r: t.r, train: isTrain(t),
    dep: t.s[ai][1], arr: arrOf(t.s[bi]),
    from: DATA.stops[t.s[ai][0]], at: DATA.stops[t.s[bi][0]], dest: destOf(t),
    plat: platOf(t.s[ai]), arrPlat: platOf(t.s[bi]), fare: fare ?? null,
  };
}
function makeJourney(legs) {
  const f = legs[0], l = legs[legs.length - 1];
  const busFare = legs.filter((x) => !x.train).reduce((s, x) => s + (x.fare || 0), 0);
  return {
    legs, dep: f.dep, arr: l.arr, r: f.r, plat: f.plat, at: l.at, dest: l.dest,
    fare: legs.every((x) => !x.train && x.fare) ? busFare : null,
    busFare: busFare || null, hasTrain: legs.some((x) => x.train),
    key: legs.map((x) => `${DATA.trips.indexOf(x.t)}:${x.ai}`).join('|'),
  };
}
const usable = (t, all) => all || !state.off.has(t.r);
const isTarget = (to) => to === CAMPUS ? (i) => isCampus(DATA.stops[i]) : ((b) => (i) => i === b)(DATA.stops.indexOf(to));

// 乗り換えなしで行ける便（出発順）
function directJourneys(day, from, to, all) {
  const a = DATA.stops.indexOf(from);
  const hit = isTarget(to);
  const out = [];
  if (a < 0) return out;
  for (const t of DATA.trips) {
    if (t.d !== day || !usable(t, all)) continue;
    let ai = -1, bi = -1;
    for (let k = 0; k < t.s.length; k++) {
      const i = t.s[k][0];
      if (ai < 0) { if (i === a) ai = k; continue; }
      if (hit(i)) { bi = k; break; }
    }
    if (ai >= 0 && bi > ai) out.push(makeJourney([makeLeg(t, ai, bi)]));
  }
  return out;
}

// 乗り換えの可否と所要時間（バス同士の乗り換えは扱わない）
function xferTime(stop, fromTrain, toTrain) {
  if (fromTrain && toTrain) return XFER.trainTrain;
  if (fromTrain !== toTrain && DATA.stops[stop] === HUB) return XFER.trainBus;
  return Infinity;
}

// 日別の「区間」一覧（発車順）。Connection Scan 用
const connCache = new Map();
function connections(day, all) {
  const key = `${day}|${all ? 1 : [...state.off].join(',')}`;
  if (connCache.has(key)) return connCache.get(key);
  const cs = [];
  for (const t of DATA.trips) {
    if (t.d !== day || !usable(t, all)) continue;
    for (let k = 0; k + 1 < t.s.length; k++) cs.push({ dep: t.s[k][1], arr: arrOf(t.s[k + 1]), from: t.s[k][0], to: t.s[k + 1][0], t, k });
  }
  cs.sort((x, y) => x.dep - y.dep);
  connCache.set(key, cs);
  return cs;
}

// 出発時刻 t0 以降で最も早く着く経路（乗り換えあり）
function earliest(cs, a, hit, t0) {
  const n = DATA.stops.length;
  const best = new Array(n).fill(Infinity), mode = new Array(n).fill(null), label = new Array(n).fill(null);
  best[a] = t0;
  const boarded = new Map();
  let target = -1, targetArr = Infinity;
  let lo = 0, hi = cs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cs[m].dep < t0) lo = m + 1; else hi = m; }
  for (let c = lo; c < cs.length; c++) {
    const x = cs[c];
    if (x.dep > targetArr) break;
    let b = boarded.get(x.t);
    if (!b) {
      if (best[x.from] === Infinity) continue;
      const need = x.from === a && !label[x.from] ? best[x.from] : best[x.from] + xferTime(x.from, mode[x.from], isTrain(x.t));
      if (need > x.dep) continue;
      b = { k: x.k, prev: label[x.from] };
      boarded.set(x.t, b);
    }
    if (x.arr < best[x.to]) {
      best[x.to] = x.arr; mode[x.to] = isTrain(x.t);
      label[x.to] = { t: x.t, ai: b.k, bi: x.k + 1, prev: b.prev };
      if (hit(x.to) && x.arr < targetArr) { targetArr = x.arr; target = x.to; }
    }
  }
  if (target < 0) return null;
  const legs = [];
  for (let l = label[target]; l; l = l.prev) legs.unshift(makeLeg(l.t, l.ai, l.bi));
  return makeJourney(legs);
}

// 乗り換えを含む経路を一日分列挙（同じ出発なら早く着くもの、同じ到着なら遅く出られるものだけ残す）
function transferJourneys(day, from, to, all) {
  const a = DATA.stops.indexOf(from);
  if (a < 0) return [];
  const cs = connections(day, all);
  const hit = isTarget(to);
  const starts = [...new Set(cs.filter((c) => c.from === a).map((c) => c.dep))].sort((x, y) => x - y);
  const out = [];
  let next = -1;
  for (const s of starts) {
    if (s < next) continue;
    const j = earliest(cs, a, hit, s);
    if (!j) break;
    next = j.dep + 1;
    if (j.legs.length > 1 && !out.some((o) => o.key === j.key)) out.push(j);
  }
  return out.filter((j) => !out.some((o) => o !== j && o.dep >= j.dep && o.arr <= j.arr && (o.dep > j.dep || o.arr < j.arr)));
}

const jCache = new Map();
function journeys(day, from, to, all) {
  const key = `${day}|${from}|${to}|${all ? 1 : [...state.off].join(',')}`;
  if (jCache.has(key)) return jCache.get(key);
  let list = directJourneys(day, from, to, all);
  const needX = TRAIN_STOPS.has(from) || TRAIN_STOPS.has(to) || (to === CAMPUS && TRAIN_STOPS.has(from));
  if (needX) {
    // 直通便より遅く着く乗り換え経路は出さない
    const multi = transferJourneys(day, from, to, all)
      .filter((j) => !list.some((d) => d.dep >= j.dep && d.arr <= j.arr));
    list = list.concat(multi);
  }
  list.sort((x, y) => x.dep - y.dep || x.arr - y.arr);
  jCache.set(key, list);
  return list;
}

// 行ける行き先（乗り換え2回まで）
const reachCache = new Map();
function reachDirect(from) {
  const a = DATA.stops.indexOf(from);
  const set = new Set();
  for (const t of DATA.trips) {
    const k = t.s.findIndex(([i]) => i === a);
    if (k < 0) continue;
    for (let j = k + 1; j < t.s.length; j++) set.add(DATA.stops[t.s[j][0]]);
  }
  return set;
}
function reachable(from) {
  if (reachCache.has(from)) return reachCache.get(from);
  const set = new Set(reachDirect(from));
  let frontier = [...set].filter((n) => n === HUB || (TRAIN_STOPS.has(n) && TRAIN_STOPS.has(from)));
  for (let depth = 0; depth < 2 && frontier.length; depth++) {
    const nf = [];
    for (const h of frontier) for (const n of reachDirect(h)) if (!set.has(n)) { set.add(n); if (n === HUB) nf.push(n); }
    frontier = nf;
  }
  set.delete(from);
  if (!isCampus(from) && [...set].some(isCampus)) set.add(CAMPUS);
  reachCache.set(from, set);
  return set;
}
function fixRoute() {
  const to = reachable(state.from);
  if (!to.has(state.to)) state.to = to.has(CAMPUS) ? CAMPUS : to.has(HUB) ? HUB : [...to][0];
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

/* ================= 通学モード（開いた瞬間に今乗るべき便を出す） ================= */
// 開いた時刻で行き／帰りを決める：時間割があれば最初の授業が始まるまでは行き、それ以降は帰り
const GO_GRACE = 90;  // 最初の授業が始まってもこの分数までは「行き」（遅れて向かう日もあるため）
function autoDir(now = new Date()) {
  if (!commute) return null;
  // 手で行き／帰りを選んでから3時間以内（同じ日）なら、その向きを優先
  const ov = store.get('dirPick', null);
  if (ov && now.getTime() - ov.at < 3 * 3600 * 1000 && new Date(ov.at).getDate() === now.getDate()) return ov.dir;
  const m = now.getHours() * 60 + now.getMinutes();
  const ts = todaySched(now);
  if (ts) return m < PERIODS[ts[0] - 1][1] + GO_GRACE ? 'go' : 'back';
  return m < 12 * 60 ? 'go' : 'back';
}
function applyDir(dir) {
  if (!commute || !dir) { state.dir = null; return; }
  state.dir = dir;
  state.when = null;
  state.customOpen = false;
  state.from = dir === 'go' ? commute.home : commute.back;
  state.to = dir === 'go' ? commute.to : commute.home;
  store.set('from', state.from); store.set('to', state.to);
}
// 手で区間を変えたら通学モードを外す（通学ルートと同じ区間なら付け直す）
function syncDir() {
  if (!commute) { state.dir = null; return; }
  if (state.from === commute.home && state.to === commute.to) state.dir = 'go';
  else if (state.from === commute.back && state.to === commute.home) state.dir = 'back';
  else state.dir = null;
}

// ホーム上部：次の3本。タップでその便の詳細へ（結果画面を飛ばす）
let dashList = [];
function renderDash(q) {
  const all = journeys(q.day, state.from, state.to);
  const ts = todaySched(q.now);
  let start = q.min, note = '';
  if (state.dir === 'back' && ts) {
    const en = PERIODS[ts[1] - 1][2] + margin();
    if (start < en) { start = en; note = `${ts[1]}限のあと（${fmt(en)}〜）`; }
  }
  const list = all.filter((j) => j.dep >= start);
  dashList = list.slice(0, 10);
  const nowFirst = start > q.min ? all.find((j) => j.dep >= q.min && j.dep < start) : null;
  if (nowFirst) dashList.push(nowFirst);
  let hint = '';
  if (state.dir === 'go' && ts) {
    // 時間割の中で、まだ間に合う一番早い授業
    for (const [n, st] of PERIODS.slice(ts[0] - 1, ts[1])) {
      const ok = all.filter((j) => j.arr <= st - margin() && j.dep >= q.min);
      if (ok.length) { hint = `${n}限に間に合う最終 <b>${fmt(ok[ok.length - 1].dep)}</b>発`; break; }
      const close = all.filter((j) => j.arr <= st && j.dep >= q.min);  // 余裕はないが開始には間に合う
      if (close.length) { const c = close[close.length - 1]; hint = `<span class="tightline">${n}限ギリギリ <b>${fmt(c.dep)}</b>発（${st - c.arr}分前に着く）</span>`; break; }
    }
    if (!hint) hint = `<span class="late">今日の授業（〜${ts[1]}限）に間に合う便はもうありません</span>`;
  }
  const head = `<div class="dash-head"><span class="dirtag dir-${state.dir}">${state.dir === 'go' ? '行き' : '帰り'}</span>
    <span class="dash-route">${esc(shortest(state.from))} → ${esc(shortest(state.to))}</span></div>
    ${hint || note ? `<div class="dash-hint">${hint || note}</div>` : ''}`;
  if (!list.length) {
    const tmr = new Date(q.now); tmr.setDate(tmr.getDate() + 1);
    const f = journeys(dayType(tmr), state.from, state.to)[0];
    return `${head}<div class="dash-none">今日の便は終わりました${f ? `<br>明日の始発 <b>${fmt(f.dep)}</b>発 → ${fmt(f.arr)}着` : ''}</div>`;
  }
  const lastOfDay = all[all.length - 1];
  const badges = (j) => `${j === lastOfDay ? `<span class="lastchip">${j.legs[0].train ? '終電' : '終バス'}</span>` : ''}${classBadge(j, 'classchip', false)}`;
  const main = list[0];
  const wait = (j) => j.dep - q.nowMin;
  const rows = list.slice(1, 3).map((j, i) => `<button class="dash-row" data-k="${i + 1}">
      <span class="dr-t">${fmt(j.dep)}</span><span class="dr-a">→ ${fmt(j.arr)}</span>
      ${j.plat ? `<span class="platchip">${esc(j.plat)}</span>` : ''}${badges(j)}
      <span class="dr-w">${after(wait(j))}</span></button>`).join('');
  return `${head}
    <button class="dash-main" data-k="0">
      <span class="dm-l"><span class="dm-t">${fmt(main.dep)}<small>発</small></span>
        <span class="dm-s">${main.plat ? `<span class="platchip">${platLabel(main.plat)}</span>` : ''}<span class="lb">${esc(main.legs.map(legName).join('→'))} </span>${fmt(main.arr)}着</span></span>
      <span class="dm-r"><span class="dm-w">${wait(main) <= 0 ? 'まもなく' : `あと<b>${after(wait(main))}</b>`}</span>${badges(main)}</span>
    </button>${rows}${nowFirst ? `<button class="dash-row leavenow" data-k="${dashList.length - 1}">
      <span class="dr-l">今すぐ帰るなら</span><span class="dr-t">${fmt(nowFirst.dep)}</span><span class="dr-a">→ ${fmt(nowFirst.arr)}</span>
      ${nowFirst.plat ? `<span class="platchip">${esc(nowFirst.plat)}</span>` : ''}<span class="dr-w">${after(Math.max(0, nowFirst.dep - q.nowMin))}</span></button>` : ''}`;
}

// 行き／帰りボタン（通学ルートがあるとき）
function renderDirSeg() {
  const el = $('dirSeg');
  if (!commute) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = [['go', '行き', commute.home, commute.to], ['back', '帰り', commute.back, commute.home]].map(([d, label, f, t]) =>
    `<button class="${state.dir === d ? 'on' : ''}" data-d="${d}"><b>${label}</b><small>${esc(shortest(f))} → ${esc(shortest(t))}</small></button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.onclick = () => {
    store.set('dirPick', { dir: b.dataset.d, at: Date.now() });
    applyDir(b.dataset.d); renderHome();
  });
}

// 慣れてきたら：よく調べる区間を通学ルートに、シンプル表示に、をワンタップで提案
function renderSuggest() {
  const el = $('suggest');
  const items = [];
  if (!commute) {
    const best = Object.entries(usage).map(([k, c]) => [k.split('|'), c])
      .filter(([[f, t], c]) => c >= 2 && !isCampus(f) && (t === CAMPUS || isCampus(t)) && DATA.stops.includes(f))
      .sort((a, b) => b[1] - a[1])[0];
    const pair = best ? best[0] : (!isCampus(state.from) && toCampusTrip() ? [state.from, state.to] : null);
    if (pair) items.push(`<button class="sg" data-a="commute" data-f="${esc(pair[0])}" data-t="${esc(pair[1])}">＋ 「${esc(shortest(pair[0]))} → ${esc(shortest(pair[1]))}」を通学ルートにする<small>開くだけで次の便が出るようになります</small></button>`);
  }
  if (store.get('launches', 0) >= 15 && !store.get('simple', false) && !store.get('simpleAsked', false)) {
    items.push(`<button class="sg" data-a="simple">慣れてきたらシンプル表示に<small>説明の文字を減らします（その他でいつでも戻せます）</small></button><button class="sg-x" data-a="nosimple" aria-label="閉じる">×</button>`);
  }
  el.innerHTML = items.join('');
  el.hidden = !items.length;
  el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'commute') {
      commute = { home: b.dataset.f, to: b.dataset.t, back: isCampus(b.dataset.t) ? b.dataset.t : BACK_DEFAULT };
      store.set('commute', commute);
      applyDir(autoDir());
      toast('通学ルートにしました（その他で変更できます）');
    }
    if (a === 'simple') { store.set('simple', true); store.set('simpleAsked', true); document.body.classList.add('simple'); $('simpleSw').checked = true; }
    if (a === 'nosimple') store.set('simpleAsked', true);
    renderHome();
  });
}

/* ================= ホーム ================= */
const legName = (l) => l.train ? (l.r === '筑肥線' ? 'JR筑肥線' : '筑肥線・空港線') : rinfo(l.r).short;
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
    : q.period ? `${ICON_CLOCK}<b>${q.period}限</b>${q.mode === 'arr' ? 'に間に合う' : 'の後'}`
    : `${ICON_CLOCK}<b>${fmt(q.min)}</b>${q.mode === 'dep' ? '出発' : '到着'}`;
  renderPeriods(q);
  syncDir();
  renderDirSeg();
  renderSuggest();
  const dash = state.dir && q.live;
  $('customToggle').hidden = !(state.dir && !state.customOpen);
  $('customBox').hidden = !!(state.dir && !state.customOpen);
  if (dash) {
    $('nextLine').classList.add('dash');
  $('nextLine').onclick = null;
    $('nextLine').innerHTML = renderDash(q);
    $('nextLine').querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      state.results = dashList; openDetail(dashList[+b.dataset.k]);
    });
    renderQuick();
    return;
  }
  $('nextLine').classList.remove('dash');
  const todays = q.live ? journeys(q.day, state.from, state.to) : [];
  const nx = todays.find((j) => j.dep >= q.min) || null;
  const first = nx && nx.legs[0];
  const lastOne = nx && todays[todays.length - 1] === nx;
  const lastWord = first && first.train ? '終電' : '終バス';
  $('nextLine').innerHTML = nx
    ? `<div class="nx-l">${lastOne ? `<span class="lastchip">${lastWord}</span>` : `次の${first.train ? '電車' : 'バス'}`}</div><div class="nx-t">${fmt(nx.dep)}<small>発</small></div>
       <div class="nx-r"><span class="lb">あと </span><b>${after(nx.dep - q.min)}</b><br>${nx.plat ? `<span class="platchip">${platLabel(nx.plat)}</span> ` : ''}<span class="lb">${esc(nx.legs.map(legName).join('→'))}・${esc(short(nx.at))} </span>${fmt(nx.arr)}着${classBadge(nx, 'classchip', true)}</div>`
    : `<div class="nx-msg">${q.live ? '本日の運行は終了しました' : `${DAY_NAMES[q.day]} ${fmt(q.min)} ${q.mode === 'dep' ? '出発' : '到着'}で検索します`}</div>`;

  if (nx) {
    $('nextLine').onclick = () => { state.results = todays.filter((j) => j.dep >= q.min).slice(0, 10); openDetail(nx); };
  } else $('nextLine').onclick = null;
  renderQuick();
}

// よく使う区間（お気に入り→最近の検索）。タップでそのまま検索
function renderQuick() {
  const isCommute = ([a, b]) => commute && ((a === commute.home && b === commute.to) || (a === commute.back && b === commute.home));
  const items = [...favs.map((x) => [...x, true]), ...hist.filter(([a, b]) => !favs.some(([c, d]) => c === a && d === b)).map((x) => [...x, false])]
    .filter((x) => !isCommute(x)).slice(0, 8);
  $('quick').innerHTML = items.map(([f, t, fav], i) =>
    `<button class="qchip${fav ? ' fav' : ''}" data-i="${i}">${fav ? '★ ' : ''}${esc(shortest(f))}<span>→</span>${esc(shortest(t))}</button>`).join('');
  $('quick').hidden = !items.length;
  $('quick').querySelectorAll('.qchip').forEach((b) => b.onclick = () => {
    const [f, t] = items[+b.dataset.i]; state.from = f; state.to = t; fixRoute(); search();
  });
}
const shortest = (n) => n === CAMPUS ? '伊都' : short(n).replace(/^九大(?!学研)/, '').replace(/駅$/, '');

// その他：お気に入りの管理と系統のオン・オフ
function renderMore() {
  $('cmHomeV').textContent = commute ? disp(commute.home) : '未設定';
  $('cmToV').textContent = commute ? disp(commute.to) : '—';
  $('cmBackV').textContent = commute ? disp(commute.back) : '—';
  $('cmTo').disabled = $('cmBack').disabled = !commute;
  $('cmClear').hidden = !commute;
  const opt = (v, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>${v ? v + '限' : '—'}</option>`;
  $('sched').innerHTML = '<div class="sh"></div><div class="sh">最初</div><div class="sh">最後</div>' + [1, 2, 3, 4, 5, 6].map((d) => {
    const [a, b] = sched[d] || [0, 0];
    return `<div class="sd">${WEEK[d]}</div>${[0, 1].map((k) => `<select data-d="${d}" data-k="${k}">${[0, 1, 2, 3, 4, 5].map((v) => opt(v, (sched[d] || [0, 0])[k])).join('')}</select>`).join('')}`;
  }).join('');
  $('sched').querySelectorAll('select').forEach((el) => el.onchange = () => {
    const d = +el.dataset.d, k = +el.dataset.k;
    const cur = [...(sched[d] || [0, 0])];
    cur[k] = +el.value;
    if (k === 0 && cur[0] && (!cur[1] || cur[1] < cur[0])) cur[1] = cur[0];
    if (k === 1 && cur[1] && (!cur[0] || cur[0] > cur[1])) cur[0] = cur[1];
    sched[d] = cur; store.set('sched', sched); renderMore();
  });
  renderPairList($('favList'), favs, '便の詳細画面の ☆ で追加できます', true);
  const busRoutes = Object.entries(ROUTES).filter(([, v]) => !v.train);
  $('opts').innerHTML = busRoutes.map(([r, v]) =>
    `<button class="opt${state.off.has(r) ? ' off' : ''}" data-r="${r}" style="--c:var(--r-${v.key})"><span class="ic">${v.mark}</span>${v.short}<i>${state.off.has(r) ? 'オフ' : 'オン'}</i></button>`).join('');
  $('opts').querySelectorAll('.opt').forEach((b) => b.onclick = () => {
    const r = b.dataset.r;
    if (state.off.has(r)) state.off.delete(r); else state.off.add(r);
    if (state.off.size === busRoutes.length) { state.off.delete(r); toast('すべてオフにはできません'); }
    store.set('routesOff', [...state.off]); jCache.clear(); connCache.clear(); renderMore();
  });
}

// 授業のバッジ
function classBadge(j, cls, br) {
  const c = classInfo(j);
  return c ? `${br ? '<br>' : ''}<span class="${cls}${c.tight ? ' tight' : ''}">${c.text}</span>` : '';
}
// 授業ボタン：行きは「間に合う便」、帰りは「終わってから乗れる便」を検索
function renderPeriods(q) {
  const back = fromCampusTrip();
  $('periodLbl').textContent = back ? '授業が終わってから帰る' : '授業に間に合う便';
  $('periods').innerHTML = PERIODS.map(([n, st, en]) =>
    `<button class="pchip${q.period === n ? ' on' : ''}" data-n="${n}"><b>${n}限</b><small>${back ? `〜${fmt(en)}` : `${fmt(st)}〜`}</small></button>`).join('');
  $('periods').querySelectorAll('.pchip').forEach((b) => b.onclick = () => {
    const [n, st, en] = PERIODS[+b.dataset.n - 1];
    const day = query().day;
    state.when = fromCampusTrip()
      ? { mode: 'dep', day, min: en + margin(), period: n }
      : { mode: 'arr', day, min: st - margin(), period: n };
    search();
  });
}

function renderPairList(ul, pairs, empty, isFav) {
  const { day, min } = query();
  ul.innerHTML = pairs.map(([f, t], i) => {
    const nx = journeys(day, f, t).find((j) => j.dep >= min);
    return `<li><div class="row"><span class="ico">${TRAIN_STOPS.has(f) && f !== HUB ? ICON_TRAIN : ICON_BUS}</span>
      <button class="nm" data-i="${i}">${esc(short(f))} → ${esc(short(t))}<small>${nx ? `次 ${fmt(nx.dep)}発（あと${after(nx.dep - min)}）` : '本日の便は終了'}</small></button>
      ${isFav ? `<button class="star on" data-del="${i}" aria-label="登録解除">${ICON_STAR}</button>` : ''}</div></li>`;
  }).join('') || `<li class="empty">${empty}</li>`;
  ul.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
    const [f, t] = pairs[+b.dataset.i]; state.from = f; state.to = t; fixRoute(); search();
  });
  ul.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    favs.splice(+b.dataset.del, 1); store.set('favs', favs); render(); toast('登録を解除しました');
  });
}

function search() {
  const uk = `${state.from}|${state.to}`;
  usage[uk] = (usage[uk] || 0) + 1; store.set('usage', usage);
  hist = [[state.from, state.to], ...hist.filter(([a, b]) => !(a === state.from && b === state.to))].slice(0, 15);
  store.set('hist', hist);
  state.sort = 'all';
  if (curScreen() === 's-results') show('s-results'); else push('s-results');
}

/* ================= 停留所・駅の検索 ================= */
let searchTarget = 'from';
function openSearch(target) {
  searchTarget = target;
  $('q').value = '';
  $('searchTitle').textContent = { from: '乗る停留所・駅を選ぶ', to: '降りる停留所・駅を選ぶ', cmHome: '家の最寄りの駅・停留所を選ぶ', cmTo: '行きの行き先を選ぶ', cmBack: '帰りに乗るバス停を選ぶ' }[target];
  openOverlay($('search'));
  renderSearch();
  requestAnimationFrame(() => { $('searchBody').scrollTop = $('searchBody').scrollHeight; });
}
function candidates() {
  if (searchTarget === 'cmHome') return DATA.stops.filter((s) => !isCampus(s) && reachable(s).has(CAMPUS));
  if (searchTarget === 'cmTo') return [CAMPUS, ...DATA.stops.filter(isCampus)];
  if (searchTarget === 'cmBack') return DATA.stops.filter(isCampus);
  if (searchTarget === 'from') return DATA.stops.filter((s) => reachable(s).size);
  return [...reachable(state.from)];
}
const stationOnly = (n) => TRAIN_STOPS.has(n) && !BUS_STOPS.has(n);
function renderSearch() {
  const cand = candidates();
  const qv = $('q').value.trim();
  const icon = (n) => n === CAMPUS ? ICON_PIN : stationOnly(n) ? ICON_TRAIN : ICON_BUS;
  const row = (n) => `<li><div class="row"><span class="ico${isCampus(n) || n === CAMPUS ? ' camp' : ''}${stationOnly(n) ? ' rail' : ''}">${icon(n)}</span>
    <button class="nm" data-pick="${esc(n)}">${esc(disp(n))}${n === CAMPUS ? '<small>キャンパス内で最初に着く停留所</small>' : n === HUB ? '<small>電車の駅・バス乗り場</small>' : stationOnly(n) ? '<small>電車（筑肥線・空港線）</small>' : ''}</button>
    <button class="star${favStops.includes(n) ? ' on' : ''}" data-star="${esc(n)}" aria-label="お気に入り">${ICON_STAR}</button></div></li>`;
  let html = '';
  if (qv) {
    const norm = (s) => s.replace(/[（）()\s]/g, '');
    const hits = cand.filter((n) => norm(disp(n)).includes(norm(qv)));
    html = `<div class="s-sec">「${esc(qv)}」の候補</div><ul class="list">${hits.map(row).join('') || '<li class="empty">見つかりませんでした</li>'}</ul>`;
  } else {
    const chips = [...new Set([...favStops, ...POPULAR])].filter((n) => cand.includes(n));
    const h = stopHist.filter((n) => cand.includes(n));
    const camp = cand.filter((n) => isCampus(n)).sort((x, y) => x.localeCompare(y, 'ja'));
    const order = DATA.trainOrder || [];
    const rail = cand.filter(stationOnly).sort((x, y) => order.indexOf(y) - order.indexOf(x));
    const others = cand.filter((n) => !isCampus(n) && n !== CAMPUS && !stationOnly(n)).sort((x, y) => x.localeCompare(y, 'ja'));
    // 下ほど親指に近いので、よく使うものほど下に置く
    if (others.length) html += `<div class="s-sec">その他のバス停</div><ul class="list">${others.map(row).join('')}</ul>`;
    if (rail.length) html += `<div class="s-sec">電車の駅（筑肥線・空港線）</div><ul class="list">${rail.map(row).join('')}</ul>`;
    if (camp.length) html += `<div class="s-sec">伊都キャンパス内のバス停</div><ul class="list">${camp.map(row).join('')}</ul>`;
    if (h.length) html += `<div class="s-sec">入力履歴<button class="act" id="clrStopHist">削除</button></div><ul class="list">${h.map(row).join('')}</ul>`;
    html += `<div class="s-sec">お気に入り／よく使う</div><div class="chips">${chips.map((n) => `<button data-pick="${esc(n)}">${esc(disp(n))}</button>`).join('')}</div>`;
  }
  $('searchBody').innerHTML = html;
  $('searchBody').scrollTop = $('searchBody').scrollHeight;
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
  if (searchTarget.startsWith('cm')) {
    const key = { cmHome: 'home', cmTo: 'to', cmBack: 'back' }[searchTarget];
    commute = { home: null, to: CAMPUS, back: BACK_DEFAULT, ...(commute || {}), [key]: n };
    store.set('commute', commute);
    applyDir(autoDir());
    goBack();
    setTimeout(render, 0);
    return;
  }
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
  $('resSub').textContent = q.period
    ? `${DAY_NAMES[q.day]}ダイヤ・${q.period}限${q.mode === 'arr' ? `に間に合う便（${fmt(q.min)}着まで）` : `の後の便（${fmt(q.min)}発から）`}`
    : `${q.live ? dateLabel(q.now) + ' ' : DAY_NAMES[q.day] + 'ダイヤ '}${fmt(q.min)} ${q.mode === 'dep' ? '出発' : '到着'}`;
  document.querySelectorAll('#sortTabs button').forEach((b) => b.classList.toggle('on', b.dataset.s === state.sort));

  const list = journeys(q.day, state.from, state.to);
  let js = q.mode === 'dep' ? list.filter((j) => j.dep >= q.min).slice(0, 10) : list.filter((j) => j.arr <= q.min).slice(-8);
  state.results = js;
  if (!js.length) {
    $('cols').innerHTML = `<p class="cols-empty">${q.mode === 'dep' ? 'この時刻以降の便はありません' : 'この時刻までに着く便はありません'}<br>${DAY_NAMES[q.day]}ダイヤ</p>`;
    return;
  }

  const avail = Math.max(320, window.innerHeight - 190);
  const minLeg = Math.min(...js.flatMap((j) => j.legs.map((l) => l.arr - l.dep)));
  const room = avail - 120;
  let ppm = Math.min(7, 90 / Math.max(minLeg, 6));
  let t0, t1;
  // 少なくとも3本は画面に収まるよう縮尺を下げる（下限 1.6px/分）
  if (q.mode === 'dep') {
    t0 = js[0].dep - q.min <= 40 ? q.min : js[0].dep - 6;
    const span3 = Math.max(...js.slice(0, 3).map((j) => j.arr)) - t0;
    ppm = Math.max(1.6, Math.min(ppm, room / span3));
    js = js.filter((j, i) => i < 3 || (j.arr - t0) * ppm <= room);
    t1 = Math.max(...js.map((j) => j.arr));
  } else {
    t1 = q.min;
    const span3 = t1 - Math.min(...js.slice(-3).map((j) => j.dep));
    ppm = Math.max(1.6, Math.min(ppm, room / span3));
    js = js.filter((j, i) => i >= js.length - 3 || (t1 - j.dep) * ppm <= room);
    t0 = Math.min(...js.map((j) => j.dep)) - 2;
  }
  const TOP = 68, y = (t) => TOP + (t - t0) * ppm;
  const H = Math.ceil(y(t1) + 80);
  const minArr = Math.min(...js.map((j) => j.arr));
  const minD = Math.min(...js.map((j) => j.arr - j.dep));
  const lastOfDay = list[list.length - 1];
  const latestOk = q.mode === 'arr' ? js[js.length - 1] : null;  // 到着指定で、間に合う中で一番遅く出られる便
  if (state.sort === 'fast') js = [...js].sort((x, z) => x.arr - z.arr || x.dep - z.dep);
  if (state.sort === 'short') js = [...js].sort((x, z) => (x.arr - x.dep) - (z.arr - z.dep) || x.dep - z.dep);

  const line = q.min >= t0 && q.min <= t1 + 1
    ? `<i class="now" style="top:${y(q.min)}px"></i><span class="nowtk" style="top:${y(q.min)}px">${fmt(q.min)}</span>` : '';
  const cols = js.map((j, k) => {
    const tags = (j === latestOk ? '<i class="tg t-late">間に合う最終</i>' : '') + (j === lastOfDay ? `<i class="tg t-last">${j.legs[0].train ? '終電' : '終バス'}</i>` : '') + (j.arr === minArr ? '<i class="tg t-fast">最速</i>' : '') + (j.arr - j.dep === minD ? '<i class="tg t-short">最短</i>' : '');
    const pills = j.legs.map((l, li) => {
      const r = rinfo(l.r);
      const h = (l.arr - l.dep) * ppm;
      const gap = li > 0 ? `<i class="xgap" style="top:${y(j.legs[li - 1].arr)}px;height:${(l.dep - j.legs[li - 1].arr) * ppm}px"></i>` : '';
      return `${gap}<div class="pill${l.train ? ' rail' : ''}" style="--c:var(--r-${r.key});top:${y(l.dep) - 12}px;height:${Math.max(h, 4) + 24}px">
        <span class="node">${l.train ? ICON_TRAIN : r.mark}</span><span class="seg"></span>
        ${h >= 52 ? `<span class="lname">${esc(r.short)}</span><span class="seg"></span>` : ''}
        <span class="endmark"></span>
      </div>`;
    }).join('');
    const fareTxt = j.fare ? `${j.fare}円` : j.busFare ? `バス${j.busFare}円` : '';
    return `<article class="col" style="--c:var(--r-${rinfo(j.r).key})">
      <div class="c-top" style="top:${y(j.dep) - (j.plat ? 64 : 46)}px">${j.plat ? `<div class="c-plat">${esc(j.plat)}</div>` : ''}<div class="c-dur">${j.arr - j.dep}分${j.legs.length > 1 ? '・乗換1' : ''}</div><div class="c-dep">${fmt(j.dep)}</div></div>
      ${pills}
      <div class="c-bot" style="top:${y(j.arr) + 16}px">
        <div class="c-arr">${fmt(j.arr)}</div>
        ${fareTxt ? `<div class="c-fare">${fareTxt}</div>` : ''}
        ${q.live ? `<div class="c-wait">あと${after(Math.max(0, j.dep - q.nowMin))}</div>` : ''}
        ${classBadge(j, 'c-class', false)}
        <div class="c-tags">${tags}</div>
      </div>
      <button class="col-hit" data-k="${k}" aria-label="${fmt(j.dep)}発の詳細"></button>
    </article>`;
  }).join('');
  $('cols').innerHTML = `<div class="tl-inner" style="height:${H}px"><div class="grid">${line}</div>${cols}</div>`;
  $('cols').querySelectorAll('.col-hit').forEach((b) => b.onclick = () => openDetail(js[+b.dataset.k]));
  // 到着指定のときは、間に合う最後の便（右端）が見えるように
  $('cols').scrollLeft = q.mode === 'arr' ? $('cols').scrollWidth : 0;
}

/* ================= 経路詳細 ================= */
function openDetail(j) { state.cur = j; state.midOpen = new Set(); push('s-detail'); }
function legLine(l) {
  if (!l.train) return `昭和バス 九州大学線 ・ <b>${esc(short(l.dest))}</b> 行`;
  const dest = l.dest.endsWith('方面') ? `<b>${esc(l.dest)}</b>` : `<b>${esc(short(l.dest))}</b> 行`;
  const kind = l.t.k === '快速' ? '<span class="tagsoft">快速</span> ' : '';
  return `${kind}JR筑肥線${l.r === '筑肥線' ? '' : '（地下鉄空港線直通）'} ・ ${dest}`;
}
function renderDetail() {
  const j = state.cur;
  if (!j) return;
  const q = query();
  $('detTitle').textContent = `${fmt(j.dep)} → ${fmt(j.arr)}`;
  $('detSub').textContent = q.live ? `${dateLabel(q.now)}・${DAY_NAMES[q.day]}ダイヤ` : `${DAY_NAMES[q.day]}ダイヤ`;
  const isFav = favs.some(([a, b]) => a === state.from && b === state.to);
  const idx = state.results.indexOf(j);
  const rows = [];
  j.legs.forEach((l, li) => {
    const c = `--c:var(--r-${rinfo(l.r).key})`;
    const mids = l.t.s.slice(l.ai + 1, l.bi);
    if (li === 0) {
      rows.push(`<div class="rt-row dep" style="${c}">
        <div class="rt-time">${fmt(l.dep)}<small>発</small></div>
        <div class="rt-mk"><i class="dot"></i></div>
        <div class="rt-body">
          <div class="rt-lbl">乗る</div>
          <div class="rt-name">${esc(l.from)}</div>
          <div class="rt-tags">${l.plat ? `<span class="platchip">${esc(platLabel(l.plat))}</span>` : ''}${l.ai === 0 ? '<span class="tagsoft">始発</span>' : ''}
            <button class="chip" id="chgTime">出発時刻を変更 ${ICON_CHEV}</button></div>
        </div></div>`);
    }
    rows.push(`<div class="rt-row leg2" style="${c}">
      <div class="rt-time"></div><div class="rt-mk"></div>
      <div class="rt-body">
        <div class="rt-badge"><span class="bi">${l.train ? ICON_TRAIN : ICON_BUS}</span>${esc(l.train ? (l.r === '筑肥線' ? 'JR筑肥線' : '筑肥線・空港線直通') : l.r)}</div>
        <div class="rt-line">${legLine(l)}</div>
        <div class="rt-meta">乗車 <b>${l.arr - l.dep}分</b>　<b>${mids.length + 1}</b> ${l.train ? '駅' : '停留所'}先で降りる</div>
        ${mids.length ? `<button class="mid-toggle${state.midOpen.has(li) ? ' open' : ''}" data-mid="${li}">途中の${l.train ? '駅' : '停留所'}（${mids.length}）${ICON_DOWN}</button>` : ''}
      </div></div>`);
    if (state.midOpen.has(li)) {
      rows.push(...mids.map((e) => `<div class="rt-row mid" style="${c}"><div class="rt-time">${fmt(e[1])}</div><div class="rt-mk"><i class="sdot"></i></div><div class="rt-body"><div class="rt-name">${esc(DATA.stops[e[0]])}</div></div></div>`));
    }
    const nx = j.legs[li + 1];
    if (nx) {
      const walk = l.train !== nx.train ? XFER.trainBus : XFER.trainTrain;
      rows.push(`<div class="rt-row xfer" style="--c:var(--r-${rinfo(nx.r).key})">
        <div class="rt-time">${fmt(l.arr)}<small>着</small><br>${fmt(nx.dep)}<small>発</small></div>
        <div class="rt-mk"><i class="dot x"></i></div>
        <div class="rt-body">
          <div class="rt-lbl">乗り換え</div>
          <div class="rt-name">${esc(l.at)}</div>
          <div class="rt-walk">${ICON_WALK}<span class="lb">${l.train && !nx.train ? '改札を出て北口のバス乗り場へ' : 'ホームで乗り換え'}（約</span>${walk}分<span class="lb">）</span>・待ち ${Math.max(0, nx.dep - l.arr - walk)}分</div>
          <div class="rt-tags">${nx.plat ? `<span class="platchip">${esc(platLabel(nx.plat))}</span>` : ''}${nx.ai === 0 ? '<span class="tagsoft">始発</span>' : ''}</div>
        </div></div>`);
    } else {
      rows.push(`<div class="rt-row arr" style="${c}">
        <div class="rt-time">${fmt(l.arr)}<small>着</small></div>
        <div class="rt-mk"><i class="dot"></i></div>
        <div class="rt-body">
          <div class="rt-lbl">降りる</div>
          <div class="rt-name">${esc(l.at)}</div>
          ${l.arrPlat ? `<div class="rt-tags"><span class="platchip soft">${esc(platLabel(l.arrPlat))}に到着</span></div>` : ''}
        </div></div>`);
    }
  });
  const fareTxt = j.fare ? `　<b>${j.fare}</b>円` : j.busFare ? `　バス<b>${j.busFare}</b>円` : '';
  $('detail').innerHTML = `
    <div class="route">${rows.join('')}</div>
    <div class="summary">
      <div class="big">所要<b>${j.arr - j.dep}</b>分　乗換<b>${j.legs.length - 1}</b>回${fareTxt}</div>
      <div class="sub">${esc(short(j.legs[0].from))} ${fmt(j.dep)}発 → ${esc(short(j.at))} ${fmt(j.arr)}着${j.hasTrain ? '<br>電車の運賃は含みません' : ''}</div>
      ${(() => { const c = classInfo(j); return c ? `<div class="classline${c.tight ? ' tight' : ''}">${c.long}${c.tight ? '（余裕少なめ）' : ''}</div>` : ''; })()}
    </div>
    <p class="d-note">時刻は昭和バス・JR九州の公表ダイヤです。遅れることがあります${j.hasTrain ? '。乗り換えは余裕をもってどうぞ' : ''}。</p>`;
  $('chgTime').onclick = () => openTTSheet(state.from, state.to, q.day);
  $('detail').querySelectorAll('[data-mid]').forEach((b) => b.onclick = () => {
    const li = +b.dataset.mid;
    if (state.midOpen.has(li)) state.midOpen.delete(li); else state.midOpen.add(li);
    renderDetail();
  });
  $('dFav').classList.toggle('on', isFav);
  $('dPrev').disabled = idx <= 0;
  $('dNext').disabled = idx < 0 || idx >= state.results.length - 1;
  $('dFav').onclick = () => {
    const i = favs.findIndex(([a, b]) => a === state.from && b === state.to);
    if (i >= 0) { favs.splice(i, 1); toast('登録を解除しました'); } else { favs.unshift([state.from, state.to]); toast('お気に入りに追加しました'); }
    store.set('favs', favs); renderDetail();
  };
  $('dPrev').onclick = () => { if (idx > 0) { state.cur = state.results[idx - 1]; state.midOpen = new Set(); renderDetail(); } };
  $('dNext').onclick = () => { if (idx >= 0 && idx < state.results.length - 1) { state.cur = state.results[idx + 1]; state.midOpen = new Set(); renderDetail(); } };
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
      const sub = multiPlat && j.plat ? j.plat : j.legs.length > 1 ? '乗換' : '';
      return `<button class="${cls}" data-k="${list.indexOf(j)}"><sup style="color:var(--r-${r.key})">${r.mark}</sup><span class="m">${pad(j.dep % 60)}</span>${sub ? `<span class="pl">${esc(sub)}</span>` : ''}</button>`;
    }).join('')}</div></div>`;
  }
  const used = [...new Set(list.map((j) => j.r))];
  const anyX = list.some((j) => j.legs.length > 1);
  el.innerHTML = html
    ? html + `<div class="legend">${used.map((r) => `<b style="color:var(--r-${rinfo(r).key})">${rinfo(r).mark}</b>${esc(r)}`).join('　')}<br>${platSet.length ? `のりば：${platSet.map(platLabel).join('・')}${multiPlat ? '（各時刻の下に表示）' : ''}<br>` : ''}${anyX ? '「乗換」は九大学研都市駅で電車とバスを乗り継ぐ経路<br>' : ''}全${list.length}本・時刻をタップで詳細</div>`
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
      if (curScreen() === 's-detail') { state.cur = state.results.find((x) => x.key === j.key) || j; state.midOpen = new Set(); renderDetail(); }
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
    openDetail(state.results.find((x) => x.key === j.key) || j);
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
  if (id === 's-more') renderMore();
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 1800);
}

// 電車のデータをバスのデータに合流させる（九大学研都市駅は共通の名前）
function mergeTrains(tr) {
  for (const t of DATA.trips) for (const e of t.s) BUS_STOPS.add(DATA.stops[e[0]]);
  const map = tr.stops.map((n) => {
    let i = DATA.stops.indexOf(n);
    if (i < 0) { i = DATA.stops.length; DATA.stops.push(n); }
    TRAIN_STOPS.add(n);
    return i;
  });
  for (const t of tr.trips) DATA.trips.push({ ...t, s: t.s.map(([i, ...rest]) => [map[i], ...rest]) });
  // 福岡空港 → 九大学研都市 の並び（検索画面の並び順に使う）
  const sample = tr.trips.find((t) => t.s.length === tr.stops.length) || tr.trips[0];
  DATA.trainOrder = sample ? sample.s.map(([i]) => tr.stops[i]) : tr.stops;
  if (DATA.trainOrder[0] === HUB) DATA.trainOrder.reverse();
  DATA.trainSource = tr.source;
}

async function main() {
  try {
    DATA = await (await fetch('data/timetable.json', { cache: 'no-cache' })).json();
  } catch (e) {
    $('nextLine').textContent = '時刻表データを読み込めませんでした。通信状態を確認してください。';
    return;
  }
  try { mergeTrains(await (await fetch('data/trains.json', { cache: 'no-cache' })).json()); } catch (e) { /* 電車データなしでもバスは使える */ }
  const ymdJa = (s) => s.replace(/(\d{4})(\d{2})(\d{2})/, '$1年$2月$3日');
  $('source').textContent = `データ：${DATA.source}／${ymdJa(DATA.fetchedFor)}改正ダイヤ${DATA.validUntil ? `（${ymdJa(DATA.validUntil)}まで有効）` : ''}${DATA.trainSource ? `。電車：${DATA.trainSource}` : ''}`;
  // 以前のデータの停留所名（例：周船寺（バス））を新しい名前に寄せ、見つからないものは除く
  const known = (n) => n === CAMPUS || DATA.stops.includes(n);
  state.dir = null; state.customOpen = false;
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
    if (state.dir) {
      const d = state.dir === 'go' ? 'back' : 'go';
      store.set('dirPick', { dir: d, at: Date.now() });
      applyDir(d); renderHome(); return;
    }
    const f = state.from, t = state.to;
    state.from = t === CAMPUS ? '九大ビッグオレンジ' : t;
    state.to = f;
    fixRoute(); renderHome();
  };
  $('dayPill').onclick = openWhen;
  $('whenBtn').onclick = openWhen;
  $('goBtn').onclick = search;
  $('customToggle').onclick = () => { state.customOpen = true; renderHome(); };
  $('cmHome').onclick = () => openSearch('cmHome');
  $('cmTo').onclick = () => openSearch('cmTo');
  $('cmBack').onclick = () => openSearch('cmBack');
  $('cmClear').onclick = () => { commute = null; store.set('commute', null); state.dir = null; renderMore(); toast('通学ルートを消しました'); };
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
    const text = j.legs.map((l) => `${short(l.from)} ${fmt(l.dep)}発 → ${short(l.at)} ${fmt(l.arr)}着（${l.train ? 'JR筑肥線' : '昭和バス ' + l.r}・${short(l.dest)}行）`).join('\n乗換\n');
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('コピーしました'); } } catch {}
  };
  const applySimple = (on) => { document.body.classList.toggle('simple', on); $('simpleSw').checked = on; };
  applySimple(store.get('simple', false));
  $('simpleSw').onchange = (e) => { store.set('simple', e.target.checked); applySimple(e.target.checked); toast(e.target.checked ? 'シンプル表示にしました' : '通常の表示に戻しました'); };
  const setMargin = (m) => { store.set('margin', m); $('marginSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.m === m)); };
  setMargin(margin());
  $('marginSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) { setMargin(+b.dataset.m); toast(`余裕を${b.dataset.m}分にしました`); } };
  $('clearHist').onclick = () => { hist = []; store.set('hist', []); toast('検索履歴を削除しました'); };
  document.querySelectorAll('.tabbar button').forEach((b) => b.onclick = () => {
    while (overlays.length) overlays.pop().hidden = true;
    stack = [b.dataset.t];
    show(b.dataset.t);
  });

  // 起動：アイコン長押しのショートカット（?r=go / back / table）か、時刻で行き／帰りを自動選択
  store.set('launches', store.get('launches', 0) + 1);
  const r = new URLSearchParams(location.search).get('r');
  if (r === 'go' || r === 'back') applyDir(commute ? r : null);
  else applyDir(autoDir());
  if (r) history.replaceState({ n: 1 }, '', location.pathname);
  if (r === 'table') { stack = ['s-table']; show('s-table'); } else render();
  setInterval(() => { if (curScreen() === 's-home' && !overlays.length) renderHome(); }, 15000);
  setInterval(() => { if (state.when == null && curScreen() === 's-results') renderResults(); }, 30000);
  // しばらく閉じていたら「今」に戻す（前に見た時刻・画面のまま残さない）
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000) {
      while (overlays.length) overlays.pop().hidden = true;
      stack = ['s-home'];
      state.when = null;
      if (commute) applyDir(autoDir());
      show('s-home');
    } else render();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
main();
