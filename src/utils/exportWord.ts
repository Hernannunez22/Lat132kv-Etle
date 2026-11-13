function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMdToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function markdownToCleanHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('|') &&
      lines[i + 1].includes('---')
    ) {
      const splitRow = (l: string) => {
        const raw = l.trim().split('|');
        if (raw.length > 1 && raw[0].trim() === '') raw.shift();
        if (raw.length > 0 && raw[raw.length - 1].trim() === '') raw.pop();
        return raw.map(c => c.trim());
      };
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        if (!lines[i].includes('---')) rows.push(splitRow(lines[i]));
        i++;
      }
      const thHtml = headers.map(h => `<th>${inlineMdToHtml(h)}</th>`).join('');
      const trHtml = rows
        .map(r => `<tr>${headers.map((_, ci) => `<td>${inlineMdToHtml(r[ci] ?? '')}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table>`);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      out.push(`<h3>${inlineMdToHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      out.push(`<h2>${inlineMdToHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      out.push(`<h1>${inlineMdToHtml(trimmed.slice(2))}</h1>`);
    } else if (/^---+$/.test(trimmed)) {
      out.push('<hr />');
    } else if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inlineMdToHtml(lines[i].trim().replace(/^[-*•]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    } else {
      out.push(`<p>${inlineMdToHtml(trimmed)}</p>`);
    }
    i++;
  }

  return out.join('\n');
}

export function descargarMarkdownComoWord(tituloArchivo: string, tituloDoc: string, markdown: string) {
  const htmlBody = markdownToCleanHtml(markdown);
  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const docHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(tituloDoc)}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; color: #0f172a; line-height: 1.45; padding: 24px; }
          h1 { font-size: 15pt; color: #0f172a; border-bottom: 2pt solid #0284c7; padding-bottom: 4px; }
          h2 { font-size: 12.5pt; color: #0369a1; margin-top: 14px; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3px; }
          h3 { font-size: 11pt; color: #0f766e; margin-top: 12px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0 14px 0; font-size: 9pt; }
          th { background-color: #0f172a; color: #ffffff; font-weight: bold; padding: 6px 8px; border: 1pt solid #334155; text-align: left; }
          td { padding: 5px 8px; border: 1pt solid #cbd5e1; vertical-align: top; }
          tr:nth-child(even) td { background-color: #f8fafc; }
          code { font-family: Consolas, monospace; background: #f1f5f9; padding: 1px 4px; color: #0369a1; }
          ul { margin: 6px 0; padding-left: 20px; }
        </style>
      </head>
      <body>
        <p style="font-size:9pt;color:#475569;">Obras 132 kV · Generado el ${fecha}</p>
        ${htmlBody}
      </body>
    </html>
  `;

  const blob = new Blob(['\ufeff' + docHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tituloArchivo}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
