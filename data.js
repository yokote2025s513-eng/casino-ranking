// ============================================================
//  Casino Ranking – Firebase Realtime Database 共有データ層
//  ★ FIREBASE_CONFIG を自分の設定に書き換えること
// ============================================================

// ▼▼▼ ここを Firebase コンソールの設定値に書き換える ▼▼▼
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD_T643ftJeU9r5CJJ5hMYQ6eoGRvNIvDY",
  authDomain: "casino-ranking.firebaseapp.com",
  databaseURL: "https://casino-ranking-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "casino-ranking",
  storageBucket: "casino-ranking.firebasestorage.app",
  messagingSenderId: "889934164094",
  appId: "1:889934164094:web:9278ca45e10950fab7282f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// ▲▲▲ ここまで ▲▲▲

const GAMES = ['ポーカー', 'チンチロ', 'ブラックジャック', '競馬'];
const ADMIN_PASSWORD = 'admin'; // ← パスワード変更はここ
const DB_PATH = 'records';      // Realtime DB のルートパス

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
// Record shape: { id, nickname, game, amount, createdAt }

function addRecord(nickname, game, amount) {
  const newRef = dbRef().push();
  return newRef.set({
    id: newRef.key,
    nickname,
    game,
    amount: Number(amount),
    createdAt: Date.now()
  });
}

function updateRecord(id, nickname, game, amount) {
  return dbRef().child(id).update({ nickname, game, amount: Number(amount) });
}

function deleteRecord(id) {
  return dbRef().child(id).remove();
}

// ── リアルタイム購読 ─────────────────────────────────────────
// callback(records[]) を DB 更新のたびに呼ぶ
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

// ── デモデータ投入（DB が空の時だけ） ────────────────────────
async function seedIfEmpty() {
  const snap = await dbRef().once('value');
  if (snap.exists()) return;
  const names = ['VIPER', 'QUEEN_B', 'SHADOW', 'NEON_K', 'BLAZE', 'ORACLE', 'CIPHER', 'LUXE'];
  const promises = [];
  GAMES.forEach(game => {
    names.forEach(n => {
      const amount = Math.floor(Math.random() * 90000) + 10000;
      promises.push(addRecord(n, game, amount));
    });
  });
  await Promise.all(promises);
}

// ── パスワード ────────────────────────────────────────────────
function checkPassword(pw) { return pw === ADMIN_PASSWORD; }

// ── 通貨フォーマット ──────────────────────────────────────────
function fmt(n) { return '¥' + Number(n).toLocaleString(); }
