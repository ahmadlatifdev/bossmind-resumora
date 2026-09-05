/**
 * Lightweight markdown → React nodes for Hermes replies.
 * No external markdown dependency. Escapes HTML; supports fences, inline code, bold, lists.
 */
import { Fragment, type ReactNode } from 'react';

function InlineMd({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(
        <code key={key++} className="admin-md-inline">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

type Props = {
  text: string;
  onCopyCode?: (code: string) => void;
};

export default function AdminMarkdown({ text, onCopyCode }: Props) {
  const raw = String(text || '');
  if (!raw.trim()) return <p className="admin-md-empty">—</p>;

  const blocks: ReactNode[] = [];
  const fenceRe = /```([\w-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let bi = 0;

  while ((m = fenceRe.exec(raw))) {
    if (m.index > last) {
      blocks.push(
        <div key={`t-${bi++}`} className="admin-md-text">
          {raw
            .slice(last, m.index)
            .split('\n')
            .map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                <InlineMd text={line} />
              </Fragment>
            ))}
        </div>
      );
    }
    const lang = m[1] || 'text';
    const code = m[2].replace(/\n$/, '');
    blocks.push(
      <div key={`c-${bi++}`} className="admin-md-code">
        <div className="admin-md-code__bar">
          <span>{lang}</span>
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost admin-md-copy"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              onCopyCode?.(code);
            }}
          >
            Copy
          </button>
        </div>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
    last = m.index + m[0].length;
  }

  if (last < raw.length) {
    blocks.push(
      <div key={`t-${bi++}`} className="admin-md-text">
        {raw
          .slice(last)
          .split('\n')
          .map((line, i) => (
            <Fragment key={i}>
              {i > 0 ? <br /> : null}
              <InlineMd text={line} />
            </Fragment>
          ))}
      </div>
    );
  }

  return <div className="admin-md">{blocks}</div>;
}
