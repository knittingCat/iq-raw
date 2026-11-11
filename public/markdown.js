(() => {
  // Renders the Markdown subset our docs use (headings, paragraphs, lists, tables, code, bold, links) as DOM nodes.
  // Text is only ever set through textContent, and links are limited to http(s), same-site paths and #anchors.
  // Heading ids follow GitHub's rule, so #anchors work both here and on GitHub.
  const slug = (text) => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
  // External links must say https?:; a bare / must not start //host or /\host, which browsers treat as external too.
  const safeHref = (href) => (/^(https?:\/\/|\/(?![\/\\])|#)/i.test(href) ? href : null);

  function inline(doc, parent, text) {
    const pattern = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let at = 0, m;
    while ((m = pattern.exec(text))) {
      if (m.index > at) parent.append(text.slice(at, m.index));
      if (m[1] !== undefined) { const c = doc.createElement('code'); c.textContent = m[1]; parent.append(c); }
      else if (m[2] !== undefined) { const b = doc.createElement('strong'); inline(doc, b, m[2]); parent.append(b); }
      else {
        const href = safeHref(m[4]);
        if (!href) { inline(doc, parent, m[3]); }
        else {
          const a = doc.createElement('a'); a.href = href; inline(doc, a, m[3]);
          if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          parent.append(a);
        }
      }
      at = pattern.lastIndex;
    }
    if (at < text.length) parent.append(text.slice(at));
  }

  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const listItem = /^(\d+\.|[-*]) +(.*)$/;

  function render(markdown, root) {
    const doc = root.ownerDocument;
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const seen = new Map();
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (line.startsWith('```')) {
        const body = [];
        for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
        i++;
        const pre = doc.createElement('pre'), code = doc.createElement('code');
        code.textContent = body.join('\n'); pre.append(code); root.append(pre);
        continue;
      }
      const heading = line.match(/^(#{1,4}) +(.*)$/);
      if (heading) {
        const h = doc.createElement('h' + heading[1].length);
        inline(doc, h, heading[2]);
        const base = slug(h.textContent), n = seen.get(base) || 0;
        seen.set(base, n + 1);
        h.id = n ? `${base}-${n}` : base;
        root.append(h); i++;
        continue;
      }
      if (line.trim().startsWith('|')) {
        const rows = [];
        for (; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]));
        const table = doc.createElement('table'), head = doc.createElement('thead'), body = doc.createElement('tbody');
        rows.forEach((row, r) => {
          if (r === 1 && row.every((c) => /^:?-+:?$/.test(c))) return;
          const tr = doc.createElement('tr');
          for (const c of row) { const td = doc.createElement(r === 0 ? 'th' : 'td'); inline(doc, td, c); tr.append(td); }
          (r === 0 ? head : body).append(tr);
        });
        table.append(head, body);
        const wrap = doc.createElement('div'); wrap.className = 'table-wrap'; wrap.append(table); root.append(wrap);
        continue;
      }
      const first = line.match(listItem);
      if (first) {
        const list = doc.createElement(/\d/.test(first[1]) ? 'ol' : 'ul');
        while (i < lines.length) {
          const m = lines[i].match(listItem);
          if (!m) break;
          const text = [m[2]];
          // Indented lines continue the item.
          for (i++; i < lines.length && /^ {2,}\S/.test(lines[i]) && !listItem.test(lines[i].trim()); i++) text.push(lines[i].trim());
          const li = doc.createElement('li'); inline(doc, li, text.join(' ')); list.append(li);
        }
        root.append(list);
        continue;
      }
      const text = [];
      for (; i < lines.length && lines[i].trim() && !/^(#{1,4} |```|\|)/.test(lines[i]) && !listItem.test(lines[i]); i++) text.push(lines[i].trim());
      const p = doc.createElement('p'); inline(doc, p, text.join(' ')); root.append(p);
    }
    return root;
  }

  window.IQMarkdown = { render, slug };
})();
