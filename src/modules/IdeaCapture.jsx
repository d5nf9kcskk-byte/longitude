import { useState, useEffect, useCallback } from 'react';
import { loadKey, saveKey } from '../storage';
import { inputStyle, deleteBtnStyle } from '../theme';

const STORAGE_KEY = 'idea_capture_v1';
const ACCENT = '#8a5abf';

const TAGS = [
  { id: 'muse', label: 'American Muse', color: '#c8a84a' },
  { id: 'programming', label: 'Programming', color: '#4a8abf' },
  { id: 'writing', label: 'Writing', color: '#bf7a5a' },
  { id: 'teaching', label: 'Teaching', color: '#6aaf4a' },
  { id: 'nwsa', label: 'NWSA', color: '#4a7abf' },
  { id: 'other', label: 'Other', color: '#888' },
];

const DEFAULT_DATA = { ideas: [] };

export default function IdeaCapture() {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [tag, setTag] = useState('muse');
  const [filter, setFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadKey(STORAGE_KEY, DEFAULT_DATA).then(setData);
  }, []);

  const persist = useCallback(newData => {
    setData(newData);
    saveKey(STORAGE_KEY, newData);
  }, []);

  if (!data) return <div style={{ padding: '40px', color: '#666' }}>Loading ideas…</div>;

  function addIdea() {
    if (!text.trim()) return;
    persist({
      ...data,
      ideas: [
        { id: crypto.randomUUID(), text: text.trim(), tag, created: Date.now(), archived: false },
        ...data.ideas,
      ],
    });
    setText('');
  }

  function toggleArchive(id) {
    persist({
      ...data,
      ideas: data.ideas.map(i => i.id === id ? { ...i, archived: !i.archived } : i),
    });
  }

  function deleteIdea(id) {
    persist({ ...data, ideas: data.ideas.filter(i => i.id !== id) });
  }

  const visible = data.ideas.filter(i =>
    (showArchived ? i.archived : !i.archived) &&
    (filter === 'all' || i.tag === filter)
  );
  const activeCount = data.ideas.filter(i => !i.archived).length;

  return (
    <div>
      <div style={{
        padding: '22px 28px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>Catch it before it goes</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '400' }}>Idea Capture</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: '300', color: ACCENT }}>{activeCount}</div>
          <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Active</div>
        </div>
      </div>

      <div style={{ padding: '22px 28px', maxWidth: '760px' }}>
        {/* capture box */}
        <div style={{
          background: 'rgba(138,90,191,0.06)',
          border: '1px solid rgba(138,90,191,0.22)',
          borderRadius: '10px',
          padding: '14px 16px',
          marginBottom: '20px',
        }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addIdea(); } }}
            placeholder="Episode idea, program pairing, article angle, a sentence worth keeping… (Enter to save)"
            rows={2}
            style={{ ...inputStyle, lineHeight: 1.6, resize: 'vertical', marginBottom: '10px' }}
          />
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {TAGS.map(t => (
              <button key={t.id} onClick={() => setTag(t.id)} style={{
                background: tag === t.id ? `${t.color}22` : 'transparent',
                border: `1px solid ${tag === t.id ? t.color : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '5px',
                color: tag === t.id ? t.color : '#666',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '11px',
                padding: '4px 10px',
              }}>{t.label}</button>
            ))}
            <button onClick={addIdea} style={{
              marginLeft: 'auto',
              background: 'rgba(138,90,191,0.18)',
              border: '1px solid rgba(138,90,191,0.35)',
              borderRadius: '6px',
              color: ACCENT,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              padding: '6px 16px',
            }}>Capture</button>
          </div>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setFilter('all')} style={{
            background: 'transparent',
            border: `1px solid ${filter === 'all' ? '#888' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '5px',
            color: filter === 'all' ? '#aaa' : '#555',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '3px 10px',
          }}>All</button>
          {TAGS.map(t => {
            const count = data.ideas.filter(i => i.tag === t.id && !i.archived).length;
            if (count === 0 && filter !== t.id) return null;
            return (
              <button key={t.id} onClick={() => setFilter(t.id)} style={{
                background: 'transparent',
                border: `1px solid ${filter === t.id ? t.color : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '5px',
                color: filter === t.id ? t.color : '#555',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '3px 10px',
              }}>{t.label} ({count})</button>
            );
          })}
          <button onClick={() => setShowArchived(a => !a)} style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: showArchived ? '#aaa' : '#555',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '11px',
            textDecoration: 'underline',
          }}>{showArchived ? 'Show active' : 'Show archived'}</button>
        </div>

        {/* list */}
        {visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>✧</div>
            <div style={{ fontSize: '13px' }}>{showArchived ? 'Nothing archived.' : 'Nothing captured yet.'}</div>
          </div>
        ) : (
          visible.map(idea => {
            const t = TAGS.find(x => x.id === idea.tag) || TAGS[TAGS.length - 1];
            return (
              <div key={idea.id} style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderLeft: `3px solid ${t.color}`,
                borderRadius: '8px',
                padding: '11px 14px',
                marginBottom: '6px',
                opacity: idea.archived ? 0.55 : 1,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{idea.text}</div>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '5px' }}>
                    <span style={{ color: t.color }}>{t.label}</span>
                    {' · '}
                    {new Date(idea.created).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => toggleArchive(idea.id)}
                  title={idea.archived ? 'Restore' : 'Archive'}
                  style={{ ...deleteBtnStyle, fontSize: '12px' }}
                >{idea.archived ? '↩' : '✓'}</button>
                <button onClick={() => deleteIdea(idea.id)} style={deleteBtnStyle}>✕</button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
