import { useState, useEffect, useCallback } from 'react';
import { loadKey, saveKey } from '../storage';
import { inputStyle, labelStyle, deleteBtnStyle } from '../theme';

const STORAGE_KEY = 'practice_log_v1';
const ACCENT = '#bf7a5a';

const CATEGORIES = ['Score study', 'Baton technique', 'Piano', 'Listening', 'Reading / research'];

const DEFAULT_DATA = { entries: [] };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek() {
  // Monday-start week
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function streakDays(entries) {
  const days = new Set(entries.map(e => e.date));
  let streak = 0;
  const cursor = new Date();
  // Today counts if logged; otherwise the streak can still be alive from yesterday.
  if (!days.has(todayISO())) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (!days.has(iso)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function PracticeLog() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    date: todayISO(),
    category: 'Score study',
    focus: '',
    minutes: '',
    notes: '',
  });

  useEffect(() => {
    loadKey(STORAGE_KEY, DEFAULT_DATA).then(setData);
  }, []);

  const persist = useCallback(newData => {
    setData(newData);
    saveKey(STORAGE_KEY, newData);
  }, []);

  if (!data) return <div style={{ padding: '40px', color: '#666' }}>Loading log…</div>;

  function addEntry() {
    if (!form.focus.trim() && !form.minutes) return;
    const entry = { id: crypto.randomUUID(), ...form };
    persist({ ...data, entries: [entry, ...data.entries] });
    setForm(f => ({ ...f, focus: '', minutes: '', notes: '' }));
  }

  function deleteEntry(id) {
    persist({ ...data, entries: data.entries.filter(e => e.id !== id) });
  }

  const weekStart = startOfWeek();
  const weekMins = data.entries
    .filter(e => new Date(e.date + 'T12:00').getTime() >= weekStart)
    .reduce((s, e) => s + (parseInt(e.minutes) || 0), 0);
  const totalMins = data.entries.reduce((s, e) => s + (parseInt(e.minutes) || 0), 0);
  const streak = streakDays(data.entries);

  // Group entries by date, newest first
  const byDate = {};
  for (const e of data.entries) (byDate[e.date] ||= []).push(e);
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

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
          <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>The craft, daily</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '400' }}>Study Log</h1>
        </div>
        <div style={{ display: 'flex', gap: '20px', textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '300', color: ACCENT }}>{weekMins}</div>
            <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Min this week</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '300', color: streak > 0 ? ACCENT : '#666' }}>{streak}</div>
            <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Day streak</div>
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '300', color: '#888' }}>{Math.round(totalMins / 60)}</div>
            <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Hours total</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '22px 28px', maxWidth: '820px' }}>
        {/* entry form */}
        <div style={{
          background: 'rgba(191,122,90,0.06)',
          border: '1px solid rgba(191,122,90,0.2)',
          borderRadius: '10px',
          padding: '14px 16px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 170px 1fr 76px', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Focus</label>
              <input
                value={form.focus}
                onChange={e => setForm({ ...form, focus: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addEntry(); }}
                placeholder="Copland 3, mvt IV · Barber Essay No. 2 …"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Minutes</label>
              <input
                value={form.minutes}
                onChange={e => setForm({ ...form, minutes: e.target.value.replace(/[^0-9]/g, '') })}
                onKeyDown={e => { if (e.key === 'Enter') addEntry(); }}
                placeholder="45"
                style={{ ...inputStyle, textAlign: 'center' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') addEntry(); }}
              placeholder="What clicked, what didn't, what to hit next time… (optional)"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={addEntry} style={{
              background: 'rgba(191,122,90,0.18)',
              border: '1px solid rgba(191,122,90,0.35)',
              borderRadius: '6px',
              color: ACCENT,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              padding: '7px 18px',
            }}>Log it</button>
          </div>
        </div>

        {/* entries */}
        {dates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>𝄐</div>
            <div style={{ fontSize: '14px' }}>Nothing logged yet.</div>
            <div style={{ fontSize: '12px', marginTop: '6px' }}>The streak starts with one session.</div>
          </div>
        ) : (
          dates.map(date => {
            const entries = byDate[date];
            const dayMins = entries.reduce((s, e) => s + (parseInt(e.minutes) || 0), 0);
            const label = new Date(date + 'T12:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            });
            return (
              <div key={date} style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>{label}</span>
                  <span style={{ fontSize: '11px', color: '#555' }}>{dayMins} min</span>
                </div>
                {entries.map(e => (
                  <div key={e.id} style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'baseline',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '5px',
                  }}>
                    <span style={{
                      fontSize: '10px',
                      color: ACCENT,
                      background: 'rgba(191,122,90,0.12)',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                    }}>{e.category}</span>
                    <span style={{ flex: 1, fontSize: '13px' }}>
                      {e.focus || <span style={{ color: '#555' }}>(unspecified)</span>}
                      {e.notes && <span style={{ display: 'block', fontSize: '12px', color: '#777', marginTop: '3px', lineHeight: 1.5 }}>{e.notes}</span>}
                    </span>
                    <span style={{ fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>{e.minutes || 0} min</span>
                    <button onClick={() => deleteEntry(e.id)} style={deleteBtnStyle}>✕</button>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
