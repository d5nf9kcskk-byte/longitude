import { useState, useEffect, useCallback } from 'react';
import { loadKey, saveKey } from '../storage';
import { inputStyle } from '../theme';

const STORAGE_KEY = 'nwsa_syllabi_v1';

const COURSES = [
  {
    id: 'history1',
    label: 'Music History Survey I',
    abbr: 'MHS I',
    description: 'Ancient through Baroque',
    accent: '#6aaf4a',
  },
  {
    id: 'history2',
    label: 'Music History Survey II',
    abbr: 'MHS II',
    description: 'Classical through 20th century',
    accent: '#4a7abf',
  },
  {
    id: 'conducting',
    label: 'Conducting',
    abbr: 'COND',
    description: 'Technique and score reading',
    accent: '#bf5a4a',
  },
  {
    id: 'orchestration',
    label: 'Orchestration',
    abbr: 'ORCH',
    description: 'Instrumental writing and arrangement',
    accent: '#8a5abf',
  },
];

const ACCENT_RGB = {
  '#6aaf4a': '106,175,74',
  '#4a7abf': '74,122,191',
  '#bf5a4a': '191,90,74',
  '#8a5abf': '138,90,191',
};

const DEFAULT_COURSE = () => ({
  coreObjective: '',
  essentials: [],
  cuts: [],
  units: [],
  assignments: [],
  gradingNotes: '',
});

const DEFAULT_DATA = {
  courses: Object.fromEntries(COURSES.map(c => [c.id, DEFAULT_COURSE()])),
};

function ListEditor({ label, placeholder, items, onUpdate, accent }) {
  const [text, setText] = useState('');
  function add() {
    if (!text.trim()) return;
    onUpdate([...items, { id: crypto.randomUUID(), text }]);
    setText('');
  }
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '10px',
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '8px',
      }}>{label}</div>
      {items.map((item, i) => (
        <div key={item.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '4px',
        }}>
          <span style={{ color: accent, fontSize: '12px', width: '14px', flexShrink: 0 }}>·</span>
          <input
            value={item.text}
            onChange={e => {
              const updated = [...items];
              updated[i] = { ...item, text: e.target.value };
              onUpdate(updated);
            }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => onUpdate(items.filter((_, j) => j !== i))}
            style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '12px', padding: '2px 6px', fontFamily: 'inherit' }}
          >✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder={placeholder}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={add} style={{
          background: 'transparent',
          border: `1px solid ${accent}44`,
          borderRadius: '5px',
          color: accent,
          cursor: 'pointer',
          fontSize: '12px',
          padding: '6px 12px',
          fontFamily: 'inherit',
        }}>+ Add</button>
      </div>
    </div>
  );
}

function UnitEditor({ units, onUpdate, accent }) {
  function addUnit() {
    onUpdate([...units, { id: crypto.randomUUID(), title: '', weeks: '', topics: '' }]);
  }
  function updateUnit(i, field, val) {
    const u = [...units];
    u[i] = { ...u[i], [field]: val };
    onUpdate(u);
  }
  function deleteUnit(i) {
    onUpdate(units.filter((_, j) => j !== i));
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '10px',
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '8px',
      }}>Course units / schedule</div>
      {units.map((u, i) => (
        <div key={u.id} style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '7px',
          padding: '10px 12px',
          marginBottom: '8px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <input
              value={u.title}
              onChange={e => updateUnit(i, 'title', e.target.value)}
              placeholder="Unit title"
              style={{ ...inputStyle, fontWeight: '500' }}
            />
            <input
              value={u.weeks}
              onChange={e => updateUnit(i, 'weeks', e.target.value)}
              placeholder="Wks"
              style={{ ...inputStyle, textAlign: 'center' }}
            />
            <button onClick={() => deleteUnit(i)} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '13px', padding: '2px 6px', fontFamily: 'inherit' }}>✕</button>
          </div>
          <textarea
            value={u.topics}
            onChange={e => updateUnit(i, 'topics', e.target.value)}
            placeholder="Key topics, repertoire, composers covered…"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.6' }}
          />
        </div>
      ))}
      <button onClick={addUnit} style={{
        background: 'transparent',
        border: `1px dashed ${accent}44`,
        borderRadius: '6px',
        color: '#666',
        cursor: 'pointer',
        fontSize: '12px',
        padding: '7px 14px',
        fontFamily: 'inherit',
      }}>+ Add unit</button>
    </div>
  );
}

export default function SyllabusEssentials() {
  const [data, setData] = useState(null);
  const [activeCourse, setActiveCourse] = useState('history1');

  useEffect(() => {
    loadKey(STORAGE_KEY, DEFAULT_DATA).then(setData);
  }, []);

  const persist = useCallback(newData => {
    setData(newData);
    saveKey(STORAGE_KEY, newData);
  }, []);

  if (!data) return <div style={{ padding: '40px', color: '#666' }}>Loading syllabi…</div>;

  const course = COURSES.find(c => c.id === activeCourse);
  const courseData = data.courses[activeCourse] || DEFAULT_COURSE();

  function updateCourseField(field, value) {
    persist({
      ...data,
      courses: {
        ...data.courses,
        [activeCourse]: { ...courseData, [field]: value },
      },
    });
  }

  function completeness(cd) {
    let score = 0;
    if (cd.coreObjective?.trim()) score++;
    if (cd.essentials?.length > 0) score++;
    if (cd.units?.length > 0) score++;
    if (cd.assignments?.length > 0) score++;
    return score;
  }

  return (
    <div>
      {/* header */}
      <div style={{
        padding: '24px 30px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>NWSA · Course Design</div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '400' }}>Syllabus Essentials</h1>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#555', lineHeight: '1.5' }}>
          One core objective per course. Everything else either serves it or gets cut.
        </p>
      </div>

      {/* course tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 30px', overflowX: 'auto' }}>
        {COURSES.map(c => {
          const cd = data.courses[c.id] || DEFAULT_COURSE();
          const score = completeness(cd);
          const isActive = activeCourse === c.id;
          return (
            <button key={c.id} onClick={() => setActiveCourse(c.id)} style={{
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? `2px solid ${c.accent}` : '2px solid transparent',
              color: isActive ? '#e8e8e8' : '#555',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '13px',
              padding: '13px 18px 11px',
              whiteSpace: 'nowrap',
            }}>
              {c.abbr}
              <span style={{ marginLeft: '8px', fontSize: '10px', color: '#444' }}>
                {'●'.repeat(score)}{'○'.repeat(4 - score)}
              </span>
            </button>
          );
        })}
      </div>

      {/* content */}
      <div style={{ padding: '24px 30px', maxWidth: '820px' }}>
        <div style={{ marginBottom: '8px' }}>
          <h2 style={{ margin: '0 0 2px', fontSize: '17px', fontWeight: '400' }}>{course.label}</h2>
          <div style={{ fontSize: '12px', color: '#555' }}>{course.description}</div>
        </div>

        {/* machete question */}
        <div style={{
          background: `rgba(${ACCENT_RGB[course.accent]},0.07)`,
          border: `1px solid ${course.accent}22`,
          borderRadius: '8px',
          padding: '14px 16px',
          marginBottom: '22px',
          marginTop: '18px',
        }}>
          <div style={{ fontSize: '11px', color: course.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            The machete question
          </div>
          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '10px', lineHeight: '1.6' }}>
            What is the one thing students must be able to do by the last day of this course?
          </div>
          <textarea
            value={courseData.coreObjective}
            onChange={e => updateCourseField('coreObjective', e.target.value)}
            placeholder="Be specific. Not 'understand music history' — something they can demonstrate."
            rows={3}
            style={{ ...inputStyle, lineHeight: '1.7', resize: 'vertical' }}
          />
        </div>

        <ListEditor
          label="Keep — essential to the core objective"
          placeholder="What stays, and why it earns its place…"
          items={courseData.essentials}
          onUpdate={v => updateCourseField('essentials', v)}
          accent={course.accent}
        />

        <ListEditor
          label="Cut — doesn't serve the core objective"
          placeholder="What goes, what was it replacing…"
          items={courseData.cuts}
          onUpdate={v => updateCourseField('cuts', v)}
          accent="#666"
        />

        <UnitEditor
          units={courseData.units}
          onUpdate={v => updateCourseField('units', v)}
          accent={course.accent}
        />

        <ListEditor
          label="Assignments & assessments"
          placeholder="Assignment name, format, weight…"
          items={courseData.assignments}
          onUpdate={v => updateCourseField('assignments', v)}
          accent={course.accent}
        />

        <div>
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            Grading philosophy / notes
          </div>
          <textarea
            value={courseData.gradingNotes}
            onChange={e => updateCourseField('gradingNotes', e.target.value)}
            placeholder="What you're grading for. Craft over ambition. Clarity over coverage."
            rows={4}
            style={{ ...inputStyle, lineHeight: '1.7', resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  );
}
