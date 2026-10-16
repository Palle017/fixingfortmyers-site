// Enhance the existing intake form without duplicating controls or changing submission.
(() => {
  'use strict';
  const panel = document.getElementById('contact');
  const form = document.getElementById('bookingForm');
  if (!panel || !form || typeof HTMLDialogElement === 'undefined' ||
      typeof HTMLDialogElement.prototype.showModal !== 'function') return;

  const dialog = document.createElement('dialog');
  dialog.id = 'repair-request-dialog';
  dialog.className = 'repair-dialog';
  dialog.setAttribute('aria-labelledby', 'request-heading');
  dialog.setAttribute('closedby', 'any');
  const controls = document.createElement('div');
  controls.className = 'repair-dialog__controls';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'repair-dialog__close';
  close.textContent = 'Close form';
  controls.append(close);
  dialog.append(controls);
  document.body.append(dialog);
  const placeholder = document.createElement('div');
  placeholder.hidden = true;
  placeholder.setAttribute('aria-hidden', 'true');
  panel.before(placeholder);
  let returnTo;

  const restorePanel = () => {
    placeholder.after(panel);
    placeholder.hidden = true;
    document.documentElement.classList.remove('repair-dialog-open');
  };
  const open = opener => {
    if (dialog.open) return true;
    returnTo = opener || document.activeElement;
    placeholder.style.height = `${panel.getBoundingClientRect().height}px`;
    placeholder.hidden = false;
    dialog.append(panel);
    try { dialog.showModal(); }
    catch (_) { restorePanel(); return false; }
    document.documentElement.classList.add('repair-dialog-open');
    dialog.scrollTop = 0;
    const heading = document.getElementById('request-heading');
    heading.tabIndex = -1;
    heading.focus({preventScroll:true});
    return true;
  };
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    restorePanel();
    if (location.hash === '#contact') {
      try { history.replaceState(history.state, '', location.pathname + location.search); }
      catch (_) { /* Form closing still works when history is unavailable. */ }
    }
    const fallback = document.querySelector('#hero-appointment-continue, .request-page__open');
    const target = returnTo?.isConnected && returnTo.getClientRects().length ? returnTo : fallback;
    target?.focus({preventScroll:true});
  });
  const samePage = pathname => {
    const normalize = path => path.replace(/\/index(?:\.html)?\/?$/, '/').replace(/\.html$/, '').replace(/\/$/, '') || '/';
    return normalize(pathname) === normalize(location.pathname);
  };
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    let url;
    try { url = new URL(link.href); } catch (_) { return; }
    if (url.origin !== location.origin || url.hash !== '#contact' || !samePage(url.pathname)) return;
    window.PT_REPAIR_CONTEXT?.applyService(url.searchParams.get('service'));
    if (open(link)) event.preventDefault();
  });
  form.addEventListener('pt:repair-review', () => open());
  window.addEventListener('hashchange', () => {
    if (location.hash === '#contact') open();
    else if (dialog.open) dialog.close();
  });
  if (location.hash === '#contact' || document.body.hasAttribute('data-repair-popup')) {
    open();
    // Initial fragment navigation can move focus after deferred scripts run.
    window.addEventListener('pageshow', () => requestAnimationFrame(() => {
      if (dialog.open && !dialog.contains(document.activeElement)) {
        document.getElementById('request-heading').focus({preventScroll:true});
      }
    }), {once:true});
  }
})();
