/*
 * faces.js · 工牌正反面纹理（Canvas 绘制，1024 × 1440）
 * 由 app.js 调用，输出 dataURL 交给 Lanyard 贴图。
 */

const W = 1024;
const H = 1440;
const FONT = '"PingFang SC","HarmonyOS Sans SC","MiSans","Source Han Sans SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,"Courier New",monospace';
const ORANGE = '#e8661a';

const loadImage = src =>
  new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const seedRandom = seed => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const roundRect = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const spaced = (ctx, text, cx, y, spacing) => {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  return total;
};

const spacedWidth = (ctx, text, spacing) => {
  const chars = [...text];
  const widths = chars.map(c => ctx.measureText(c).width);
  return widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
};

function drawFront(ctx, logo, name, id) {
  const paper = ctx.createLinearGradient(0, 0, W * 0.35, H);
  paper.addColorStop(0, '#ffffff');
  paper.addColorStop(0.5, '#fffdf9');
  paper.addColorStop(1, '#fff2e2');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // 防伪同心圆
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#c2570f';
  ctx.lineWidth = 2.5;
  for (let r = 130; r <= 780; r += 24) {
    ctx.beginPath();
    ctx.arc(W / 2, 800, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 顶部高光
  const sheen = ctx.createLinearGradient(0, 0, W * 0.9, 520);
  sheen.addColorStop(0, 'rgba(255,255,255,.9)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, 620);

  if (logo) {
    const lw = 600;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (W - lw) / 2, 216, lw, lh);
  }

  // 分隔线
  const ruleY = 556;
  const rule = ctx.createLinearGradient(W / 2 - 90, 0, W / 2 + 90, 0);
  rule.addColorStop(0, 'rgba(194,78,12,0)');
  rule.addColorStop(0.5, 'rgba(194,78,12,.55)');
  rule.addColorStop(1, 'rgba(194,78,12,0)');
  ctx.fillStyle = rule;
  ctx.fillRect(W / 2 - 90, ruleY, 180, 2);
  ctx.beginPath();
  ctx.arc(W / 2, ruleY + 1, 6, 0, Math.PI * 2);
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W / 2, ruleY + 1, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(242,106,27,.14)';
  ctx.fill();

  // 姓名
  ctx.fillStyle = '#2b1a0e';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 150px ${FONT}`;
  spaced(ctx, name, W / 2, 736, 14);

  // 工号胶囊
  const label = '工号';
  const value = id;
  ctx.font = `400 32px ${FONT}`;
  const lw2 = ctx.measureText(label).width;
  ctx.font = `600 54px ${MONO}`;
  const vw = ctx.measureText(value).width + 3 * 6;
  const padX = 34;
  const gap = 20;
  const sep = 1;
  const pillW = padX * 2 + lw2 + gap + sep + gap + vw;
  const pillH = 96;
  const pillX = (W - pillW) / 2;
  const pillY = 812;

  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = 'rgba(242,106,27,.075)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,106,27,.2)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9a5426';
  ctx.font = `400 32px ${FONT}`;
  ctx.fillText(label, pillX + padX, pillY + pillH / 2 + 1);

  const sepX = pillX + padX + lw2 + gap;
  ctx.fillStyle = 'rgba(194,78,12,.25)';
  ctx.fillRect(sepX, pillY + 28, sep, pillH - 56);

  ctx.fillStyle = '#a03c05';
  ctx.font = `600 54px ${MONO}`;
  let vx = sepX + gap + 2;
  [...value].forEach(ch => {
    ctx.fillText(ch, vx, pillY + pillH / 2 + 2);
    vx += ctx.measureText(ch).width + 6;
  });

  // 微缩文字与说明
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(126,84,52,.62)';
  ctx.font = `500 17px ${FONT}`;
  spaced(ctx, 'TIANMA INNOVATION · STAFF ACCESS', W / 2, 1042, 7);

  ctx.fillStyle = 'rgba(96,62,38,.68)';
  ctx.font = `400 20px ${FONT}`;
  spaced(ctx, '本卡为门禁通行证 · 仅限本人使用', W / 2, 1176, 3);

  // 底部色带
  const bandTop = 1262;
  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, '#c74a08');
  band.addColorStop(0.42, '#ee6a1a');
  band.addColorStop(0.7, '#f57f31');
  band.addColorStop(1, '#d9550f');
  ctx.fillStyle = band;
  ctx.fillRect(0, bandTop, W, H - bandTop);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandTop, W, H - bandTop);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.09)';
  ctx.lineWidth = 14;
  for (let x = -H; x < W + H; x += 58) {
    ctx.beginPath();
    ctx.moveTo(x, bandTop);
    ctx.lineTo(x + 190, H);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,.38)';
  ctx.fillRect(0, bandTop, W, 2);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fffaf4';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('门禁通行证', 96, bandTop + 90);

  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = '#fffaf4';
  const ap = spacedWidth(ctx, 'ACCESS PASS', 5);
  ctx.save();
  ctx.textAlign = 'left';
  spaced(ctx, 'ACCESS PASS', W - 96 - ap / 2, bandTop + 92, 5);
  ctx.restore();
}

function drawBack(ctx, logo, id) {
  const paper = ctx.createLinearGradient(0, 0, W * 0.4, H);
  paper.addColorStop(0, '#fffefb');
  paper.addColorStop(1, '#fff5ea');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // 磁条
  const stripeY = 168;
  const stripeH = 168;
  const stripe = ctx.createLinearGradient(0, stripeY, 0, stripeY + stripeH);
  stripe.addColorStop(0, '#332b25');
  stripe.addColorStop(0.28, '#1a1411');
  stripe.addColorStop(0.55, '#241c17');
  stripe.addColorStop(1, '#100c0a');
  ctx.fillStyle = stripe;
  ctx.fillRect(0, stripeY, W, stripeH);
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fillRect(0, stripeY, W, 2);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(0, stripeY + stripeH - 4, W, 4);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#4a382c';
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText('天马创新 · 门禁通行证', 96, 470);

  ctx.fillStyle = 'rgba(90,66,50,.62)';
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText('仅限本人使用，如有拾获请交至前台。', 96, 518);
  ctx.fillText('非授权使用将被记录并追究责任。', 96, 556);

  // 条码
  const barTop = 760;
  const barH = 190;
  const left = 168;
  const right = W - 168;
  const rand = seedRandom(4);
  ctx.fillStyle = '#221913';
  let x = left;
  ctx.fillRect(x, barTop, 4, barH);
  x += 12;
  while (x < right - 12) {
    const w = 3 + Math.floor(rand() * 8);
    const gap = 3 + Math.floor(rand() * 6);
    if (x + w > right - 8) break;
    ctx.fillRect(x, barTop, w, barH);
    x += w + gap;
  }
  ctx.fillRect(right - 4, barTop, 4, barH);

  ctx.fillStyle = 'rgba(70,48,34,.7)';
  ctx.font = `500 18px ${MONO}`;
  spaced(ctx, `TM - ${id} - ACCESS`, W / 2, barTop - 26, 3);

  ctx.fillStyle = '#3a281b';
  ctx.font = `600 34px ${MONO}`;
  spaced(ctx, `NO. ${id}`, W / 2, barTop + barH + 62, 6);

  if (logo) {
    const lw = 300;
    const lh = (logo.height / logo.width) * lw;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, (W - lw) / 2, 1188, lw, lh);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgba(160,110,70,.45)';
  ctx.font = `500 15px ${FONT}`;
  spaced(ctx, 'TIANMA INNOVATION · ACCESS CONTROL', W / 2, 1356, 5);
}

export async function makeCardFaces({ logoUrl, name = '小马', id = '0000' }) {
  const logo = await loadImage(logoUrl);
  const front = document.createElement('canvas');
  const back = document.createElement('canvas');
  front.width = back.width = W;
  front.height = back.height = H;
  drawFront(front.getContext('2d'), logo, name, id);
  drawBack(back.getContext('2d'), logo, id);
  return {
    front: front.toDataURL('image/png'),
    back: back.toDataURL('image/png')
  };
}

export function makeStrapImage() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ea6d22';
  ctx.fillRect(0, 0, 512, 192);

  // 极轻的横向织纹
  ctx.fillStyle = 'rgba(74,22,0,.05)';
  for (let y = 0; y < 192; y += 4) ctx.fillRect(0, y, 512, 1);
  ctx.fillStyle = 'rgba(255,220,190,.05)';
  for (let y = 2; y < 192; y += 8) ctx.fillRect(0, y, 512, 1);

  // 边缘压深，模拟织物收边
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(120,42,2,${0.1 - i * 0.013})`;
    ctx.fillRect(0, i, 512, 1);
    ctx.fillRect(0, 191 - i, 512, 1);
  }

  ctx.strokeStyle = 'rgba(255,238,220,.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(0, 11);
  ctx.lineTo(512, 11);
  ctx.moveTo(0, 181);
  ctx.lineTo(512, 181);
  ctx.stroke();
  ctx.setLineDash([]);


  return c.toDataURL('image/png');
}
