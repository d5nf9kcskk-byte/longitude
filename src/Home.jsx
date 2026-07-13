import { useState, useEffect } from 'react';
import { NavLink } from 'react-router';
import { loadKey } from './storage';
import { GOLD } from './theme';

// Reads each module's stored blob to surface one live stat per card.
const KEYS = {
  season: 'nwsa_season_planner_v1',
  workbench: 'schwarz_workbench_v1',
  syllabi: 'nwsa_syllabi_v1',
  recruiting: 'nwsa_recruitment_v1',
  practice: 'practice_log_v1',
  ideas: 'idea_capture_v1',
  tasks: 'task_board_v1',
};

function wordCount(text) {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function computeStats(d) {
  const stats = {};

  if (d.season) {
    const programs = Object.values(d.season.ensembles || {}).flatMap(e => e.programs || []);
    const works = programs.reduce((s, p) => s + (p.works?.length || 0), 0);
    const american = programs.reduce((s, p) => s + (p.works?.filter(w => w.isAmerican).length || 0), 0);
    stats.season = works > 0
      ? `${programs.length} concerts · ${works} works · ${Math.round((american / works) * 100)}% American`
      : 'No concerts programmed yet';
  }

  if (d.workbench) {
    const wc = wordCount(d.workbench.thesis) +
      (d.workbench.sections || []).reduce((s, sec) => s + wordCount(sec.content), 0);
    stats.workbench = `${wc.toLocaleString()} / ${(d.workbench.wordTarget || 2500).toLocaleString()} words drafted`;
  }

  if (d.syllabi) {
    const courses = Object.values(d.syllabi.courses || {});
    const done = courses.filter(c =>
      c.coreObjective?.trim() && c.essentials?.length && c.units?.length && c.assignments?.length
    ).length;
    stats.syllabi = `${done} of ${courses.length || 4} syllabi complete`;
  }

  if (d.recruiting) {
    const p = d.recruiting.prospects || [];
    const enrolled = p.filter(x => x.stage === 'Enrolled').length;
    stats.recruiting = p.length > 0
      ? `${p.length} prospects · ${enrolled} enrolled`
      : 'No prospects yet';
  }

  if (d.practice) {
    const entries = d.practice.entries || [];
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const mins = entries
      .filter(e => new Date(e.date + 'T12:00').getTime() >= weekAgo)
      .reduce((s, e) => s + (parseInt(e.minutes) || 0), 0);
    stats.practice = `${mins} min this week · ${entries.length} sessions logged`;
  }

  if (d.ideas) {
    const open = (d.ideas.ideas || []).filter(i => !i.archived).length;
    stats.ideas = `${open} active idea${open !== 1 ? 's' : ''}`;
  }

  if (d.tasks) {
    const now = (d.tasks.tasks || []).filter(t => t.column === 'Now').length;
    const open = (d.tasks.tasks || []).filter(t => t.column !== 'Done').length;
    stats.tasks = `${now} in Now · ${open} open`;
  }

  return stats;
}

const CARDS = [
  { to: '/season', title: 'Season Planner', sub: 'Five ensembles, one season', key: 'season', accent: '#4a8abf' },
  { to: '/workbench', title: 'Schwarz Workbench', sub: 'The recording-legacy article', key: 'workbench', accent: GOLD },
  { to: '/syllabi', title: 'Syllabus Essentials', sub: 'One core objective per course', key: 'syllabi', accent: '#6aaf4a' },
  { to: '/recruiting', title: 'Recruitment', sub: 'Pipeline, timeline, templates', key: 'recruiting', accent: '#4a7abf' },
  { to: '/practice', title: 'Study Log', sub: 'Scores, baton, listening', key: 'practice', accent: '#bf7a5a' },
  { to: '/ideas', title: 'Idea Capture', sub: 'Podcast, articles, programming', key: 'ideas', accent: '#8a5abf' },
  { to: '/tasks', title: 'Task Board', sub: 'Now · Next · Later · Done', key: 'tasks', accent: '#4aaf7a' },
];

export default function Home() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const [season, workbench, syllabi, recruiting, practice, ideas, tasks] = await Promise.all([
        loadKey(KEYS.season, null),
        loadKey(KEYS.workbench, null),
        loadKey(KEYS.syllabi, null),
        loadKey(KEYS.recruiting, null),
        loadKey(KEYS.practice, null),
        loadKey(KEYS.ideas, null),
        loadKey(KEYS.tasks, null),
      ]);
      if (alive) setStats(computeStats({ season, workbench, syllabi, recruiting, practice, ideas, tasks }));
    })();
    return () => { alive = false; };
  }, []);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div style={{ padding: '30px 28px 60px', maxWidth: '980px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '11px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
          {today}
        </div>
        <h1 style={{ fontWeight: 400, fontSize: '26px', letterSpacing: '-0.01em' }}>
          Where the work stands
        </h1>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '14px',
      }}>
        {/* Score Study is a standalone static companion app deployed at
            /score-study/ alongside the Vite build — plain link, not a route. */}
        <a
          href={`${import.meta.env.BASE_URL}score-study/`}
          style={{
            display: 'block',
            textDecoration: 'none',
            color: '#e8e8e8',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: '2px solid #b48c3c',
            borderRadius: '10px',
            padding: '18px 18px 16px',
          }}
        >
          <div style={{ fontSize: '16px', marginBottom: '3px' }}>Score Study ↗</div>
          <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginBottom: '12px' }}>
            Encoding-first score-learning coach
          </div>
          <div style={{ fontSize: '12px', color: '#b48c3c' }}>Companion app</div>
        </a>
        {CARDS.map(card => (
          <NavLink
            key={card.to}
            to={card.to}
            style={{
              display: 'block',
              textDecoration: 'none',
              color: '#e8e8e8',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTop: `2px solid ${card.accent}`,
              borderRadius: '10px',
              padding: '18px 18px 16px',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ fontSize: '16px', marginBottom: '3px' }}>{card.title}</div>
            <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginBottom: '12px' }}>{card.sub}</div>
            <div style={{ fontSize: '12px', color: stats[card.key] ? card.accent : '#444' }}>
              {stats[card.key] || '—'}
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
