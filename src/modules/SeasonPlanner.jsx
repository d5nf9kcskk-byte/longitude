import { useState, useEffect, useCallback } from 'react';
import { loadKey, saveKey } from '../storage';
import { inputStyle, labelStyle, deleteBtnStyle, addBtnStyle } from '../theme';

const STORAGE_KEY = 'nwsa_season_planner_v1';

const ENSEMBLES = [
  { id: 'symphony', label: 'Symphony Orchestra', abbr: 'SYM', accent: '#4a8abf' },
  { id: 'philharmonic', label: 'Philharmonic', abbr: 'PHI', accent: '#4aaf7a' },
  { id: 'camerata', label: 'Camerata String Orchestra', abbr: 'CAM', accent: '#bf7a5a' },
  { id: 'opera', label: 'Opera Orchestra', abbr: 'OPE', accent: '#8a5abf' },
  { id: 'cco', label: 'College Chamber Orchestra', abbr: 'CCO', accent: '#4a8abf' },
];

const VENUES = ['Wolfson Auditorium', 'Chapman Conference Center', 'Lyric Theater', 'Arsht Center', 'TBD'];

const EMPTY_PROGRAM = () => ({
  id: crypto.randomUUID(),
  title: '',
  date: '',
  venue: '',
  works: [],
});

const EMPTY_WORK = () => ({
  id: crypto.randomUUID(),
  title: '',
  composer: '',
  isAmerican: false,
  duration: '',
  orchestration: '',
  notes: '',
});

const DEFAULT_DATA = {
  schoolYear: '2026–27',
  ensembles: Object.fromEntries(ENSEMBLES.map(e => [e.id, { programs: [] }])),
};

function americanCount(programs) {
  let count = 0;
  programs.forEach(p => p.works.forEach(w => { if (w.isAmerican) count++; }));
  return count;
}

function workCount(programs) {
  return programs.reduce((s, p) => s + p.works.length, 0);
}

function totalMinutes(programs) {
  let mins = 0;
  programs.forEach(p =>
    p.works.forEach(w => {
      const m = parseInt(w.duration);
      if (!isNaN(m)) mins += m;
    })
  );
  return mins;
}

function WorkRow({ work, onChange, onDelete }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 48px 64px auto auto',
      gap: '6px',
      alignItems: 'center',
      padding: '8px 10px',
      background: work.isAmerican ? 'rgba(180,140,60,0.08)' : 'rgba(255,255,255,0.04)',
      borderRadius: '6px',
      marginBottom: '4px',
      borderLeft: work.isAmerican ? '3px solid #b48c3c' : '3px solid transparent',
    }}>
      <input
        value={work.title}
        onChange={e => onChange({ ...work, title: e.target.value })}
        placeholder="Work title"
        style={inputStyle}
      />
      <input
        value={work.composer}
        onChange={e => onChange({ ...work, composer: e.target.value })}
        placeholder="Composer"
        style={inputStyle}
      />
      <input
        value={work.duration}
        onChange={e => onChange({ ...work, duration: e.target.value })}
        placeholder="min"
        style={{ ...inputStyle, textAlign: 'center' }}
      />
      <input
        value={work.orchestration}
        onChange={e => onChange({ ...work, orchestration: e.target.value })}
        placeholder="Daniels"
        style={{ ...inputStyle, fontSize: '11px' }}
      />
      <button
        onClick={() => onChange({ ...work, isAmerican: !work.isAmerican })}
        title="Mark as American work"
        style={{
          background: work.isAmerican ? '#b48c3c' : 'rgba(255,255,255,0.08)',
          color: work.isAmerican ? '#fff' : '#888',
          border: 'none',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        🇺🇸
      </button>
      <button onClick={onDelete} style={deleteBtnStyle}>✕</button>
    </div>
  );
}

function ProgramCard({ program, onChange, onDelete }) {
  const [open, setOpen] = useState(true);
  const mins = program.works.reduce((s, w) => s + (parseInt(w.duration) || 0), 0);
  const amCount = program.works.filter(w => w.isAmerican).length;

  function updateWork(idx, updated) {
    const works = [...program.works];
    works[idx] = updated;
    onChange({ ...program, works });
  }
  function deleteWork(idx) {
    onChange({ ...program, works: program.works.filter((_, i) => i !== idx) });
  }
  function addWork() {
    onChange({ ...program, works: [...program.works, EMPTY_WORK()] });
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px',
      marginBottom: '14px',
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)',
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#888', fontSize: '12px' }}>{open ? '▾' : '▸'}</span>
        <div style={{ flex: 1 }}>
          <input
            value={program.title}
            onChange={e => onChange({ ...program, title: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Concert title"
            style={{ ...inputStyle, fontWeight: '600', fontSize: '15px', background: 'transparent', padding: '2px 0', border: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {amCount > 0 && (
            <span style={{ fontSize: '11px', color: '#b48c3c', background: 'rgba(180,140,60,0.12)', padding: '2px 7px', borderRadius: '4px' }}>
              {amCount} American
            </span>
          )}
          {mins > 0 && <span style={{ fontSize: '11px', color: '#aaa' }}>{mins} min</span>}
          <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ ...deleteBtnStyle, marginLeft: '4px' }}>✕</button>
        </div>
      </div>

      {open && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={program.date}
                onChange={e => onChange({ ...program, date: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Venue</label>
              <select
                value={program.venue}
                onChange={e => onChange({ ...program, venue: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select venue</option>
                {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input
                value={program.notes || ''}
                onChange={e => onChange({ ...program, notes: e.target.value })}
                placeholder="Guest soloist, theme..."
                style={inputStyle}
              />
            </div>
          </div>

          {program.works.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 48px 64px auto auto',
                gap: '6px',
                padding: '4px 10px',
                marginBottom: '4px',
              }}>
                {['Work', 'Composer', 'Min', 'Orch.', '', ''].map((h, i) => (
                  <span key={i} style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                ))}
              </div>
              {program.works.map((w, i) => (
                <WorkRow
                  key={w.id}
                  work={w}
                  onChange={updated => updateWork(i, updated)}
                  onDelete={() => deleteWork(i)}
                />
              ))}
            </div>
          )}

          <button onClick={addWork} style={addBtnStyle}>+ Add work</button>
        </div>
      )}
    </div>
  );
}

export default function SeasonPlanner() {
  const [data, setData] = useState(null);
  const [activeEnsemble, setActiveEnsemble] = useState('symphony');

  useEffect(() => {
    loadKey(STORAGE_KEY, DEFAULT_DATA).then(setData);
  }, []);

  const persist = useCallback(newData => {
    setData(newData);
    saveKey(STORAGE_KEY, newData);
  }, []);

  if (!data) return <div style={{ padding: '40px', color: '#666' }}>Loading season…</div>;

  const ensemble = ENSEMBLES.find(e => e.id === activeEnsemble);
  const programs = data.ensembles[activeEnsemble]?.programs || [];

  function updatePrograms(newPrograms) {
    persist({
      ...data,
      ensembles: {
        ...data.ensembles,
        [activeEnsemble]: { programs: newPrograms },
      },
    });
  }

  function addProgram() {
    updatePrograms([...programs, EMPTY_PROGRAM()]);
  }

  function updateProgram(idx, updated) {
    const p = [...programs];
    p[idx] = updated;
    updatePrograms(p);
  }

  function deleteProgram(idx) {
    updatePrograms(programs.filter((_, i) => i !== idx));
  }

  const allPrograms = Object.values(data.ensembles).flatMap(e => e.programs);
  const totalWorks = workCount(allPrograms);
  const totalAmerican = americanCount(allPrograms);
  const americanPct = totalWorks > 0 ? Math.round((totalAmerican / totalWorks) * 100) : 0;

  return (
    <div>
      <div style={{
        padding: '28px 32px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
            New World School of the Arts
          </div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '400', letterSpacing: '-0.02em' }}>
            Season Planner <span style={{ color: '#555', fontStyle: 'italic' }}>{data.schoolYear}</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: '300', color: '#e8e8e8' }}>{totalWorks}</div>
            <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Works programmed</div>
          </div>
          <div>
            <div style={{
              fontSize: '22px',
              fontWeight: '300',
              color: americanPct >= 20 ? '#b48c3c' : '#888',
            }}>{americanPct}%</div>
            <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>American</div>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 32px',
        overflowX: 'auto',
      }}>
        {ENSEMBLES.map(e => {
          const ep = data.ensembles[e.id]?.programs || [];
          const wc = workCount(ep);
          const ac = americanCount(ep);
          const isActive = activeEnsemble === e.id;
          return (
            <button
              key={e.id}
              onClick={() => setActiveEnsemble(e.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${e.accent}` : '2px solid transparent',
                color: isActive ? '#e8e8e8' : '#555',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                padding: '14px 18px 12px',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {e.abbr}
              {wc > 0 && (
                <span style={{ marginLeft: '8px', fontSize: '10px', color: '#555' }}>
                  {wc}{ac > 0 ? ` · ${ac}🇺🇸` : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '24px 32px', maxWidth: '960px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '400' }}>{ensemble.label}</h2>
            {programs.length > 0 && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                {programs.length} concert{programs.length !== 1 ? 's' : ''} · {workCount(programs)} works · {totalMinutes(programs)} min music
                {americanCount(programs) > 0 && ` · ${americanCount(programs)} American`}
              </div>
            )}
          </div>
          <button onClick={addProgram} style={{
            background: 'rgba(180,140,60,0.15)',
            border: '1px solid rgba(180,140,60,0.3)',
            borderRadius: '7px',
            color: '#b48c3c',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '13px',
            padding: '8px 16px',
          }}>
            + Add concert
          </button>
        </div>

        {programs.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#444',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: '12px',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>♩</div>
            <div style={{ fontSize: '14px' }}>No concerts planned yet.</div>
            <div style={{ fontSize: '12px', marginTop: '6px' }}>Add a concert to start programming.</div>
          </div>
        ) : (
          programs.map((p, i) => (
            <ProgramCard
              key={p.id}
              program={p}
              onChange={updated => updateProgram(i, updated)}
              onDelete={() => deleteProgram(i)}
            />
          ))
        )}
      </div>
    </div>
  );
}
