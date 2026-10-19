/*
 * app.js · 天马门禁 WebApp
 * 工牌由 Lanyard（Three.js）渲染：点击翻面，下拉开门。
 * 设备接口：GET /ping /status /open（ESP32，默认 http://mj.local:48733）
 */

import { createLanyard } from './lanyard.js';
import { makeCardFaces, makeStrapImage } from './faces.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
const netPill = $('netPill');
const netText = $('netText');
const stateWrap = $('stateWrap');
const stateText = $('stateText');
const hintText = $('hintText');
const meter = $('meter');
const meterFill = $('meterFill');
const toastEl = $('toast');
const toastText = $('toastText');
const toastSub = $('toastSub');
const tickEl = toastEl.querySelector('.tick');
const scrim = $('scrim');
const sheet = $('sheet');
const baseInput = $('baseInput');
const saveBtn = $('saveBtn');
const testBtn = $('testBtn');
const facts = $('facts');
const demoToggle = $('demoToggle');
const noteText = $('noteText');

const CARD = { name: '小马', id: '0000' };
const DEFAULT_BASE = 'http://mj.local:48733';
const PARAMS = new URLSearchParams(location.search);
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';
const BANG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6.5v7.2"/><circle cx="12" cy="18" r="1.1" fill="currentColor" stroke="none"/></svg>';

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 忽略隐私模式下的写入失败 */
    }
  }
};

const isPrivateHost = host =>
  host === 'mj.local' ||
  host === 'localhost' ||
  /^127\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^10\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(host);

function defaultBase() {
  const { protocol, hostname, port, origin } = location;
  if (protocol === 'http:' && (port === '48733' || isPrivateHost(hostname))) return origin;
  return DEFAULT_BASE;
}

const state = {
  base: normalizeBase(store.get('mj.base', '')) || defaultBase(),
  demo: store.get('mj.demo', '0') === '1',
  online: null,
  err: '',
  mon: 0,
  zanshi: 0,
  yanshi: 10000,
  zAt: 0,
  busy: false,
  pull: 0,
  rssi: null
};

let lanyard = null;
let pull = null;
let demoUntil = 0;
let guardUntil = 0;
let toastTimer = 0;
let lastKey = '';
let lastFacts = '';

function normalizeBase(value) {
  let v = String(value || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  return v;
}

function leftMs() {
  if (state.mon !== 2) return 0;
  return Math.max(0, state.zanshi - (performance.now() - state.zAt));
}

function haptic(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 不支持振动 */
  }
}

/* ---------- 界面 ---------- */

function render() {
  const online = state.online === true;
  const demo = state.demo;
  const open = (online || demo) && state.mon === 2;
  const secs = open ? Math.max(1, Math.ceil(leftMs() / 1000)) : 0;

  const key = [demo, state.online, open, secs, state.pull > 0, state.pull >= 1, state.err].join('|');
  if (key !== lastKey) {
    lastKey = key;

    netPill.className = 'pill ' + (demo ? 'demo' : online ? 'on' : state.online === null ? '' : 'off');
    netText.textContent = demo ? '演示' : online ? '已连接' : state.online === null ? '连接中' : '未连接';

    stateWrap.className = 'state' + (open ? ' open' : !online && !demo && state.online === false ? ' off' : '');
    stateText.textContent = open
      ? `已开门 · ${secs} 秒后自动上锁`
      : demo
        ? '演示模式'
        : online
          ? '门已上锁'
          : state.online === null
            ? '正在连接'
            : '设备未连接';

    let hint = '下拉工牌开门 · 点击翻面';
    if (state.pull > 0) hint = state.pull >= 1 ? '松手开门' : '继续下拉';
    else if (state.err === 'mixed') hint = 'HTTPS 页面无法访问 HTTP 设备';
    else if (!online && !demo && state.online === false) hint = '检查设备地址与 WiFi';
    hintText.textContent = hint;
    hintText.classList.toggle('ready', state.pull >= 1);
  }
}

function renderMeter() {
  meterFill.style.width = Math.min(100, state.pull * 100).toFixed(1) + '%';
}

function toast(title, sub, kind) {
  toastText.textContent = title;
  toastSub.textContent = sub || '';
  tickEl.innerHTML = kind === 'warn' || kind === 'err' ? BANG : CHECK;
  toastEl.className = 'toast show' + (kind && kind !== 'ok' ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

/* ---------- 设备 ---------- */

function classify() {
  if (location.protocol === 'https:' && state.base.startsWith('http:')) return 'mixed';
  return 'net';
}

function request(path, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 3500);
  return fetch(state.base + path, { cache: 'no-store', mode: 'cors', signal: ctrl.signal })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    })
    .finally(() => clearTimeout(timer));
}

const getJSON = (path, ms) => request(path, ms).then(res => res.json());

function send(path, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 4000);
  return fetch(state.base + path, { cache: 'no-store', mode: 'cors', signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

function applyStatus(j) {
  state.online = true;
  state.err = '';
  const mon = j.mon | 0;
  const stale = performance.now() < guardUntil && mon !== 2;
  if (!stale) {
    state.mon = mon;
    state.zanshi = j.zanshi | 0;
    state.yanshi = j.yanshi || 10000;
    state.zAt = performance.now();
  }
  state.rssi = typeof j.rssi === 'number' ? j.rssi : null;
}

async function poll() {
  if (state.demo) {
    render();
    setTimeout(poll, 800);
    return;
  }

  try {
    applyStatus(await getJSON('/status'));
  } catch {
    state.online = false;
    state.err = classify();
  }
  render();
  renderFacts();

  const delay = state.online ? (state.mon === 2 ? 600 : 1600) : 3000;
  setTimeout(poll, delay);
}

async function openDoor() {
  if (state.busy) return;
  if (state.demo) {
    demoUntil = performance.now() + 10000;
    state.mon = 2;
    state.zanshi = 10000;
    state.yanshi = 10000;
    state.zAt = performance.now();
    guardUntil = performance.now() + 1000;
    render();
    haptic([12, 42, 18]);
    toast('已开门', '演示模式');
    return;
  }
  if (state.online !== true) {
    toast('设备未连接', state.err === 'mixed' ? '需要 HTTP 环境' : '请检查设备地址', 'warn');
    openSheet();
    return;
  }

  state.busy = true;
  try {
    const res = await send('/open', 4000);
    if (res.status === 409) {
      toast('门正在动作', '请稍候再试', 'warn');
      return;
    }
    state.mon = 2;
    state.zanshi = state.yanshi;
    state.zAt = performance.now();
    guardUntil = performance.now() + 1500;
    render();
    haptic([12, 42, 18]);
    toast('已开门', '');
  } catch {
    toast('开门失败', '设备没有响应', 'err');
    state.online = false;
    state.err = classify();
    render();
  } finally {
    state.busy = false;
  }
}

/* ---------- 下拉手势 ---------- */

function threshold() {
  return Math.max(96, Math.min(150, innerHeight * 0.135));
}

stage.addEventListener('pointerdown', event => {
  if (!lanyard || event.button > 0) return;
  if (!lanyard.hitTest(event.clientX, event.clientY)) return;
  pull = { id: event.pointerId, y: event.clientY, peak: 0 };
  state.pull = 0.001;
  meterFill.style.width = '0%';
  meter.classList.add('on');
  render();
});

addEventListener('pointermove', event => {
  if (!pull || event.pointerId !== pull.id) return;
  const p = Math.max(0, Math.min(1.15, (event.clientY - pull.y) / threshold()));
  if (p >= 1 && pull.peak < 1) haptic(9);
  pull.peak = Math.max(pull.peak, p);
  state.pull = p;
  render();
  renderMeter();
});

function endPull(event) {
  if (!pull || (event && event.pointerId !== pull.id)) return;
  const peak = pull.peak;
  pull = null;
  state.pull = 0;
  meter.classList.remove('on');
  render();
  if (peak >= 1) openDoor();
}

addEventListener('pointerup', endPull);
addEventListener('pointercancel', endPull);

/* ---------- 设置面板 ---------- */

function netLabel() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return '未知';
  if (conn.type === 'wifi' || conn.type === 'ethernet') return 'WiFi';
  if (conn.type === 'cellular') return '移动网络';
  if (conn.effectiveType) return '网络 ' + String(conn.effectiveType).toUpperCase();
  return '未知';
}

function renderFacts() {
  const device = state.demo
    ? '<b class="ok">演示模式</b>'
    : state.online === true
      ? '<b class="ok">已连接' + (state.rssi !== null ? ' · ' + state.rssi + ' dBm' : '') + '</b>'
      : state.online === null
        ? '<b>检测中…</b>'
        : '<b class="bad">' + (state.err === 'mixed' ? '被浏览器拦截' : '无响应') + '</b>';

  const html =
    '<div><span>设备</span>' + device + '</div>' +
    '<div><span>网络</span><b>' + netLabel() + '</b></div>' +
    '<div><span>页面</span><b>' + (location.protocol === 'https:' ? 'HTTPS' : location.protocol === 'http:' ? 'HTTP' : '本地文件') + '</b></div>';

  if (html !== lastFacts) {
    lastFacts = html;
    facts.innerHTML = html;
  }

  const mixed = location.protocol === 'https:' && state.base.startsWith('http:');
  if (mixed) {
    noteText.className = 'note warn';
    noteText.innerHTML =
      '当前页面是 <b>HTTPS</b>，浏览器禁止它访问局域网里的 <b>HTTP</b> 设备。' +
      '请用手机在局域网内打开 <b>http://mj.local:48733</b>，或为设备配置 HTTPS 隧道。';
  } else {
    noteText.className = 'note';
    noteText.innerHTML =
      '手机需与 ESP32 处于同一 WiFi。地址默认 <b>http://mj.local:48733</b>；' +
      '在浏览器菜单中选择「添加到主屏幕」即可像 App 一样使用。';
  }
}

function openSheet() {
  baseInput.value = state.base;
  demoToggle.checked = state.demo;
  renderFacts();
  scrim.classList.add('show');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
}

function closeSheet() {
  scrim.classList.remove('show');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
}

async function testConnection() {
  if (state.demo) {
    toast('演示模式', '已跳过设备检测', 'warn');
    return;
  }
  state.online = null;
  render();
  renderFacts();
  try {
    applyStatus(await getJSON('/status', 3200));
    render();
    renderFacts();
    toast('设备已连接', '');
  } catch {
    state.online = false;
    state.err = classify();
    render();
    renderFacts();
    toast(state.err === 'mixed' ? '被浏览器拦截' : '未发现设备', state.err === 'mixed' ? 'HTTPS 页面无法访问 HTTP' : '请确认同一 WiFi', 'warn');
  }
}

netPill.addEventListener('click', openSheet);
$('sheetClose').addEventListener('click', closeSheet);
scrim.addEventListener('click', closeSheet);
addEventListener('keydown', event => {
  if (event.key === 'Escape' && sheet.classList.contains('open')) closeSheet();
});

saveBtn.addEventListener('click', async () => {
  const value = normalizeBase(baseInput.value);
  if (!value) {
    toast('地址不能为空', '例如 http://mj.local:48733', 'warn');
    return;
  }
  state.base = value;
  baseInput.value = value;
  store.set('mj.base', value);
  state.online = null;
  lastKey = '';
  lastFacts = '';
  render();
  await testConnection();
});

testBtn.addEventListener('click', testConnection);

demoToggle.addEventListener('change', () => {
  state.demo = demoToggle.checked;
  store.set('mj.demo', state.demo ? '1' : '0');
  state.mon = 0;
  state.online = state.demo ? true : null;
  state.err = '';
  lastKey = '';
  lastFacts = '';
  render();
  renderFacts();
});

/* ---------- 启动 ---------- */

async function boot() {
  const faces = await makeCardFaces({ logoUrl: 'assets/logo.png', ...CARD });

  lanyard = createLanyard(stage, {
    frontImage: faces.front,
    backImage: faces.back,
    strapImage: makeStrapImage(),
    cardColor: '#fffdf9',
    imageFit: 'cover',
    orientation: 'portrait',
    finish: PARAMS.get('finish') || 'satin',
    cornerRadius: 0.34,
    size: 0.6,
    anchor: 'center',
    strapLength: 0.52,
    strapColor: '#ef6c1a',
    strapWidth: 0.62,
    metal: 'gold',
    gravity: 1,
    damping: 0.52,
    elasticity: 0.55,
    breeze: 0.45,
    interactive: true,
    intro: true
  });

  render();
  poll();

  setInterval(() => {
    if (state.demo) {
      const left = Math.max(0, demoUntil - performance.now());
      state.mon = left > 0 ? 2 : 0;
      state.zanshi = left;
      state.zAt = performance.now();
    }
    if ((state.online || state.demo) && state.mon === 2) render();
  }, 250);

  const noSW = new URLSearchParams(location.search).has('nosw');
  if (!noSW && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
