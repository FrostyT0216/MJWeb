/*
 * bubble_menu.js · BubbleMenu 原生移植（React Bits，逻辑照抄参考实现）
 * 汉堡切换气泡（右下角），点击弹出 pill 列表（gsap 弹入动画）
 * 弹层背景 = GradientASCII 橙色光效（gradient_ascii.js）+ 毛玻璃 pill
 * 依赖：全局 gsap（index.html 以普通 script 先于本模块加载 vendor/gsap.min.js）
 */

import { createGradientASCII } from './gradient_ascii.js';

const DEFAULT_ITEMS = [];

export function createBubbleMenu({
  mount,
  items = DEFAULT_ITEMS,
  gradient = {},
  menuBg = 'rgba(255,240,228,.14)',
  menuContentColor = '#ffe7d2',
  animationEase = 'back.out(1.5)',
  animationDuration = 0.5,
  staggerDelay = 0.12
}) {
  let isMenuOpen = false;
  let showOverlay = false;

  const nav = document.createElement('nav');
  nav.className = 'bubble-menu fixed';
  nav.setAttribute('aria-label', 'Main navigation');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'bubble toggle-bubble menu-btn';
  toggle.setAttribute('aria-label', 'Toggle menu');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.style.background = menuBg;
  const line1 = document.createElement('span');
  const line2 = document.createElement('span');
  line1.className = 'menu-line';
  line2.className = 'menu-line short';
  line1.style.background = menuContentColor;
  line2.style.background = menuContentColor;
  toggle.append(line1, line2);

  nav.append(toggle);
  mount.appendChild(nav);

  toggle.addEventListener('click', handleToggle);

  const overlay = document.createElement('div');
  overlay.className = 'bubble-menu-items fixed';
  overlay.setAttribute('aria-hidden', 'true');

  const list = document.createElement('ul');
  list.className = 'pill-list';
  list.setAttribute('role', 'menu');

  const bubbles = [];
  const labels = [];

  items.forEach((item, idx) => {
    const col = document.createElement('li');
    col.setAttribute('role', 'none');
    col.className = 'pill-col';

    const link = document.createElement('button');
    link.type = 'button';
    link.setAttribute('role', 'menuitem');
    link.setAttribute('aria-label', item.ariaLabel || item.label);
    link.className = 'pill-link';
    link.style.setProperty('--item-rot', `${item.rotation ?? 0}deg`);
    link.style.setProperty('--pill-bg', menuBg);
    link.style.setProperty('--pill-color', menuContentColor);
    link.style.setProperty('--hover-bg', item.hoverStyles?.bgColor || '#f3f4f6');
    link.style.setProperty('--hover-color', item.hoverStyles?.textColor || menuContentColor);

    const label = document.createElement('span');
    label.className = 'pill-label';
    label.textContent = item.label;
    link.appendChild(label);
    link.addEventListener('click', () => {
      handleToggle();
      item.onClick?.();
    });

    col.appendChild(link);
    list.appendChild(col);
    bubbles[idx] = link;
    labels[idx] = label;
  });

  overlay.appendChild(list);
  mount.appendChild(overlay);

  // 弹层背景：GradientASCII 光效（橙色系由调用方传入）；无 WebGL2 时组件自行降级为空
  const bg = document.createElement('div');
  bg.className = 'bubble-menu-bg';
  bg.setAttribute('aria-hidden', 'true');
  overlay.insertBefore(bg, list);
  const gradientFx = createGradientASCII(bg, gradient);

  // 点空白（模糊背景）收起菜单；点 pill 不在此触发，由 pill 自身处理器负责
  overlay.addEventListener('click', event => {
    if (!event.target.closest('.pill-link')) handleToggle();
  });

  function handleToggle() {
    const nextState = !isMenuOpen;
    if (nextState) showOverlay = true;
    isMenuOpen = nextState;
    toggle.classList.toggle('open', isMenuOpen);
    toggle.setAttribute('aria-pressed', String(isMenuOpen));
    applyMenuState();
  }

  function applyMenuState() {
    const bubbleEls = bubbles.filter(Boolean);
    const labelEls = labels.filter(Boolean);

    if (isMenuOpen) {
      overlay.style.display = 'flex';
      overlay.setAttribute('aria-hidden', 'false');
      gsap.killTweensOf([...bubbleEls, ...labelEls]);
      gsap.set(bubbleEls, { scale: 0, transformOrigin: '50% 50%' });
      gsap.set(labelEls, { y: 24, autoAlpha: 0 });

      bubbleEls.forEach((bubble, i) => {
        const delay = i * staggerDelay + gsap.utils.random(-0.05, 0.05);
        const tl = gsap.timeline({ delay });

        tl.to(bubble, { scale: 1, duration: animationDuration, ease: animationEase });
        if (labelEls[i]) {
          tl.to(
            labelEls[i],
            { y: 0, autoAlpha: 1, duration: animationDuration, ease: 'power3.out' },
            `-=${animationDuration * 0.9}`
          );
        }
      });
    } else if (showOverlay) {
      overlay.setAttribute('aria-hidden', 'true');
      gsap.killTweensOf([...bubbleEls, ...labelEls]);
      gsap.to(labelEls, { y: 24, autoAlpha: 0, duration: 0.2, ease: 'power3.in' });
      gsap.to(bubbleEls, {
        scale: 0,
        duration: 0.2,
        ease: 'power3.in',
        onComplete: () => {
          overlay.style.display = 'none';
          showOverlay = false;
        }
      });
    }
  }

  // 桌面端保留每个菜单项的倾斜角，窄屏归零（照抄参考实现的 resize 逻辑）
  function handleResize() {
    if (!isMenuOpen) return;
    const isDesktop = window.innerWidth >= 900;
    bubbles.forEach((bubble, i) => {
      const item = items[i];
      if (bubble && item) {
        const rotation = isDesktop ? (item.rotation ?? 0) : 0;
        gsap.set(bubble, { rotation });
      }
    });
  }
  window.addEventListener('resize', handleResize);

  overlay.style.display = 'none';

  return {
    close() {
      if (isMenuOpen) handleToggle();
    },
    destroy() {
      gradientFx.destroy();
      window.removeEventListener('resize', handleResize);
      nav.remove();
      overlay.remove();
    }
  };
}
