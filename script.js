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
  chartTooltip.textContent = bar.getAttribute('data-chart-tooltip') || bar.getAttribute('aria-label');
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
  const evidence = track.dataset.evidence || (approximate ? 'Approximate chart reading' : 'Calculated from prediction arrays');
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = track.className;
  bar.setAttribute('aria-label', `${model} · ${metric}: ${value} (${evidence})`);
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
  if (!event.target.closest('.result-bar-track, [data-chart-tooltip], .chart-tooltip')) closeChartTooltip();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeChartTooltip();
});
window.addEventListener('scroll', closeChartTooltip, { passive: true });
window.addEventListener('resize', closeChartTooltip);

document.querySelectorAll('[data-chart-tooltip]').forEach((element) => {
  element.setAttribute('aria-label', element.dataset.chartTooltip);
  element.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch') showChartTooltip(element);
  });
  element.addEventListener('pointerleave', () => {
    if (document.activeElement !== element && activeBar === element) closeChartTooltip();
  });
  element.addEventListener('focus', () => showChartTooltip(element));
  element.addEventListener('blur', closeChartTooltip);
  element.addEventListener('click', () => showChartTooltip(element));
});

document.querySelectorAll('[data-comparison-metric]').forEach((control) => {
  control.addEventListener('click', () => {
    closeChartTooltip();
    const metric = control.dataset.comparisonMetric;
    const name = metric === 'macro_f1' ? 'Macro-F1' : 'Macro ROC-AUC';
    document.querySelectorAll('[data-comparison-metric]').forEach(button => button.setAttribute('aria-pressed', String(button === control)));
    document.querySelectorAll('[data-feature-model]').forEach((bar) => {
      const value = Number(metric === 'macro_f1' ? bar.dataset.macroF1 : bar.dataset.aucRocOvr);
      bar.querySelector('span').style.width = `${value * 100}%`;
      bar.closest('.groupplot-row').querySelector('strong').textContent = value.toFixed(4);
      bar.dataset.chartTooltip = `${bar.dataset.featureModel}, ${name}: ${value.toFixed(4)}`;
      bar.setAttribute('aria-label', bar.dataset.chartTooltip);
    });
    document.getElementById('comparison-caption').textContent = `${name} · scale 0–1. Values are from the supplied exports.`;
  });
});
document.querySelectorAll('[data-roc-filter]').forEach((control) => {
  control.addEventListener('click', () => {
    closeChartTooltip();
    const selected = control.dataset.rocFilter;
    document.querySelectorAll('[data-roc-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === control)));
    document.querySelectorAll('[data-roc-class]').forEach((curve) => {
      const visible = selected === 'All' || curve.dataset.rocClass === selected;
      curve.style.display = visible ? '' : 'none';
      curve.setAttribute('aria-hidden', String(!visible));
    });
  });
});
document.getElementById('driver-list-toggle')?.addEventListener('click', (event) => {
  closeChartTooltip();
  const button = event.currentTarget;
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  document.querySelectorAll('[data-driver-extra]').forEach(row => { row.hidden = !expanded; });
  button.setAttribute('aria-expanded', String(expanded));
  button.textContent = expanded ? 'Show top 5 terms' : 'Show all 15 terms';
});

const metricDescriptions = {
  precision: 'Precision: among predictions for a class, how many were correct? Scores range from 0 to 1.',
  recall: 'Recall: among actual reviews in a class, how many were found? Scores range from 0 to 1.',
  f1: 'F1 balances precision and recall. Scores range from 0 to 1.'
};
document.querySelectorAll('[data-class-metric]').forEach((control) => {
  control.addEventListener('click', () => {
    closeChartTooltip();
    const metric = control.dataset.classMetric;
    const name = control.textContent;
    document.querySelectorAll('[data-class-metric]').forEach(button => button.setAttribute('aria-pressed', String(button === control)));
    const announcements = [];
    document.querySelectorAll('.class-metric-track').forEach((bar) => {
      const value = Number(bar.dataset[metric]);
      const row = bar.closest('.class-metric-row');
      const label = row.querySelector('span').textContent;
      bar.querySelector('span').style.width = `${value * 100}%`;
      row.querySelector('strong').textContent = value.toFixed(4);
      bar.dataset.chartTooltip = `${label} ${name}: ${value.toFixed(4)}`;
      bar.setAttribute('aria-label', bar.dataset.chartTooltip);
      announcements.push(bar.dataset.chartTooltip);
    });
    document.getElementById('class-metric-description').textContent = metricDescriptions[metric];
    document.getElementById('class-metric-announcement').textContent = announcements.join('. ');
  });
});

document.getElementById('export-lr-metrics')?.addEventListener('click', () => {
  const resultData = JSON.parse(document.getElementById('lr-result-data').textContent);
  const matrix = resultData.matrix;
  const labels = ['Negative','Neutral','Positive'];
  const rows = [['Class','Precision','Recall','F1','Support','Evidence']];
  matrix.forEach((row,i) => {
    const support = row.reduce((sum,value)=>sum+value,0);
    const precision = row[i]/matrix.reduce((sum,r)=>sum+r[i],0);
    const recall = row[i]/support;
    rows.push([labels[i],precision.toFixed(6),recall.toFixed(6),(2*precision*recall/(precision+recall)).toFixed(6),support,resultData.evidence]);
  });
  const blob = new Blob([rows.map(row=>row.join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'trendminers-lr-matrix-metrics.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});

document.querySelectorAll('[data-team-photo]').forEach((photo) => {
  const frame = photo.closest('.team-photo-frame');
  const fallback = photo.closest('.team-member').querySelector('[data-team-photo-fallback]');
  const updatePhoto = () => {
    const ready = photo.complete && photo.naturalWidth > 0;
    photo.hidden = !ready;
    if (frame) frame.hidden = !ready;
    if (fallback) fallback.hidden = ready;
  };
  photo.addEventListener('load', updatePhoto);
  photo.addEventListener('error', updatePhoto);
  updatePhoto();
});

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
      const label = item.querySelector?.('[data-resource-label]');
      const arrow = item.querySelector?.('.resource-link b');
      if (label) label.textContent = selected ? 'Hide files' : 'View files';
      if (arrow) arrow.textContent = selected ? '↑' : '↓';
    });
    resourcePanels.forEach((panel) => {
      panel.hidden = !shouldOpen || panel.id !== panelId;
    });
  });
});
