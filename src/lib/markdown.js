/**
 * Minimal, dependency-free Markdown -> HTML for static blog content.
 * Supports: headings (#..####), paragraphs, - and 1. lists, | tables |,
 * > blockquotes, --- rules, and inline **bold**, `code`, [links](url).
 * Content is static (bundled at build time), so no XSS from user input.
 */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  let out = escapeHtml(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

export function renderMarkdown(md) {
  const lines = String(md || '').split('\n');
  const html = [];
  let i = 0;
  let listType = null;

  const closeList = () => {
    if (listType) {
      html.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      closeList();
      i++;
      continue;
    }

    // Table (consecutive |...| lines)
    if (isTableRow(trimmed)) {
      closeList();
      const rows = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(lines[i].trim());
        i++;
      }
      const cells = (row) =>
        row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      let header = null;
      const body = [];
      for (let r = 0; r < rows.length; r++) {
        const c = cells(rows[r]);
        if (r === 0) header = c;
        else if (c.every((x) => /^:?-+:?$/.test(x)))
          continue; // separator
        else body.push(c);
      }
      html.push('<table>');
      if (header) {
        html.push(
          '<thead><tr>' + header.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>'
        );
      }
      html.push(
        '<tbody>' +
          body
            .map((row) => '<tr>' + row.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody>'
      );
      html.push('</table>');
      continue;
    }

    // Heading
    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      closeList();
      html.push('<hr />');
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      closeList();
      html.push(`<blockquote>${inline(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // Paragraph (accumulate consecutive plain lines)
    closeList();
    const para = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isTableRow(lines[i].trim()) &&
      !/^(#{1,4})\s/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,})$/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }

  closeList();
  return html.join('\n');
}
