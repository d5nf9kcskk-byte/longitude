import { useState, useEffect, useCallback } from 'react';
import { loadKey, saveKey } from '../storage';
import { inputStyle } from '../theme';

const STORAGE_KEY = 'nwsa_recruitment_v1';

const STAGES = ['Prospect', 'Contacted', 'Auditioned', 'Accepted', 'Enrolled', 'Declined'];
const INSTRUMENTS = ['Violin', 'Viola', 'Cello', 'Bass', 'Flute', 'Oboe', 'Clarinet', 'Bassoon', 'Horn', 'Trumpet', 'Trombone', 'Tuba', 'Percussion', 'Harp', 'Other'];

const STAGE_COLORS = {
  Prospect: '#555',
  Contacted: '#4a7abf',
  Auditioned: '#bf9a4a',
  Accepted: '#4abf7a',
  Enrolled: '#6abf4a',
  Declined: '#444',
};

// Defaults ship with [contact] placeholders — this repo is public, so your
// real signature lives in your saved (private) data, editable in the app.
const DEFAULT_TEMPLATES = {
  initial: {
    label: 'Initial outreach',
    subject: 'NWSA Orchestra Program — Audition Invitation',
    body: `Dear [Name],

My name is Grant Gilman — I'm the Director of Orchestras at New World School of the Arts in Miami. I'm reaching out because [source: teacher/competition/referral] mentioned you as a strong [instrument] player, and I'd like to invite you to audition for our program.

NWSA offers a distinctive conservatory track within Miami Dade College, with five orchestral ensembles and a serious commitment to repertoire across all styles and periods. Our students perform at venues including the Adrienne Arsht Center.

Auditions for the [year] school year are being scheduled for [window]. If you're interested, I'd be glad to tell you more about what the program looks like, answer any questions, and set up an audition time.

Best,
Grant Gilman
Director of Orchestras, NWSA
[email] | [phone]`,
  },
  followup: {
    label: 'Follow-up (no reply)',
    subject: 'Re: NWSA Orchestra — Following Up',
    body: `Hi [Name],

I sent a note last week about auditioning for the NWSA Orchestra program and wanted to follow up in case it got buried.

If you have questions or want to schedule a time to speak, I'm happy to connect. Audition slots for [window] are filling in, so I wanted to make sure you had the chance.

Best,
Grant Gilman`,
  },
  postAudition: {
    label: 'Post-audition',
    subject: 'Thank you — NWSA Audition',
    body: `Dear [Name],

Thank you for coming in to audition for the NWSA Orchestra program. It was a pleasure hearing you play.

[Personalized note: strong moment, specific observation.]

I'll be in touch shortly with next steps. In the meantime, feel free to reach out with any questions.

Best,
Grant Gilman`,
  },
  acceptance: {
    label: 'Acceptance',
    subject: 'Welcome to NWSA Orchestra',
    body: `Dear [Name],

It's my pleasure to offer you a place in the NWSA Orchestra program for [year]. We'd love to have you join us.

Please reply to confirm your acceptance, and I'll send enrollment details. If you have any questions before then, I'm happy to talk through them.

Looking forward to working with you.

Grant Gilman
Director of Orchestras, NWSA`,
  },
};

const TIMELINE = [
  { month: 'June', tasks: ['Finalize audition dates', 'Draft outreach list', 'Send initial emails to prospects'] },
  { month: 'July', tasks: ['Follow up on initial outreach', 'Schedule audition slots', 'Coordinate with admissions'] },
  { month: 'August', tasks: ['Hold auditions', 'Send acceptances', 'Confirm enrollment', 'Plan seating'] },
  { month: 'September', tasks: ['First rehearsal — orientation', 'Confirm roster', 'Distribute calendars'] },
];

const EMPTY_PROSPECT = () => ({
  id: crypto.randomUUID(),
  name: '',
  instrument: '',
  grade: '',
  school: '',
  stage: 'Prospect',
  source: '',
  notes: '',
  lastContact: '',
});

const DEFAULT_DATA = {
  prospects: [],
  notes: '',
  auditionDates: '',
  templates: null, // seeded from DEFAULT_TEMPLATES on first load
};

function ProspectRow({ prospect, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const color = STAGE_COLORS[prospect.stage] || '#555';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '8px',
      marginBottom: '6px',
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 80px 110px 120px auto',
          gap: '10px',
          padding: '10px 14px',
          cursor: 'pointer',
          alignItems: 'center',
        }}
      >
        <div style={{ fontWeight: '500', fontSize: '13px' }}>{prospect.name || <span style={{ color: '#444' }}>Name</span>}</div>
        <div style={{ fontSize: '12px', color: '#888' }}>{prospect.instrument}</div>
        <div style={{ fontSize: '12px', color: '#666' }}>{prospect.grade}</div>
        <div style={{ fontSize: '11px', color: '#666' }}>{prospect.school || '—'}</div>
        <div>
          <span style={{
            fontSize: '11px',
            color: color,
            background: `${color}18`,
            padding: '2px 8px',
            borderRadius: '4px',
          }}>{prospect.stage}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '12px', padding: '2px 6px', fontFamily: 'inherit' }}>✕</button>
      </div>
      {open && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Name</div>
              <input value={prospect.name} onChange={e => onChange({ ...prospect, name: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Instrument</div>
              <select value={prospect.instrument} onChange={e => onChange({ ...prospect, instrument: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Select</option>
                {INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Grade</div>
              <input value={prospect.grade} onChange={e => onChange({ ...prospect, grade: e.target.value })} placeholder="9th, 10th…" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>School</div>
              <input value={prospect.school} onChange={e => onChange({ ...prospect, school: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Source</div>
              <input value={prospect.source} onChange={e => onChange({ ...prospect, source: e.target.value })} placeholder="Teacher, comp, referral…" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Stage</div>
              <select value={prospect.stage} onChange={e => onChange({ ...prospect, stage: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Last contact</div>
              <input type="date" value={prospect.lastContact} onChange={e => onChange({ ...prospect, lastContact: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Notes</div>
              <input value={prospect.notes} onChange={e => onChange({ ...prospect, notes: e.target.value })} style={inputStyle} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = ['Pipeline', 'Timeline', 'Templates'];

export default function RecruitmentTracker() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Pipeline');
  const [selectedTemplate, setSelectedTemplate] = useState('initial');
  const [copied, setCopied] = useState(false);
  const [filterStage, setFilterStage] = useState('All');

  useEffect(() => {
    loadKey(STORAGE_KEY, DEFAULT_DATA).then(d => {
      if (!d.templates) d = { ...d, templates: DEFAULT_TEMPLATES };
      setData(d);
    });
  }, []);

  const persist = useCallback(newData => {
    setData(newData);
    saveKey(STORAGE_KEY, newData);
  }, []);

  if (!data) return <div style={{ padding: '40px', color: '#666' }}>Loading…</div>;

  function addProspect() {
    persist({ ...data, prospects: [...data.prospects, EMPTY_PROSPECT()] });
  }
  function updateProspect(i, updated) {
    const p = [...data.prospects];
    p[i] = updated;
    persist({ ...data, prospects: p });
  }
  function deleteProspect(i) {
    persist({ ...data, prospects: data.prospects.filter((_, j) => j !== i) });
  }
  function updateTemplateBody(key, body) {
    persist({
      ...data,
      templates: { ...data.templates, [key]: { ...data.templates[key], body } },
    });
  }
  function resetTemplate(key) {
    persist({
      ...data,
      templates: { ...data.templates, [key]: DEFAULT_TEMPLATES[key] },
    });
  }

  const stageCounts = Object.fromEntries(STAGES.map(s => [s, data.prospects.filter(p => p.stage === s).length]));
  const filtered = filterStage === 'All' ? data.prospects : data.prospects.filter(p => p.stage === filterStage);

  const tmpl = data.templates[selectedTemplate];
  const fullTemplate = `Subject: ${tmpl.subject}\n\n${tmpl.body}`;

  return (
    <div>
      {/* header */}
      <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>NWSA Orchestras</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '400' }}>Student Recruitment</h1>
        </div>
        <div style={{ display: 'flex', gap: '18px' }}>
          {['Contacted', 'Auditioned', 'Enrolled'].map(s => (
            <div key={s} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '20px', fontWeight: '300', color: STAGE_COLORS[s] }}>{stageCounts[s] || 0}</div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 28px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'transparent', border: 'none',
            borderBottom: tab === t ? '2px solid #4a7abf' : '2px solid transparent',
            color: tab === t ? '#e8e8e8' : '#555',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', padding: '12px 16px 10px',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '22px 28px', maxWidth: '920px' }}>

        {/* PIPELINE */}
        {tab === 'Pipeline' && (
          <div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
              {['All', ...STAGES].map(s => (
                <button key={s} onClick={() => setFilterStage(s)} style={{
                  background: filterStage === s ? `${STAGE_COLORS[s] || '#4a7abf'}22` : 'transparent',
                  border: `1px solid ${filterStage === s ? (STAGE_COLORS[s] || '#4a7abf') : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '5px',
                  color: filterStage === s ? (STAGE_COLORS[s] || '#4a7abf') : '#666',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '4px 10px',
                }}>
                  {s} {s !== 'All' && stageCounts[s] ? `(${stageCounts[s]})` : ''}
                </button>
              ))}
              <button onClick={addProspect} style={{
                marginLeft: 'auto',
                background: 'rgba(74,122,191,0.15)',
                border: '1px solid rgba(74,122,191,0.3)',
                borderRadius: '6px',
                color: '#4a7abf', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '4px 12px',
              }}>+ Add student</button>
            </div>

            {filtered.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 110px 120px auto', gap: '10px', padding: '4px 14px', marginBottom: '4px' }}>
                {['Name', 'Instrument', 'Grade', 'School', 'Stage', ''].map((h, i) => (
                  <span key={i} style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                ))}
              </div>
            )}

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#333', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>♪</div>
                <div style={{ fontSize: '13px' }}>No students in this stage.</div>
                <button onClick={addProspect} style={{ marginTop: '12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#666', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '6px 14px' }}>Add first prospect</button>
              </div>
            ) : (
              filtered.map(p => {
                const realIdx = data.prospects.findIndex(q => q.id === p.id);
                return (
                  <ProspectRow
                    key={p.id}
                    prospect={p}
                    onChange={updated => updateProspect(realIdx, updated)}
                    onDelete={() => deleteProspect(realIdx)}
                  />
                );
              })
            )}
          </div>
        )}

        {/* TIMELINE */}
        {tab === 'Timeline' && (
          <div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Audition window / notes</div>
              <textarea
                value={data.auditionDates}
                onChange={e => persist({ ...data, auditionDates: e.target.value })}
                placeholder="e.g. Auditions: Aug 5–15, 2026. Building 4, Room 401."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            {TIMELINE.map(month => (
              <div key={month.month} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '10px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#aaa', marginBottom: '10px' }}>{month.month}</div>
                {month.tasks.map((task, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ color: '#4a7abf', fontSize: '12px' }}>·</span>
                    <span style={{ fontSize: '13px', color: '#888' }}>{task}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* TEMPLATES */}
        {tab === 'Templates' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {Object.entries(data.templates).map(([key, t]) => (
                <button key={key} onClick={() => setSelectedTemplate(key)} style={{
                  background: selectedTemplate === key ? 'rgba(74,122,191,0.15)' : 'transparent',
                  border: `1px solid ${selectedTemplate === key ? 'rgba(74,122,191,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '5px',
                  color: selectedTemplate === key ? '#4a7abf' : '#666',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '5px 12px',
                }}>{t.label}</button>
              ))}
            </div>
            <div style={{ marginBottom: '10px', fontSize: '12px', color: '#555', lineHeight: 1.6 }}>
              Templates are editable and saved privately — fill in your own signature and contact
              details once and they stick. Replace [bracketed placeholders] before sending.
            </div>
            <div style={{ position: 'relative' }}>
              <textarea
                value={tmpl.body}
                onChange={e => updateTemplateBody(selectedTemplate, e.target.value)}
                rows={18}
                style={{ ...inputStyle, lineHeight: '1.75', color: '#bbb', resize: 'vertical' }}
              />
              <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => resetTemplate(selectedTemplate)}
                  title="Restore the default text"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '5px',
                    color: '#666',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '11px',
                    padding: '4px 10px',
                  }}
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(fullTemplate);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '5px',
                    color: copied ? '#6abf4a' : '#888',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '11px',
                    padding: '4px 10px',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
