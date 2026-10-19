/*
 * app.js · 天马门禁 WebApp
 * 点击工牌翻面，下拉工牌开门。前端在 GitHub Pages，设备只提供 JSON 接口。
 * 端口固定 48733；主机可填 mj.local 或设备 IP（手机建议填 IP）。
 * 密令流程：默认显示未授权小马工牌；填密令经设备验证后切换工牌（先显"待检测"），
 * 成功开门一次后才显示真实姓名与工号；/open 服务端再次校验密令。
 */

import { createLanyard } from './lanyard.js';
import { createBubbleMenu } from './bubble_menu.js';
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
const remoteInput = $('remoteInput');
const localInput = $('localInput');
const saveBtn = $('saveBtn');
const sheetClose = $('sheetClose');
const lingSheet = $('lingSheet');
const lingClose = $('lingClose');
const lingInput = $('lingInput');
const lingSave = $('lingSave');
const lingNow = $('lingNow');
const diag = $('diag');
const testBtn = $('testBtn');

const DEVICE_PORT = 48733;
const REMOTE_KEY = 'mj.remote';
const LOCAL_KEY = 'mj.local';
const LEGACY_KEY = 'mj.host';
const AIKOTOBA_KEY = 'mj.aikotoba';

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';
const BANG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6.5v7.2"/><circle cx="12" cy="18" r="1.1" fill="currentColor" stroke="none"/></svg>';

const state = {
  remote: '',
  local: 'mj.local',
  active: '',
  remoteDown: 0,
  online: null,
  err: '',
  perm: 'unknown',
  mon: 0,
  zanshi: 0,
  yanshi: 10000,
  zAt: 0,
  busy: false,
  pull: 0,
  badge: null // {ling, name, id, revealed}；null = 未授权小马工牌
};

let lanyard = null;
let pull = null;
let guardUntil = 0;
let toastTimer = 0;
let lastKey = '';

function localBase() {
  return `https://${state.local}:${DEVICE_PORT}`;
}

// 依次尝试：远程（https 隧道）→ 局域网；远程失败后 30 秒内先走局域网
function bases() {
  if (location.port === String(DEVICE_PORT)) return [location.origin];
  const list = [];
  if (state.remote && performance.now() >= state.remoteDown) list.push(state.remote);
  list.push(localBase());
  return list;
}

function deviceBase() {
  return state.active || bases()[0] || '';
}

function normalizeLocal(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'mj.local';
  return raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '') || 'mj.local';
}

function normalizeRemote(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function loadTargets() {
  try {
    const remote = normalizeRemote(localStorage.getItem(REMOTE_KEY) || '');
    const local = normalizeLocal(localStorage.getItem(LOCAL_KEY) || '');
    if (remote || local) return { remote, local: local || 'mj.local' };

    const legacy = localStorage.getItem(LEGACY_KEY) || '';
    if (/^https?:\/\//i.test(legacy)) return { remote: normalizeRemote(legacy), local: 'mj.local' };
    return { remote: '', local: normalizeLocal(legacy) || 'mj.local' };
  } catch {
    return { remote: '', local: 'mj.local' };
  }
}

function saveTargets() {
  try {
    localStorage.setItem(REMOTE_KEY, state.remote);
    localStorage.setItem(LOCAL_KEY, state.local);
  } catch {
    /* 隐私模式下忽略 */
  }
}

/* ---------- 工牌（密令） ---------- */

function loadBadge() {
  try {
    const raw = JSON.parse(localStorage.getItem(AIKOTOBA_KEY) || 'null');
    if (raw && typeof raw.ling === 'string' && raw.ling && typeof raw.id === 'string') {
      return { ling: raw.ling, name: raw.name || '小马', id: raw.id, revealed: !!raw.revealed };
    }
  } catch {
    /* 存档损坏按未授权处理 */
  }
  return null;
}

function saveBadge() {
  try {
    if (state.badge) localStorage.setItem(AIKOTOBA_KEY, JSON.stringify(state.badge));
    else localStorage.removeItem(AIKOTOBA_KEY);
  } catch {
    /* 隐私模式下忽略 */
  }
}

// 卡面实际渲染用的姓名/工号：未授权=小马0000；已验证未开门=待检测+遮蔽工号
function displayBadge() {
  if (!state.badge) return { name: '小马', id: '0000' };
  return state.badge.revealed
    ? { name: state.badge.name, id: state.badge.id }
    : { name: '待检测', id: '****' };
}

async function rebuildLanyard() {
  const faces = await makeCardFaces({ logoUrl: 'assets/logo.png', ...displayBadge() });
  if (lanyard) lanyard.destroy();
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
}

function esc(value) {
  return String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
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

  const key = [state.online, open, secs, state.pull > 0, state.pull >= 1, !!state.badge, state.err, state.perm].join('|');
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
    if (state.pull > 0) {
      hint = !state.badge ? '未授权 · 请先填写密令' : state.pull >= 1 ? '松手开门' : '继续下拉';
    } else if (!state.badge && online) {
      hint = '未授权工牌 · 点顶部菜单填写密令';
    } else if (state.perm === 'denied') hint = '浏览器已禁用本地网络访问';
    else if (state.online === false) {
      hint = location.protocol === 'https:' ? '连不上设备 · 点右上角填 IP' : '点右上角重试';
      if (cellular()) hint = '请先连接门禁所在 WiFi';
    }

    hintText.textContent = hint;
    hintText.classList.toggle('ready', state.pull >= 1 && !!state.badge);
  }

  if (sheet.classList.contains('open')) renderDiag();
}

function renderDiag() {
  const permText =
    state.perm === 'granted' ? '已允许' : state.perm === 'denied' ? '已拒绝' : '浏览器未提供';
  const online = state.online === true ? '已连接' : state.online === false ? '未连接' : '检测中';
  const page = location.protocol === 'https:' ? 'HTTPS' : location.protocol === 'http:' ? 'HTTP' : '本地文件';

  diag.innerHTML =
    `<span>接口</span><b>${esc(deviceBase())}</b>` +
    `<span>设备</span><b>${online}</b>` +
    `<span>页面</span><b>${page}</b>` +
    `<span>本地网络权限</span><b class="${state.perm === 'denied' ? 'bad' : ''}">${permText}</b>`;
}

function renderMeter() {
  meterFill.style.width = Math.min(100, state.pull * 100).toFixed(1) + '%';
}

function toast(title, sub, kind) {
  if (sheet.classList.contains('open') || lingSheet.classList.contains('open')) {
    if (sheet.classList.contains('open')) renderDiag();
    return;
  }
  toastText.textContent = title;
  toastSub.textContent = sub || '';
  tickEl.innerHTML = kind === 'warn' || kind === 'err' ? BANG : CHECK;
  toastEl.className = 'toast show' + (kind && kind !== 'ok' ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

/* ---------- 设备 ---------- */

async function request(path, ms) {
  const list = bases();
  let last = new Error('offline');

  for (const base of list) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 4500); // TLS 握手约 1s，太短会赌输
    try {
      const res = await fetch(base + path, { cache: 'no-store', signal: ctrl.signal });
      if (res.status >= 500) {
        last = new Error('HTTP ' + res.status);
        if (base === state.remote) state.remoteDown = performance.now() + 30000;
        continue;
      }
      state.active = base;
      if (base === state.remote) state.remoteDown = 0;
      return res;
    } catch (err) {
      last = err;
      if (base === state.remote) state.remoteDown = performance.now() + 30000;
    } finally {
      clearTimeout(timer);
    }
  }

  state.active = '';
  throw last;
}

async function getJSON(path, ms) {
  const res = await request(path, ms);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
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
  if (!state.badge) {
    toast('未授权工牌', '点顶部菜单填写密令', 'warn');
    return;
  }
  if (state.online !== true) {
    toast('设备未连接', '点右上角检查设备 IP', 'warn');
    return;
  }

  state.busy = true;
  try {
    const res = await request('/open?ling=' + encodeURIComponent(state.badge.ling), 4000);
    if (res.status === 401) {
      // 密令已失效：退回未授权小马工牌
      state.badge = null;
      saveBadge();
      lastKey = '';
      render();
      await rebuildLanyard();
      toast('密令已失效', '请重新填写密令', 'err');
      return;
    }
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
    // 首次成功开门：解除"待检测"，显示真实姓名与工号
    if (!state.badge.revealed) {
      state.badge.revealed = true;
      saveBadge();
      rebuildLanyard().catch(() => {});
    }
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

/* ---------- 弹窗：地址 / 切换工牌 ---------- */

function openSheet() {
  remoteInput.value = state.remote;
  localInput.value = state.local;
  scrim.classList.add('show');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  renderDiag();
}

function closeSheets() {
  scrim.classList.remove('show');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  lingSheet.classList.remove('open');
  lingSheet.setAttribute('aria-hidden', 'true');
}

function renderLingSheet() {
  const b = state.badge;
  lingNow.textContent = !b
    ? '小马 · 0000（未授权，不可开门）'
    : b.revealed
      ? `${b.name} · ${b.id}`
      : '待检测 · ****（验证通过，待首次开门）';
}

function openLingSheet() {
  lingInput.value = '';
  renderLingSheet();
  scrim.classList.add('show');
  lingSheet.classList.add('open');
  lingSheet.setAttribute('aria-hidden', 'false');
}

netPill.addEventListener('click', openSheet);
sheetClose.addEventListener('click', closeSheets);
lingClose.addEventListener('click', closeSheets);
scrim.addEventListener('click', closeSheets);
addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSheets();
});

saveBtn.addEventListener('click', async () => {
  state.remote = normalizeRemote(remoteInput.value);
  state.local = normalizeLocal(localInput.value);
  state.remoteDown = 0;
  state.active = '';
  saveTargets();
  remoteInput.value = state.remote;
  localInput.value = state.local;
  state.online = null;
  lastKey = '';
  render();
  await retry();
  renderDiag();
});

testBtn.addEventListener('click', () => {
  // 顶层导航不受混合内容限制，可用来判断「网络通不通 / IP 对不对」
  window.open(deviceBase() + '/status', '_blank', 'noopener');
});

[remoteInput, localInput].forEach(input => {
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveBtn.click();
    }
  });
});

lingSave.addEventListener('click', async () => {
  const ling = lingInput.value.trim();
  if (!ling) {
    toast('请输入密令', '', 'warn');
    return;
  }
  if (lingSave.disabled) return;
  lingSave.disabled = true;

  try {
    const res = await request('/aikotoba?ling=' + encodeURIComponent(ling), 5000);
    if (res.status === 401) {
      toast('密令无效', '请核对后重试', 'warn');
      haptic(60);
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j || j.ok !== 1 || !j.id) throw new Error('bad reply');

    state.badge = { ling, name: j.name || '小马', id: j.id, revealed: false };
    saveBadge();
    lastKey = '';
    render();
    await rebuildLanyard();
    closeSheets();
    toast('工牌已切换', '开门一次后显示姓名工号');
  } catch {
    toast('验证失败', '设备没有响应', 'err');
  } finally {
    lingSave.disabled = false;
  }
});

lingInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    lingSave.click();
  }
});

/* ---------- 启动 ---------- */

async function boot() {
  const targets = loadTargets();
  state.remote = targets.remote;
  state.local = targets.local;
  state.badge = loadBadge();

  createBubbleMenu({
    mount: document.body,
    logo: 'assets/logo.png',
    items: [
      {
        label: '切换工牌',
        rotation: -6,
        hoverStyles: { bgColor: '#f2762a', textColor: '#ffffff' },
        onClick: openLingSheet
      },
      {
        label: '设备地址',
        rotation: 6,
        hoverStyles: { bgColor: '#2b1a0e', textColor: '#fff8f0' },
        onClick: openSheet
      }
    ]
  });

  await rebuildLanyard();

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
