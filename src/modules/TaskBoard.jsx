import { useState, useEffect, useCallback } from 'react';
import { loadKey, saveKey } from '../storage';
import { inputStyle, deleteBtnStyle } from '../theme';

const STORAGE_KEY = 'task_board_v1';
const ACCENT = '#4aaf7a';

const COLUMNS = ['Now', 'Next', 'Later', 'Done'];

const AREAS = [
  { id: 'nwsa', label: 'NWSA', color: '#4a7abf' },
  { id: 'writing', label: 'Writing', color: '#bf7a5a' },
  { id: 'muse', label: 'American Muse', color: '#c8a84a' },
  { id: 'teaching', label: 'Teaching', color: '#6aaf4a' },
  { id: 'personal', label: 'Personal', color: '#8a5abf' },
];

const DEFAULT_DATA = { tasks: [] };

export default function TaskBoard() {
  const [data, setData] = useState(null);
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('nwsa');

  useEffect(() => {
    loadKey(STORAGE_KEY, DEFAULT_DATA).then(setData);
  }, []);

  const persist = useCallback(newData => {
    setData(newData);
    saveKey(STORAGE_KEY, newData);
  }, []);

  if (!data) return <div style={{ padding: '40px', color: '#666' }}>Loading board…</div>;

  function addTask() {
    if (!title.trim()) return;
    persist({
      ...data,
      tasks: [
        { id: crypto.randomUUID(), title: title.trim(), area, column: 'Now', created: Date.now() },
        ...data.tasks,
      ],
    });
    setTitle('');
  }

  function moveTask(id, dir) {
    persist({
      ...data,
      tasks: data.tasks.map(t => {
        if (t.id !== id) return t;
        const idx = COLUMNS.indexOf(t.column);
        const next = Math.min(COLUMNS.length - 1, Math.max(0, idx + dir));
        return { ...t, column: COLUMNS[next] };
      }),
    });
  }

  function deleteTask(id) {
    persist({ ...data, tasks: data.tasks.filter(t => t.id !== id) });
  }

  function clearDone() {
    persist({ ...data, tasks: data.tasks.filter(t => t.column !== 'Done') });
  }

  const doneCount = data.tasks.filter(t => t.column === 'Done').length;

  return (
    <div>
      <div style={{
        padding: '22px 28px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>What actually moves the needle</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '400' }}>Task Board</h1>
        </div>
        {doneCount > 0 && (
          <button onClick={clearDone} style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px',
            color: '#666',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '11px',
            padding: '5px 12px',
          }}>Clear {doneCount} done</button>
        )}
      </div>

      <div style={{ padding: '22px 28px' }}>
        {/* add form */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '22px', maxWidth: '760px', flexWrap: 'wrap' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
            placeholder="New task — lands in Now…"
            style={{ ...inputStyle, flex: '1 1 260px' }}
          />
          <select value={area} onChange={e => setArea(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
            {AREAS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <button onClick={addTask} style={{
            background: 'rgba(74,175,122,0.15)',
            border: '1px solid rgba(74,175,122,0.35)',
            borderRadius: '6px',
            color: ACCENT,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '13px',
            padding: '7px 18px',
          }}>Add</button>
        </div>

        {/* columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          alignItems: 'start',
        }}>
          {COLUMNS.map(col => {
            const tasks = data.tasks.filter(t => t.column === col);
            return (
              <div key={col} style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px',
                padding: '12px',
                minHeight: '120px',
              }}>
                <div style={{
                  fontSize: '11px',
                  color: col === 'Now' ? ACCENT : col === 'Done' ? '#555' : '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}>
                  <span>{col}</span>
                  <span style={{ color: '#444' }}>{tasks.length}</span>
                </div>

                {tasks.length === 0 && (
                  <div style={{ fontSize: '11px', color: '#3a3a3a', fontStyle: 'italic', padding: '8px 2px' }}>
                    {col === 'Now' ? 'Clear.' : '—'}
                  </div>
                )}

                {tasks.map(t => {
                  const a = AREAS.find(x => x.id === t.area) || AREAS[0];
                  const colIdx = COLUMNS.indexOf(col);
                  return (
                    <div key={t.id} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderLeft: `3px solid ${a.color}`,
                      borderRadius: '7px',
                      padding: '9px 10px',
                      marginBottom: '6px',
                      opacity: col === 'Done' ? 0.55 : 1,
                    }}>
                      <div style={{
                        fontSize: '13px',
                        lineHeight: 1.45,
                        textDecoration: col === 'Done' ? 'line-through' : 'none',
                        marginBottom: '7px',
                      }}>{t.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: a.color }}>{a.label}</span>
                        <span style={{ flex: 1 }} />
                        <button
                          onClick={() => moveTask(t.id, -1)}
                          disabled={colIdx === 0}
                          title="Move left"
                          style={{ ...deleteBtnStyle, fontSize: '12px', opacity: colIdx === 0 ? 0.25 : 1 }}
                        >◀</button>
                        <button
                          onClick={() => moveTask(t.id, 1)}
                          disabled={colIdx === COLUMNS.length - 1}
                          title="Move right"
                          style={{ ...deleteBtnStyle, fontSize: '12px', opacity: colIdx === COLUMNS.length - 1 ? 0.25 : 1 }}
                        >▶</button>
                        <button onClick={() => deleteTask(t.id)} style={{ ...deleteBtnStyle, fontSize: '11px' }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
