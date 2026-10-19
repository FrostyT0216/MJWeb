/*
 * app.js · 天马门禁 WebApp
 * 点击工牌翻面，下拉工牌开门。前端在 GitHub Pages，设备只提供 JSON 接口。
 * 端口固定 48733；主机可填 mj.local 或设备 IP（手机建议填 IP）。
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
const hostInput = $('hostInput');
const saveBtn = $('saveBtn');
const sheetClose = $('sheetClose');
const diag = $('diag');

const CARD = { name: '小马', id: '0000' };

const DEVICE_PORT = 48733;
const HOST_KEY = 'mj.host';

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';
const BANG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6.5v7.2"/><circle cx="12" cy="18" r="1.1" fill="currentColor" stroke="none"/></svg>';

const state = {
  host: 'mj.local',
  online: null,
  err: '',
  perm: 'unknown',
  mon: 0,
  zanshi: 0,
  yanshi: 10000,
  zAt: 0,
  busy: false,
  pull: 0
};

let lanyard = null;
let pull = null;
let guardUntil = 0;
let toastTimer = 0;
let lastKey = '';

function deviceBase() {
  if (location.port === String(DEVICE_PORT)) return location.origin;
  return `http://${state.host}:${DEVICE_PORT}`;
}

function normalizeHost(value) {
  let v = String(value || '').trim();
  v = v.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  return v || 'mj.local';
}

function loadHost() {
  try {
    return normalizeHost(localStorage.getItem(HOST_KEY) || 'mj.local');
  } catch {
    return 'mj.local';
  }
}

function saveHost(value) {
  try {
    localStorage.setItem(HOST_KEY, value);
  } catch {
    /* 隐私模式下忽略 */
  }
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

function cellular() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return !!conn && conn.type === 'cellular';
}

async function readPermission() {
  if (!navigator.permissions?.query) {
    state.perm = 'unknown';
    return;
  }
  for (const name of ['local-network', 'local-network-access', 'loopback-network']) {
    try {
      const result = await navigator.permissions.query({ name });
      state.perm = result.state;
      return;
    } catch {
      /* 浏览器不认这个权限名，继续试下一个 */
    }
  }
  state.perm = 'unknown';
}

/* ---------- 界面 ---------- */

function render() {
  const online = state.online === true;
  const open = online && state.mon === 2;
  const secs = open ? Math.max(1, Math.ceil(leftMs() / 1000)) : 0;

  const key = [state.online, open, secs, state.pull > 0, state.pull >= 1, state.err, state.perm].join('|');
  if (key !== lastKey) {
    lastKey = key;

    netPill.className = 'pill ' + (online ? 'on' : state.online === null ? '' : 'off');
    netText.textContent = online ? '已连接' : state.online === null ? '连接中' : '未连接';

    stateWrap.className = 'state' + (open ? ' open' : state.online === false ? ' off' : '');
    stateText.textContent = open
      ? `已开门 · ${secs} 秒后自动上锁`
      : online
        ? '门已上锁'
        : state.online === null
          ? '正在连接'
          : '设备未连接';

    let hint = '下拉工牌开门 · 点击翻面';
    if (state.pull > 0) hint = state.pull >= 1 ? '松手开门' : '继续下拉';
    else if (state.perm === 'denied') hint = '浏览器已禁用本地网络访问';
    else if (state.online === false) {
      hint = location.protocol === 'https:' ? '连不上设备 · 点右上角填 IP' : '点右上角重试';
      if (cellular()) hint = '请先连接门禁所在 WiFi';
    }

    hintText.textContent = hint;
    hintText.classList.toggle('ready', state.pull >= 1);
  }

  if (sheet.classList.contains('open')) renderDiag();
}

function renderDiag() {
  const permText =
    state.perm === 'granted' ? '已允许' : state.perm === 'denied' ? '已拒绝' : '浏览器未提供';
  const online = state.online === true ? '已连接' : state.online === false ? '未连接' : '检测中';
  const page = location.protocol === 'https:' ? 'HTTPS' : location.protocol === 'http:' ? 'HTTP' : '本地文件';

  diag.innerHTML =
    `<span>设备</span><b>${online}</b>` +
    `<span>页面</span><b>${page}</b>` +
    `<span>本地网络权限</span><b class="${state.perm === 'denied' ? 'bad' : ''}">${permText}</b>`;
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

function getJSON(path, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 3500);
  return fetch(deviceBase() + path, { cache: 'no-store', signal: ctrl.signal })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .finally(() => clearTimeout(timer));
}

function send(path, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 4000);
  return fetch(deviceBase() + path, { cache: 'no-store', signal: ctrl.signal }).finally(() =>
    clearTimeout(timer)
  );
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
}

async function poll() {
  try {
    applyStatus(await getJSON('/status'));
  } catch {
    state.online = false;
    state.err = 'net';
    await readPermission();
  }
  render();
  setTimeout(poll, state.online ? (state.mon === 2 ? 600 : 1600) : 3000);
}

async function retry() {
  state.online = null;
  state.err = '';
  lastKey = '';
  render();
  try {
    applyStatus(await getJSON('/status', 3000));
    render();
    toast('设备已连接', '');
  } catch {
    state.online = false;
    state.err = 'net';
    await readPermission();
    render();
    toast(
      state.perm === 'denied' ? '本地网络被禁用' : '未发现设备',
      state.perm === 'denied' ? '请在浏览器设置中允许' : '检查 WiFi 与设备 IP',
      'warn'
    );
  }
}

async function openDoor() {
  if (state.busy) return;
  if (state.online !== true) {
    toast('设备未连接', '点右上角检查设备 IP', 'warn');
    return;
  }

  state.busy = true;
  try {
    const res = await send('/open', 4000);
    if (res.status === 409) {
      toast('门正在动作', '请稍候再试', 'warn');
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
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
    state.err = 'net';
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

/* ---------- 地址面板 ---------- */

function openSheet() {
  hostInput.value = state.host;
  scrim.classList.add('show');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  renderDiag();
}

function closeSheet() {
  scrim.classList.remove('show');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
}

netPill.addEventListener('click', openSheet);
sheetClose.addEventListener('click', closeSheet);
scrim.addEventListener('click', closeSheet);
addEventListener('keydown', event => {
  if (event.key === 'Escape' && sheet.classList.contains('open')) closeSheet();
});

saveBtn.addEventListener('click', async () => {
  const host = normalizeHost(hostInput.value);
  state.host = host;
  saveHost(host);
  hostInput.value = host;
  state.online = null;
  lastKey = '';
  render();
  await retry();
  renderDiag();
});

hostInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveBtn.click();
  }
});

/* ---------- 启动 ---------- */

async function boot() {
  state.host = loadHost();
  const faces = await makeCardFaces({ logoUrl: 'assets/logo.png', ...CARD });

  lanyard = createLanyard(stage, {
    frontImage: faces.front,
    backImage: faces.back,
    strapImage: makeStrapImage(),
    cardColor: '#fffdf9',
    imageFit: 'cover',
    orientation: 'portrait',
    finish: 'satin',
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

  await readPermission();
  render();
  poll();

  setInterval(() => {
    if (state.online && state.mon === 2) render();
  }, 250);

  if (
    'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
