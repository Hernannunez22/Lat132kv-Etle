import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  // Soporta **negrita**, `código` y *cursiva*
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-sky-300 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={key++} className="italic text-slate-300">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function getCellToneClass(cellText: string): string {
  const upper = cellText.toUpperCase();
  if (
    upper.includes('DISCREPANCIA') ||
    upper.includes('NO CUMPLE') ||
    upper.includes('INCUMPLIMIENTO') ||
    upper.includes('VENCIDO') ||
    upper.includes('CRÍTIC') ||
    upper.includes('CRITIC')
  ) {
    return 'text-rose-300 font-semibold';
  }
  if (
    upper.includes('CUMPLE') ||
    upper.includes('APROBADO') ||
    upper.includes('COINCIDE') ||
    upper.includes('OK')
  ) {
    return 'text-emerald-300 font-semibold';
  }
  if (
    upper.includes('OBSERV') ||
    upper.includes('CAMBIO') ||
    upper.includes('DIFERENCIA') ||
    upper.includes('REVISAR') ||
    upper.includes('PARCIAL')
  ) {
    return 'text-amber-300 font-semibold';
  }
  return 'text-slate-200';
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  const cells = trimmed
    .split('|')
    .map(c => c.trim())
    .filter((_, i, arr) => !(i === 0 && arr[0] === '') && !(i === arr.length - 1 && arr[arr.length - 1] === ''));
  return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const raw = trimmed.split('|');
  if (raw.length > 1 && raw[0].trim() === '') raw.shift();
  if (raw.length > 0 && raw[raw.length - 1].trim() === '') raw.pop();
  return raw.map(c => c.trim());
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let idx = 0;
  let blockKey = 0;

  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();

    if (!trimmed) {
      idx++;
      continue;
    }

    // Bloque de tabla Markdown
    if (
      trimmed.includes('|') &&
      idx + 1 < lines.length &&
      isSeparatorRow(lines[idx + 1])
    ) {
      const headers = splitTableRow(line);
      idx += 2; // saltar header y separador
      const rows: string[][] = [];
      while (idx < lines.length && lines[idx].trim().includes('|') && lines[idx].trim() !== '') {
        if (!isSeparatorRow(lines[idx])) {
          rows.push(splitTableRow(lines[idx]));
        }
        idx++;
      }

      blocks.push(
        <div
          key={blockKey++}
          className="my-3 w-full max-w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/90"
        >
          <table className="w-full border-collapse text-left text-[11px] leading-relaxed">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800">
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className="px-3 py-2.5 font-bold text-sky-300 border-r last:border-r-0 border-slate-800/80 whitespace-nowrap"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-900/50 transition-colors align-top">
                  {headers.map((_, cIdx) => {
                    const val = row[cIdx] ?? '';
                    return (
                      <td
                        key={cIdx}
                        className={`px-3 py-2 border-r last:border-r-0 border-slate-800/60 tabular-nums ${getCellToneClass(val)}`}
                      >
                        {renderInline(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Separador horizontal
    if (/^---+$/.test(trimmed)) {
      blocks.push(<hr key={blockKey++} className="my-3 border-slate-800" />);
      idx++;
      continue;
    }

    // Encabezados
    if (trimmed.startsWith('#### ')) {
      blocks.push(
        <h4 key={blockKey++} className="text-xs font-bold text-sky-300 mt-3 mb-1">
          {renderInline(trimmed.slice(5))}
        </h4>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={blockKey++} className="text-[13px] font-bold text-emerald-400 mt-3.5 mb-1.5 border-b border-slate-800/70 pb-1">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={blockKey++} className="text-sm font-bold text-sky-400 mt-4 mb-2 border-b border-slate-800 pb-1">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={blockKey++} className="text-[15px] font-extrabold text-white mt-2 mb-2 border-b border-slate-700 pb-1.5">
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      idx++;
      continue;
    }

    // Listas con viñetas
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (idx < lines.length && /^[-*•]\s+/.test(lines[idx].trim())) {
        items.push(lines[idx].trim().replace(/^[-*•]\s+/, ''));
        idx++;
      }
      blocks.push(
        <ul key={blockKey++} className="space-y-1 my-1.5 pl-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-200">
              <span className="text-sky-400 mt-0.5 shrink-0">•</span>
              <span>{renderInline(it)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Listas numeradas
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: { num: string; text: string }[] = [];
      while (idx < lines.length && /^\d+\.\s+/.test(lines[idx].trim())) {
        const m = lines[idx].trim().match(/^(\d+\.)\s+(.*)$/);
        if (m) items.push({ num: m[1], text: m[2] });
        idx++;
      }
      blocks.push(
        <ol key={blockKey++} className="space-y-1 my-1.5 pl-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-200">
              <span className="text-sky-400 font-mono text-[11px] font-semibold shrink-0">{it.num}</span>
              <span>{renderInline(it.text)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Párrafo estándar
    blocks.push(
      <p key={blockKey++} className="text-slate-200 leading-relaxed my-1">
        {renderInline(line)}
      </p>
    );
    idx++;
  }

  return <div className={`space-y-1 text-xs min-w-0 max-w-full break-words ${className}`}>{blocks}</div>;
};
