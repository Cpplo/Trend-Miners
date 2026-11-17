document.documentElement.classList.add('js-ready');

const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.primary-nav');
const navLinks = [...document.querySelectorAll('.primary-nav a[href^="#"]')];
const sections = [...document.querySelectorAll('[data-section]')];
const reveals = [...document.querySelectorAll('.reveal')];

function closeMenu() {
  if (!nav || !menuToggle) return;
  nav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.forEach((link) => link.addEventListener('click', closeMenu));

document.addEventListener('click', (event) => {
  if (nav?.classList.contains('is-open') && !nav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
});

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
  });
}, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
sections.forEach((section) => sectionObserver.observe(section));

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.1, rootMargin: '0px 0px -30px' });
reveals.forEach((item) => revealObserver.observe(item));

const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 10);
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

// A shared tooltip stays inside the viewport, including on narrow phones.
const chartTooltip = document.createElement('div');
chartTooltip.className = 'chart-tooltip';
chartTooltip.id = 'chart-tooltip';
chartTooltip.setAttribute('role', 'tooltip');
chartTooltip.hidden = true;
document.body.append(chartTooltip);
let activeBar = null;

function closeChartTooltip() {
  activeBar?.removeAttribute('aria-describedby');
  activeBar = null;
  chartTooltip.hidden = true;
}

function showChartTooltip(bar) {
  closeChartTooltip();
  activeBar = bar;
  chartTooltip.textContent = bar.getAttribute('aria-label');
  chartTooltip.hidden = false;
  bar.setAttribute('aria-describedby', chartTooltip.id);
  const rect = bar.getBoundingClientRect();
  const box = chartTooltip.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - 12));
  const top = rect.top >= box.height + 20 ? rect.top - box.height - 10 : rect.bottom + 10;
  chartTooltip.style.left = `${left}px`;
  chartTooltip.style.top = `${Math.max(12, Math.min(top, window.innerHeight - box.height - 12))}px`;
}

document.querySelectorAll('.result-bar-track').forEach((track) => {
  const row = track.closest('.result-bar-row');
  const model = track.closest('.result-model').querySelector('h4').textContent;
  const metric = row.querySelector('span').textContent;
  const value = row.querySelector('strong').textContent;
  const approximate = value.includes('\u2248');
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = track.className;
  bar.setAttribute('aria-label', `${model} · ${metric}: ${value}${approximate ? ' (approximate chart reading)' : ' (calculated from confusion matrix)'}`);
  bar.append(...track.childNodes);
  track.replaceWith(bar);
  bar.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch') showChartTooltip(bar);
  });
  bar.addEventListener('pointerleave', () => {
    if (document.activeElement !== bar && activeBar === bar) closeChartTooltip();
  });
  bar.addEventListener('focus', () => showChartTooltip(bar));
  bar.addEventListener('blur', closeChartTooltip);
  bar.addEventListener('click', () => showChartTooltip(bar));
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.result-bar-track, .chart-tooltip')) closeChartTooltip();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeChartTooltip();
});
window.addEventListener('scroll', closeChartTooltip, { passive: true });
window.addEventListener('resize', closeChartTooltip);

const resourceCards = document.querySelectorAll('.resource-grid .resource-card');
const resourcePanels = document.querySelectorAll('#files .resource-panel');

resourceCards.forEach((card) => {
  card.addEventListener('click', () => {
    const panelId = card.getAttribute('aria-controls');
    const shouldOpen = card.getAttribute('aria-expanded') !== 'true';
    resourceCards.forEach((item) => {
      const selected = shouldOpen && item === card;
      item.classList.toggle('resource-card-dark', selected);
      item.setAttribute('aria-expanded', String(selected));
    });
    resourcePanels.forEach((panel) => {
      panel.hidden = !shouldOpen || panel.id !== panelId;
    });
  });
});
