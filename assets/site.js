(() => {
  'use strict';
  const library = document.querySelector('.library');
  if (library) {
    const cards = [...library.querySelectorAll('.note-card')];
    const buttons = [...library.querySelectorAll('[data-filter]')];
    const search = library.querySelector('#article-search');
    let category = 'all';
    const update = () => {
      const query = search.value.trim().toLocaleLowerCase();
      let count = 0;
      cards.forEach(card => {
        const visible = (category === 'all' || card.dataset.category === category) && card.textContent.toLocaleLowerCase().includes(query);
        card.hidden = !visible;
        count += Number(visible);
      });
      library.querySelector('#result-count').textContent = `显示 ${count} / ${cards.length} 篇笔记`;
      library.querySelector('.empty-state').hidden = count !== 0;
    };
    buttons.forEach(button => button.addEventListener('click', () => {
      category = button.dataset.filter;
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      update();
    }));
    search.addEventListener('input', update);
    library.querySelector('.library-tools').hidden = false;
  }

  const timeline = document.querySelector('#security-timeline');
  if (timeline) {
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const entries = [...timeline.querySelectorAll('[data-until]')]
      .sort((left, right) => left.dataset.sort.localeCompare(right.dataset.sort));
    let upcoming = 0;
    entries.forEach(entry => {
      if (entry.dataset.until <= today) {
        entry.remove();
        return;
      }
      upcoming += 1;
      timeline.append(entry);
    });
    document.querySelector('#security-timeline-empty').hidden = upcoming !== 0;
  }

  document.querySelectorAll('[data-soc-explorer]').forEach(explorer => {
    const controls = explorer.querySelector('.soc-controls');
    const buttons = [...controls.querySelectorAll('[data-soc-view]')];
    const routes = [...explorer.querySelectorAll('[data-routes]')];
    const descriptions = [...explorer.querySelectorAll('[data-soc-description]')];
    buttons.forEach(button => button.addEventListener('click', () => {
      const view = button.dataset.socView;
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      routes.forEach(route => {
        route.classList.toggle('is-route-active', view !== 'all' && route.dataset.routes.split(' ').includes(view));
      });
      descriptions.forEach(description => {
        description.hidden = description.dataset.socDescription !== view;
      });
    }));
    controls.hidden = false;
  });

  const toc = document.querySelector('#reading-toc');
  if (toc) {
    const headings = [...document.querySelectorAll('.technical-article h2[id]')];
    const links = [...toc.querySelectorAll('a')];
    const compactLayout = window.matchMedia('(max-width: 760px)');
    const disclosure = toc.closest('details');
    const adaptToc = () => { disclosure.open = !compactLayout.matches; };
    adaptToc();
    compactLayout.addEventListener('change', adaptToc);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        const active = entries.find(entry => entry.isIntersecting);
        if (!active) return;
        links.forEach(link => {
          if (link.hash === `#${active.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }, { rootMargin: '-12% 0px -65% 0px', threshold: 0 });
      headings.forEach(heading => observer.observe(heading));
    }
  }
})();
