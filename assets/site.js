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
