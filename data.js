// ============================================================
//  Casino Ranking – 統合データ層 (data.js)
//  ランキング + 予約システム + ニックネーム管理
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

// ── Firebase 初期化 ───────────────────────────────────────────
let _db = null;
function initFirebase() {
  if (_db) return _db;
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  _db = firebase.database();
  return _db;
}
function dbRef(path) {
  return initFirebase().ref(path || DB_PATH);
}

// ── ランキング CRUD ───────────────────────────────────────────
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
function deleteRecord(id) {
  return dbRef().child(id).remove();
}
function onRecordsChange(callback) {
  dbRef().on('value', snap => callback(Object.values(snap.val() || {})));
}

// ── 集計 ─────────────────────────────────────────────────────
function aggregateByGame(records, game) {
  const map = {};
  records.filter(r => r.game === game).forEach(r => {
    map[r.nickname] = (map[r.nickname] || 0) + r.amount;
  });
  return Object.entries(map).map(([nickname, total]) => ({ nickname, total }))
    .sort((a, b) => b.total - a.total);
}
function aggregateAll(records) {
  const map = {};
  records.forEach(r => { map[r.nickname] = (map[r.nickname] || 0) + r.amount; });
  return Object.entries(map).map(([nickname, total]) => ({ nickname, total }))
    .sort((a, b) => b.total - a.total);
}

// ── ユーティリティ ────────────────────────────────────────────
function checkPassword(pw) { return pw === ADMIN_PASSWORD; }
function fmt(n) { return '$' + Number(n).toLocaleString(); }

// ============================================================
//  ニックネーム管理
//  reservation/nicknames/{normalized} = { display, createdAt, visitorNum }
// ============================================================
function normalizeNick(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}
function onNicknamesChange(callback) {
  dbRef('reservation/nicknames').on('value', snap => callback(snap.val() || {}));
}
function deleteNickname(normalizedKey) {
  return dbRef('reservation/nicknames/' + normalizedKey).remove();
}
function deleteAllNicknames() {
  return dbRef('reservation/nicknames').remove();
}
async function nicknameExists(name) {
  const snap = await dbRef('reservation/nicknames/' + normalizeNick(name)).once('value');
  return snap.exists();
}
async function registerNickname(displayName, visitorNum) {
  const key = normalizeNick(displayName);
  const snap = await dbRef('reservation/nicknames/' + key).once('value');
  if (snap.exists()) return snap.val();
  const data = { display: displayName.trim(), createdAt: Date.now(), visitorNum: visitorNum || null };
  await dbRef('reservation/nicknames/' + key).set(data);
  return data;
}

// ============================================================
//  予約システム
// ============================================================
function resRef(path) {
  return dbRef('reservation' + (path ? '/' + path : ''));
}

// ── ゲーム設定 ────────────────────────────────────────────────
function onGamesChange(callback) {
  resRef('games').on('value', snap => callback(snap.val() || {}));
}
function updateGame(game, fields) {
  return resRef('games/' + game).update(fields);
}
function addGame(name, tables, capacity) {
  return resRef('games/' + name).set({ open: true, tables, capacity, waitPerGroup: 15 });
}
function removeGame(name) {
  return Promise.all([resRef('games/' + name).remove(), resRef('queues/' + name).remove()]);
}

// ── キュー操作 ────────────────────────────────────────────────
function onQueuesChange(callback) {
  resRef('queues').on('value', snap => callback(snap.val() || {}));
}

// 整理券発行
// byStaff=true のとき重複チェックをスキップ（受付スタッフ発行）
async function enqueue(game, nickname, byStaff = false) {
  const trimmed = nickname.trim() || 'ゲスト';
  if (!byStaff) {
    if (await nicknameExists(trimmed)) throw new Error('DUPLICATE_NICKNAME');
  }
  let num, visitorNum;
  await resRef('counter').transaction(cur => { num = (cur || 0) + 1; return num; });
  await resRef('visitorCount').transaction(cur => { visitorNum = (cur || 0) + 1; return visitorNum; });
  await registerNickname(trimmed, visitorNum);
  const ref = resRef('queues/' + game).push();
  await ref.set({ num, nickname: trimmed, visitorNum, ts: Date.now(), called: false, served: false, key: ref.key, byStaff });
  return { num, key: ref.key, visitorNum };
}

function dequeue(game, key) {
  return resRef('queues/' + game + '/' + key).remove();
}
function callGuest(game, key, called) {
  return resRef('queues/' + game + '/' + key).update({ called });
}
// 受付済み：呼出を止めてservedフラグ → ゲスト画面の整理券パネルが消える
function serveGuest(game, key) {
  return resRef('queues/' + game + '/' + key).update({ called: false, served: true });
}
function clearQueue(game) {
  return resRef('queues/' + game).remove();
}
function clearAllQueues() {
  return resRef('queues').remove();
}
function resetCounter() {
  return resRef('counter').set(0);
}
function resetVisitorCount() {
  return resRef('visitorCount').set(0);
}
function onCounterChange(callback) {
  resRef('counter').on('value', snap => callback(snap.val() || 0));
}
function onVisitorCountChange(callback) {
  resRef('visitorCount').on('value', snap => callback(snap.val() || 0));
}

// ── 待ち時間計算 ──────────────────────────────────────────────
function calcWaitMinutes(gameConfig, queueEntries) {
  if (!gameConfig) return null;
  if (gameConfig.waitMin !== undefined && gameConfig.waitMin !== null) return gameConfig.waitMin;
  const perGroup = gameConfig.waitPerGroup || 15;
  const tables   = gameConfig.tables || 1;
  // served済みは除外して計算
  const waiting = queueEntries.filter(e => !e.served).length;
  return Math.ceil(Math.max(0, waiting) / tables) * perGroup;
}

function sortedQueue(queuesData, game) {
  if (!queuesData[game]) return [];
  return Object.entries(queuesData[game])
    .map(([k, v]) => ({ ...v, key: k }))
    .sort((a, b) => a.ts - b.ts);
}

// ── 初期ゲームデータ（初回のみ）──────────────────────────────
async function initDefaultReservationGames() {
  const snap = await resRef('games').once('value');
  if (snap.exists()) return;
  const defaults = {};
  GAMES.forEach(g => { defaults[g] = { open: true, tables: 2, capacity: 4, waitPerGroup: 15 }; });
  await resRef('games').set(defaults);
}

// ── ニックネーム予測変換ヘルパー ─────────────────────────────
function attachNicknameAutocomplete(inputEl, datalistId) {
  const listId = datalistId || 'nicknameList';
  let datalist = document.getElementById(listId);
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = listId;
    document.body.appendChild(datalist);
  }
  inputEl.setAttribute('list', listId);
  inputEl.setAttribute('autocomplete', 'off');
  onNicknamesChange(nicks => {
    datalist.innerHTML = Object.values(nicks)
      .sort((a, b) => a.display.localeCompare(b.display, 'ja'))
      .map(n => `<option value="${n.display}"></option>`)
      .join('');
  });
}
