// ============================================================
//  Casino Ranking – Firebase Realtime Database 共有データ層
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
const ADMIN_PASSWORD = 'fukashi';
const DB_PATH = 'records';

// ── Firebase 初期化 ──────────────────────────────────────────
let _db = null;
function initFirebase() {
  if (_db) return _db;
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  _db = firebase.database();
  return _db;
}
function dbRef() {
  return initFirebase().ref(DB_PATH);
}

// ── CRUD ─────────────────────────────────────────────────────
function addRecord(nickname, game, amount) {
  const newRef = dbRef().push();
  return newRef.set({ id: newRef.key, nickname, game, amount: Number(amount), createdAt: Date.now() });
}
function addRecordWithRef(nickname, game, amount) {
  const newRef = dbRef().push();
  return newRef.set({ id: newRef.key, nickname, game, amount: Number(amount), createdAt: Date.now() }).then(() => newRef);
}
function updateRecord(id, nickname, game, amount) {
  return dbRef().child(id).update({ nickname, game, amount: Number(amount) });
}
function deleteRecord(id) {
  return dbRef().child(id).remove();
}

// ── リアルタイム購読 ─────────────────────────────────────────
function onRecordsChange(callback) {
  dbRef().on('value', snap => {
    const raw = snap.val() || {};
    const records = Object.values(raw);
    callback(records);
  });
}

// ── 集計ヘルパー ─────────────────────────────────────────────
function aggregateByGame(records, game) {
  const map = {};
  records.filter(r => r.game === game).forEach(r => {
    map[r.nickname] = (map[r.nickname] || 0) + r.amount;
  });
  return Object.entries(map)
    .map(([nickname, total]) => ({ nickname, total }))
    .sort((a, b) => b.total - a.total);
}
function aggregateAll(records) {
  const map = {};
  records.forEach(r => { map[r.nickname] = (map[r.nickname] || 0) + r.amount; });
  return Object.entries(map)
    .map(([nickname, total]) => ({ nickname, total }))
    .sort((a, b) => b.total - a.total);
}

// ── パスワード ────────────────────────────────────────────────
function checkPassword(pw) { return pw === ADMIN_PASSWORD; }

// ── 通貨フォーマット ──────────────────────────────────────────
function fmt(n) { return '$' + Number(n).toLocaleString(); }


// ============================================================
//  予約システム – Reservation Layer
//  同じ Firebase プロジェクト・同じ db インスタンスを使用
// ============================================================

// 予約DBの参照ヘルパー
function resRef(path) {
  return initFirebase().ref('reservation' + (path ? '/' + path : ''));
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
  return Promise.all([
    resRef('games/' + name).remove(),
    resRef('queues/' + name).remove()
  ]);
}

// ── キュー操作 ────────────────────────────────────────────────
function onQueuesChange(callback) {
  resRef('queues').on('value', snap => callback(snap.val() || {}));
}
async function enqueue(game, name, count) {
  const counterRef = resRef('counter');
  let num;
  await counterRef.transaction(cur => { num = (cur || 0) + 1; return num; });
  const ref = resRef('queues/' + game).push();
  await ref.set({ num, name, count: Number(count), ts: Date.now(), called: false, key: ref.key });
  return { num, key: ref.key };
}
function dequeue(game, key) {
  return resRef('queues/' + game + '/' + key).remove();
}
function callGuest(game, key, called) {
  return resRef('queues/' + game + '/' + key).update({ called });
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
function onCounterChange(callback) {
  resRef('counter').on('value', snap => callback(snap.val() || 0));
}

// ── 初期ゲームデータ（初回のみ）────────────────────────────────
async function initDefaultReservationGames() {
  const snap = await resRef('games').once('value');
  if (snap.exists()) return;
  const defaults = {};
  GAMES.forEach(g => {
    defaults[g] = { open: true, tables: 2, capacity: 4, waitPerGroup: 15 };
  });
  await resRef('games').set(defaults);
}

// ── 待ち時間計算 ──────────────────────────────────────────────
function calcWaitMinutes(gameConfig, queueEntries) {
  if (!gameConfig) return null;
  if (gameConfig.waitMin !== undefined && gameConfig.waitMin !== null) return gameConfig.waitMin;
  const perGroup = gameConfig.waitPerGroup || 15;
  const tables   = gameConfig.tables || 1;
  const ahead    = Math.max(0, queueEntries.length);
  return Math.ceil(ahead / tables) * perGroup;
}

// ── キューをソート済み配列に変換 ──────────────────────────────
function sortedQueue(queuesData, game) {
  if (!queuesData[game]) return [];
  return Object.entries(queuesData[game])
    .map(([k, v]) => ({ ...v, key: k }))
    .sort((a, b) => a.ts - b.ts);
}
