// ============================================================
//  Casino Ranking – 統合データ層 (data.js)
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD_T643ftJeU9r5CJJ5hMYQ6eoGRvNIvDY",
  authDomain:        "casino-ranking.firebaseapp.com",
  databaseURL:       "https://casino-ranking-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "casino-ranking",
  storageBucket:     "casino-ranking.firebasestorage.app",
  messagingSenderId: "889934164094",
  appId:             "1:889934164094:web:9278ca45e10950fab7282f"
};
const GAMES = ['ポーカー', 'チンチロ', 'ブラックジャック', '競馬'];
const ADMIN_PASSWORD = 'admin';
const DB_PATH = 'records';

let _db = null;
function initFirebase() {
  if (_db) return _db;
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  _db = firebase.database();
  return _db;
}
function dbRef(path) { return initFirebase().ref(path || DB_PATH); }

// ── ランキング ────────────────────────────────────────────────
function addRecord(nickname, game, amount) {
  const r = dbRef().push();
  return r.set({ id: r.key, nickname, game, amount: Number(amount), createdAt: Date.now() });
}
function addRecordWithRef(nickname, game, amount) {
  const r = dbRef().push();
  return r.set({ id: r.key, nickname, game, amount: Number(amount), createdAt: Date.now() }).then(() => r);
}
function updateRecord(id, nickname, game, amount) {
  return dbRef().child(id).update({ nickname, game, amount: Number(amount) });
}
function deleteRecord(id) { return dbRef().child(id).remove(); }
function onRecordsChange(cb) {
  dbRef().on('value', s => cb(Object.values(s.val() || {})));
}
function aggregateByGame(records, game) {
  const map = {};
  records.filter(r => r.game === game).forEach(r => { map[r.nickname] = (map[r.nickname] || 0) + r.amount; });
  return Object.entries(map).map(([nickname, total]) => ({ nickname, total })).sort((a, b) => b.total - a.total);
}
function aggregateAll(records) {
  const map = {};
  records.forEach(r => { map[r.nickname] = (map[r.nickname] || 0) + r.amount; });
  return Object.entries(map).map(([nickname, total]) => ({ nickname, total })).sort((a, b) => b.total - a.total);
}
function checkPassword(pw) { return pw === ADMIN_PASSWORD; }
function fmt(n) { return '$' + Number(n).toLocaleString(); }

// ── ニックネーム管理 ──────────────────────────────────────────
function normalizeNick(name) { return name.trim().toLowerCase().replace(/\s+/g, ''); }
function onNicknamesChange(cb) {
  dbRef('reservation/nicknames').on('value', s => cb(s.val() || {}));
}
function deleteNickname(key) { return dbRef('reservation/nicknames/' + key).remove(); }
function deleteAllNicknames() { return dbRef('reservation/nicknames').remove(); }
async function nicknameExists(name) {
  const s = await dbRef('reservation/nicknames/' + normalizeNick(name)).once('value');
  return s.exists();
}
async function registerNickname(displayName, visitorNum) {
  const key = normalizeNick(displayName);
  const s = await dbRef('reservation/nicknames/' + key).once('value');
  if (s.exists()) return s.val();
  const data = { display: displayName.trim(), createdAt: Date.now(), visitorNum: visitorNum || null };
  await dbRef('reservation/nicknames/' + key).set(data);
  return data;
}
function attachNicknameAutocomplete(inputEl, datalistId) {
  const id = datalistId || 'nicknameList';
  let dl = document.getElementById(id);
  if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
  inputEl.setAttribute('list', id);
  inputEl.setAttribute('autocomplete', 'off');
  onNicknamesChange(nicks => {
    dl.innerHTML = Object.values(nicks)
      .sort((a, b) => a.display.localeCompare(b.display, 'ja'))
      .map(n => `<option value="${n.display}"></option>`).join('');
  });
}

// ── 予約システム ──────────────────────────────────────────────
function resRef(path) { return dbRef('reservation' + (path ? '/' + path : '')); }

function onGamesChange(cb) { resRef('games').on('value', s => cb(s.val() || {})); }
function updateGame(game, fields) { return resRef('games/' + game).update(fields); }
function addGame(name, tables, capacity) {
  return resRef('games/' + name).set({ open: true, tables, capacity, waitPerGroup: 15 });
}
function removeGame(name) {
  return Promise.all([resRef('games/' + name).remove(), resRef('queues/' + name).remove()]);
}
function onQueuesChange(cb) { resRef('queues').on('value', s => cb(s.val() || {})); }

async function enqueue(game, nickname, byStaff = false) {
  const trimmed = nickname.trim() || 'ゲスト';
  if (!byStaff && await nicknameExists(trimmed)) throw new Error('DUPLICATE_NICKNAME');
  let num, visitorNum;
  await resRef('counter').transaction(c => { num = (c || 0) + 1; return num; });
  await resRef('visitorCount').transaction(c => { visitorNum = (c || 0) + 1; return visitorNum; });
  await registerNickname(trimmed, visitorNum);
  const ref = resRef('queues/' + game).push();
  await ref.set({ num, nickname: trimmed, visitorNum, ts: Date.now(), called: false, served: false, key: ref.key, byStaff });
  return { num, key: ref.key, visitorNum };
}
function dequeue(game, key) { return resRef('queues/' + game + '/' + key).remove(); }
function callGuest(game, key, called) { return resRef('queues/' + game + '/' + key).update({ called }); }
function serveGuest(game, key) { return resRef('queues/' + game + '/' + key).update({ called: false, served: true }); }
function clearQueue(game) { return resRef('queues/' + game).remove(); }
function clearAllQueues() { return resRef('queues').remove(); }
function resetCounter() { return resRef('counter').set(0); }
function resetVisitorCount() { return resRef('visitorCount').set(0); }
function onCounterChange(cb) { resRef('counter').on('value', s => cb(s.val() || 0)); }
function onVisitorCountChange(cb) { resRef('visitorCount').on('value', s => cb(s.val() || 0)); }

function calcWaitMinutes(cfg, queue) {
  if (!cfg) return null;
  if (cfg.waitMin !== undefined && cfg.waitMin !== null) return cfg.waitMin;
  const waiting = queue.filter(e => !e.served).length;
  return Math.ceil(Math.max(0, waiting) / (cfg.tables || 1)) * (cfg.waitPerGroup || 15);
}
function sortedQueue(queuesData, game) {
  if (!queuesData[game]) return [];
  return Object.entries(queuesData[game]).map(([k, v]) => ({ ...v, key: k })).sort((a, b) => a.ts - b.ts);
}
async function initDefaultReservationGames() {
  const s = await resRef('games').once('value');
  if (s.exists()) return;
  const d = {};
  GAMES.forEach(g => { d[g] = { open: true, tables: 2, capacity: 4, waitPerGroup: 15 }; });
  await resRef('games').set(d);
}
