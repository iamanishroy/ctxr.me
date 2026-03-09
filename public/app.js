// ── STATE ──
let hwCurrentUrl = '';
let hwMarkdown = '';
let hwAbortController = null;

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return null; }
}

function hwUpdate() {
  hwCurrentUrl = document.getElementById('hwInput').value.trim();
  document.getElementById('hwGoBtn').disabled = !hwCurrentUrl;
  document.querySelectorAll('.hw-chip').forEach(c => c.classList.remove('active'));
}

function hwChip(url) {
  document.getElementById('hwInput').value = url;
  hwCurrentUrl = url;
  document.getElementById('hwGoBtn').disabled = false;
  document.querySelectorAll('.hw-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('onclick').includes(url));
  });
  hwGo();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render the raw markdown response in the output body.
 */
function renderMarkdownOutput(md) {
  return `<div class="hw-result"><pre class="hw-raw-md">${escapeHtml(md)}</pre></div>`;
}

async function hwGo() {
  let url = hwCurrentUrl.trim();
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  hwCurrentUrl = url;

  // Abort any in-flight request
  if (hwAbortController) hwAbortController.abort();
  hwAbortController = new AbortController();

  const titleEl = document.getElementById('hwOutTitle');
  const body = document.getElementById('hwOutputBody');
  const copyUrlBtn = document.getElementById('hwCopyUrlBtn');
  const copyMdBtn = document.getElementById('hwCopyMdBtn');

  const ctxrUrl = 'ctxr.me/' + url;
  titleEl.textContent = ctxrUrl;
  titleEl.classList.add('ready');
  copyUrlBtn.disabled = true;
  copyMdBtn.disabled = true;
  hwMarkdown = '';

  // Loading state
  body.innerHTML = `<div class="hw-loading"><div class="hw-spinner"></div><span>fetching ${escapeHtml(getDomain(url) || url)}…</span></div>`;

  try {
    const res = await fetch('/' + url, { signal: hwAbortController.signal });

    if (!res.ok) {
      const errText = await res.text();
      body.innerHTML = `<div class="hw-result"><div class="hw-md-h1" style="color:#ff5f57">Error ${res.status}</div><div class="hw-md-summary">${escapeHtml(errText)}</div></div>`;
      return;
    }

    hwMarkdown = await res.text();
    body.innerHTML = renderMarkdownOutput(hwMarkdown);
    copyUrlBtn.disabled = false;
    copyMdBtn.disabled = false;
  } catch (err) {
    if (err.name === 'AbortError') return; // superseded by newer request
    body.innerHTML = `<div class="hw-result"><div class="hw-md-h1" style="color:#ff5f57">Error</div><div class="hw-md-summary">${escapeHtml(err.message)}</div></div>`;
  }
}

function hwCopyUrl() {
  let url = hwCurrentUrl;
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  navigator.clipboard.writeText('ctxr.me/' + url).then(() => {
    flashBtn('hwCopyUrlBtn', 'copied!');
    toast('URL copied to clipboard');
  });
}

function hwCopyMarkdown() {
  if (!hwMarkdown) return;
  navigator.clipboard.writeText(hwMarkdown).then(() => {
    flashBtn('hwCopyMdBtn', 'copied!');
    toast('Markdown copied to clipboard');
  });
}

const CHECK_SVG = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function flashBtn(id, label) {
  const btn = document.getElementById(id);
  const orig = btn.innerHTML;
  btn.classList.add('success');
  btn.innerHTML = `${CHECK_SVG} ${label}`;
  setTimeout(() => { btn.classList.remove('success'); btn.innerHTML = orig; }, 2000);
}

function toast(msg) {
  document.getElementById('toastMsg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── SCROLL FADE ──
const observer = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.08 }
);
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
