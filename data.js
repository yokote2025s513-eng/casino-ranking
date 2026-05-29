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

// ── Firebase 初期化 ──────────────────────────────────────────
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

// ── ランキング CRUD ──────────────────────────────────────────
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
function onRecordsChange(callback) {
  dbRef().on('value', snap => {
    const raw = snap.val() || {};
    callback(Object.values(raw));
  });
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
//  ランキング・予約どちらで登録されたニックネームも一元管理
// ============================================================
function normalizeNick(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

// ニックネーム一覧をリアルタイム取得（予測変換・重複チェック用）
function onNicknamesChange(callback) {
  dbRef('reservation/nicknames').on('value', snap => {
    const raw = snap.val() || {};
    // { normalized: { display, createdAt, visitorNum } }
    callback(raw);
  });
}

// ニックネームが存在するか確認
async function nicknameExists(name) {
  const key = normalizeNick(name);
  const snap = await dbRef('reservation/nicknames/' + key).once('value');
  return snap.exists();
}

// ニックネームを登録（整理券発行時・ランキング追加時に呼ぶ）
async function registerNickname(displayName, visitorNum) {
  const key = normalizeNick(displayName);
  const snap = await dbRef('reservation/nicknames/' + key).once('value');
  if (snap.exists()) return snap.val(); // already exists
  const data = { display: displayName.trim(), createdAt: Date.now(), visitorNum: visitorNum || null };
  await dbRef('reservation/nicknames/' + key).set(data);
  return data;
}

// 全ニックネーム一覧を配列で返す（予測変換用）
async function getAllNicknames() {
  const snap = await dbRef('reservation/nicknames').once('value');
  const raw = snap.val() || {};
  return Object.values(raw).map(v => v.display);
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

// 整理券発行（ニックネーム重複チェック込み）
// byStaff=true の場合は重複チェックをスキップ（受付がウォークイン客に発行）
async function enqueue(game, nickname, byStaff = false) {
  const trimmed = nickname.trim() || 'ゲスト';

  if (!byStaff) {
    const exists = await nicknameExists(trimmed);
    if (exists) throw new Error('DUPLICATE_NICKNAME');
  }

  // 来場者カウンター & 整理番号 をトランザクションで取得
  const counterRef = resRef('counter');
  const visitorRef = resRef('visitorCount');
  let num, visitorNum;

  await counterRef.transaction(cur => { num = (cur || 0) + 1; return num; });
  await visitorRef.transaction(cur => { visitorNum = (cur || 0) + 1; return visitorNum; });

  // ニックネーム登録
  await registerNickname(trimmed, visitorNum);

  // キューに追加
  const ref = resRef('queues/' + game).push();
  await ref.set({
    num, nickname: trimmed, visitorNum,
    ts: Date.now(), called: false, key: ref.key, byStaff
  });

  return { num, key: ref.key, visitorNum };
}

// ゲーム選択なしの来場者整理券発行（reserve.html用）
async function enqueueNoGame(nickname) {
  const trimmed = nickname.trim() || 'ゲスト';
  const exists = await nicknameExists(trimmed);
  if (exists) throw new Error('DUPLICATE_NICKNAME');

  const counterRef = resRef('counter');
  const visitorRef = resRef('visitorCount');
  let num, visitorNum;
  await counterRef.transaction(cur => { num = (cur || 0) + 1; return num; });
  await visitorRef.transaction(cur => { visitorNum = (cur || 0) + 1; return visitorNum; });
  await registerNickname(trimmed, visitorNum);

  const ref = resRef('queues/__reception__').push();
  await ref.set({ num, nickname: trimmed, visitorNum, ts: Date.now(), called: false, key: ref.key });
  return { num, key: ref.key, visitorNum };
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
  return Math.ceil(Math.max(0, queueEntries.length) / tables) * perGroup;
}

function sortedQueue(queuesData, game) {
  if (!queuesData[game]) return [];
  return Object.entries(queuesData[game])
    .map(([k, v]) => ({ ...v, key: k }))
    .sort((a, b) => a.ts - b.ts);
}

// ── 初期ゲームデータ（初回のみ）────────────────────────────────
async function initDefaultReservationGames() {
  const snap = await resRef('games').once('value');
  if (snap.exists()) return;
  const defaults = {};
  GAMES.forEach(g => { defaults[g] = { open: true, tables: 2, capacity: 4, waitPerGroup: 15 }; });
  await resRef('games').set(defaults);
}

// ── ニックネーム予測変換ヘルパー ──────────────────────────────
// input要素にdatalistを紐付ける
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

  // リアルタイム更新
  onNicknamesChange(nicks => {
    datalist.innerHTML = Object.values(nicks)
      .sort((a, b) => a.display.localeCompare(b.display, 'ja'))
      .map(n => `<option value="${n.display}"></option>`)
      .join('');
  });
}
