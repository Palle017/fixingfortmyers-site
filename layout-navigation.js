/* All navigation links are present in HTML; this only enhances disclosure behavior. */
(() => {
  'use strict';
  const header = document.getElementById('layout-header');
  if (!header) return;
  const navigation = header.querySelector('.pt-layout-navigation');
  const menuButton = header.querySelector('.pt-layout-menu-toggle');
  const groups = [...header.querySelectorAll('.pt-layout-group')];
  const desktop = window.matchMedia('(min-width: 981px)');
  const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const hoverOpened = new WeakSet();
  const timers = new WeakMap();

  function closeGroups(except) {
    groups.forEach(group => {
      if (group !== except) {
        clearTimeout(timers.get(group));
        group.open = false;
        hoverOpened.delete(group);
      }
    });
  }
  function setMobileMenu(open) {
    header.dataset.menuOpen = String(open);
    menuButton.setAttribute('aria-expanded', String(open));
    if (!open) closeGroups();
  }

  header.classList.add('pt-layout-ready');
  setMobileMenu(false);
  menuButton.addEventListener('click', () => setMobileMenu(header.dataset.menuOpen !== 'true'));

  groups.forEach(group => {
    const summary = group.querySelector('summary');
    summary.addEventListener('click', event => {
      closeGroups(group);
      // A mouse hover has already opened the panel: the first click pins it open.
      if (hoverOpened.has(group)) event.preventDefault();
      hoverOpened.delete(group);
    });
    group.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(group.open));
      if (group.open) closeGroups(group);
    });
    summary.setAttribute('aria-expanded', String(group.open));
    group.addEventListener('pointerenter', event => {
      if (!desktop.matches || !hoverPointer.matches || event.pointerType !== 'mouse') return;
      clearTimeout(timers.get(group));
      if (!group.open) {
        closeGroups(group);
        hoverOpened.add(group);
        group.open = true;
      }
    });
    group.addEventListener('pointerleave', () => {
      if (!hoverOpened.has(group)) return;
      timers.set(group, setTimeout(() => {
        if (group.contains(document.activeElement)) return;
        group.open = false;
        hoverOpened.delete(group);
      }, 180));
    });
    group.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (!group.contains(document.activeElement) && !group.matches(':hover')) {
          group.open = false;
          hoverOpened.delete(group);
        }
      });
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!header.contains(event.target)) {
      closeGroups();
      if (!desktop.matches) setMobileMenu(false);
    }
  });
  header.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const activeGroup = groups.find(group => group.open && group.contains(event.target));
    if (activeGroup) {
      activeGroup.open = false;
      hoverOpened.delete(activeGroup);
      activeGroup.querySelector('summary').focus();
    } else {
      closeGroups();
      if (!desktop.matches && header.dataset.menuOpen === 'true') {
        setMobileMenu(false);
        menuButton.focus();
      }
    }
    event.preventDefault();
  });
  navigation.addEventListener('click', event => {
    if (!event.target.closest('a')) return;
    closeGroups();
    if (!desktop.matches) setMobileMenu(false);
  });
  desktop.addEventListener('change', () => {
    setMobileMenu(false);
    closeGroups();
  });
})();
