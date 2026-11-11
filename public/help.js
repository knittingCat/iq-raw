(async () => {
  // Shows TROUBLESHOOTING.md, one <section> per ## heading, with a contents list and a search filter.
  const $ = (id) => document.getElementById(id);
  const doc = $('helpDoc'), toc = $('helpToc'), status = $('helpStatus'), search = $('helpSearch');
  let text;
  try {
    const r = await fetch('/docs/TROUBLESHOOTING.md');
    if (!r.ok) throw new Error(r.statusText);
    text = await r.text();
  } catch {
    status.textContent = 'Could not load the guide. Is the iq-raw server still running? The same guide is TROUBLESHOOTING.md in the iq-raw folder.';
    return;
  }
  const scratch = document.createElement('div');
  IQMarkdown.render(text, scratch);
  // Group each h2 with the content after it, so sections can be filtered and linked as a whole.
  let section = null;
  const sections = [];
  for (const node of [...scratch.childNodes]) {
    if (node.tagName === 'H1') { doc.append(node); continue; }
    if (node.tagName === 'H2') {
      section = document.createElement('section');
      section.setAttribute('aria-labelledby', node.id);
      sections.push(section);
      doc.append(section);
    }
    (section || doc).append(node);
  }
  for (const s of sections) {
    const h = s.querySelector('h2'), a = document.createElement('a');
    a.href = '#' + h.id; a.textContent = h.textContent;
    toc.append(a);
  }
  const links = [...toc.querySelectorAll('a')];
  const mark = () => { for (const a of links) a.toggleAttribute('aria-current', a.hash === location.hash); };
  window.addEventListener('hashchange', mark);
  search.addEventListener('input', () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    sections.forEach((s, i) => {
      const hit = words.every((w) => s.textContent.toLowerCase().includes(w));
      s.hidden = !hit; links[i].hidden = !hit; shown += hit;
    });
    status.textContent = words.length ? (shown ? `${shown} section${shown === 1 ? '' : 's'} match.` : 'Nothing matches. Try fewer or different words, such as an exit code.') : '';
  });
  status.textContent = '';
  mark();
  // The page was empty when the browser tried to scroll to the #anchor, so scroll now.
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
})();
