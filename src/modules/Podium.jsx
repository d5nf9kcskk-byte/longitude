import { useState, useEffect, useCallback } from 'react';
import { loadCollection, saveRecord, deleteRecord } from '../podiumStore';
import { loadKey, saveKey } from '../storage';
import { ORCHESTRA_SEED } from '../data/orchestrasSeed';
import { inputStyle, labelStyle, GOLD } from '../theme';

// Podium — guest-conducting outreach system (Phase 1).
//
// A brand-nurture pipeline, not a sales sequence: the goal is to keep Grant's
// name and artistic identity in front of the people who choose guest conductors
// (EDs, MDs, artistic administrators, personnel managers, board members) with
// value-first touches, and to track every contact from cold prospect through an
// invitation and the post-concert re-engagement loop.
//
// Storage: dedicated `orchestras` / `contacts` Firestore collections (see
// podiumStore.js). Editable message templates live in one private module blob.

const TEMPLATES_KEY = 'podium_templates_v1';
const ORCH = 'orchestras';
const CONTACTS = 'contacts';

// Full funnel — from cold prospect to re-engagement after a concert.
const STAGES = [
  'Prospect',        // in the database, not yet contacted
  'Contacted',       // first touch sent, no engagement yet
  'Engaged',         // opened / clicked / light reply
  'In Conversation', // a real back-and-forth
  'Meeting',         // call or coffee taken
  'On Radar',        // warm relationship — the long-term bench
  'Invited',         // they raised guest conducting
  'Contracted',      // dates + program confirmed
  'Performed',       // the concert happened
  'Re-engagement',   // post-concert follow-up toward a re-book
  'Closed',          // dormant / not a fit
  'Do Not Contact',  // hard stop
];

const STAGE_COLORS = {
  Prospect: '#555',
  Contacted: '#4a7abf',
  Engaged: '#4a9abf',
  'In Conversation': '#4abf9a',
  Meeting: '#7abf4a',
  'On Radar': GOLD,
  Invited: '#bf9a4a',
  Contracted: '#bf7a4a',
  Performed: '#6abf4a',
  'Re-engagement': '#8a5abf',
  Closed: '#444',
  'Do Not Contact': '#7a3a3a',
};

const ROLES = [
  'Executive Director',
  'Music Director',
  'Artistic Director',
  'Artistic Administrator',
  'Personnel Manager',
  'Board Member',
  'Other',
];

const TIERS = ['T1', 'T2', 'T3', 'T4'];
const TIER_LABEL = { T1: 'Major', T2: 'Regional', T3: 'Metropolitan', T4: 'Adjacent' };
const EMAIL_CONFIDENCE = ['unknown', 'inferred', 'verified'];

// The touch library — value-first, no direct ask. These drive the cadence.
const TOUCH_TYPES = [
  'Introduction',
  'Artifact drop',
  'Program idea',
  'Relevance / timeliness',
  'Soft availability',
  'Personal reply',
  'Post-concert thank-you',
  'Re-engagement',
  'Other',
];

// Message library. Ships with generic [bracketed] placeholders — this repo is
// public, so Grant's real signature/contact details live in the private saved
// copy, editable in the Templates tab.
const DEFAULT_TEMPLATES = {
  intro: {
    label: 'Touch 1 — Introduction',
    subject: 'An American-repertoire program idea for [Orchestra]',
    body: `Dear [Name],

I'm Grant Gilman — a conductor focused on the American symphonic tradition, and Director of Orchestras at New World School of the Arts. I follow [Orchestra]'s programming closely; [specific, genuine observation — a recent program, a commission, a Price or Still performance].

I won't take your time with a pitch. I mostly wanted to introduce myself and leave you something worth having: [a specific program concept, or a link to the American Muse episode / recording most relevant to your audience]. My working conviction is that a Schuman or a Piston symphony, rehearsed to the standard we'd give a Brahms, is a subscription argument — not a risk to be managed.

No reply needed. I'll look forward to [Orchestra]'s [upcoming concert / season].

Best,
Grant Gilman
conductor@grantgilman.com | grantgilman.com`,
  },
  artifact: {
    label: 'Touch 2 — Artifact drop',
    subject: 'Thought of [Orchestra] when this went out',
    body: `Dear [Name],

A short note — [new American Muse episode / the published Schwarz article / a recording] just went out, and it made me think of [Orchestra] because [specific reason tied to their audience or recent programming].

[Link]

Nothing needed on your end. Sharing it because I think it's genuinely relevant to the work you're doing.

Best,
Grant Gilman
conductor@grantgilman.com`,
  },
  program: {
    label: 'Touch 3 — Program idea',
    subject: 'A program concept for [Orchestra]',
    body: `Dear [Name],

One concrete idea, offered freely: pair [American work] with [core repertoire anchor] — [one sentence on why the pairing works for their audience and sells the American work rather than apologizing for it].

[Two or three lines developing the concept: the through-line, the hook for subscribers, why the American work rewards serious rehearsal.]

I'd be glad to develop it further if it's ever useful — but mostly I wanted you to have it.

Best,
Grant Gilman
conductor@grantgilman.com`,
  },
  timeliness: {
    label: 'Touch 4 — Relevance / timeliness',
    subject: '[Composer / occasion] — a note for [Orchestra]',
    body: `Dear [Name],

With [anniversary / occasion / Price-Still moment / recent press] in view, I wanted to pass along [the relevant artifact or thought] in case it's useful as you plan.

[One or two specific, stakes-bearing lines — no filler.]

Best,
Grant Gilman
conductor@grantgilman.com`,
  },
  availability: {
    label: 'Touch 5 — Soft availability (warm contacts only)',
    subject: 'Staying in touch — [Orchestra]',
    body: `Dear [Name],

It's been a pleasure keeping in touch. If you ever build an American-repertoire program and want a specialist on the podium — someone who will rehearse a Schuman symphony to the standard of the European canon — I'd love to be in that conversation.

No urgency at all. I'll keep sharing the work either way.

Best,
Grant Gilman
conductor@grantgilman.com`,
  },
  reply: {
    label: 'Positive reply (personal)',
    subject: 'Re: [thread]',
    body: `Dear [Name],

Thank you — that means a lot, and I'm glad it landed. [Respond specifically to what they said.]

[One genuine question about their season, or an offer to share the fuller program concept / one-sheet — still no hard ask.]

Best,
Grant Gilman`,
  },
  thankyou: {
    label: 'Post-concert thank-you',
    subject: 'Thank you — [Orchestra] [dates]',
    body: `Dear [Name],

Thank you for having me with [Orchestra]. [Specific, genuine note about the players, the collaboration, a moment in the performance, the audience response.]

It was a real privilege to make this music with your musicians. My thanks to you and to [personnel manager / staff] for making the week what it was.

Warmly,
Grant Gilman`,
  },
  reengage: {
    label: 'Re-engagement (the thesis, proven)',
    subject: 'A note from after [Orchestra]',
    body: `Dear [Name],

Following up from [month] — [any press, audience, or subscription signal from the concert, if you have it: this is the thesis proven, not a claim].

As you look toward [next season], I'd love nothing more than to do it again. Whenever the planning conversation opens up, I'm here.

Warmly,
Grant Gilman`,
  },
  onesheet: {
    label: 'One-sheet copy (for the PDF)',
    subject: 'One-sheet — Grant Gilman, Conductor',
    body: `GRANT GILMAN — CONDUCTOR
American symphonic repertoire, rehearsed to the standard of the European canon.

THE ARGUMENT
American symphonic music, prepared at the level we reserve for the core European
romantics, is a subscription argument — not a niche indulgence. The repertoire
spine runs from the Second New England School (Chadwick, Beach) through the
postwar symphonists (Hanson, Piston, Schuman, Mennin, Creston), read alongside
the overdue reappraisal of Florence Price and William Grant Still.

BACKGROUND
· DMA, College-Conservatory of Music (studied with Mark Gibson / Aik Khai Pung
  lineage — Meier and Thakar)
· Director of Orchestras, New World School of the Arts, Miami
· Host, "American Muse" (podcast)
· Author, "Secrets of American Orchestral Music" (in progress)

SELECTED WORK / LISTENING
· [Link — representative performance or recording]
· [Link — American Muse episode]
· [Link — the Schwarz recording-legacy article, once placed]

CONTACT
conductor@grantgilman.com · grantgilman.com`,
  },
};

const EMPTY_CONTACT = orchestraId => ({
  orchestraId,
  name: '',
  title: '',
  roleCategory: 'Artistic Administrator',
  email: '',
  emailConfidence: 'unknown',
  phone: '',
  linkedin: '',
  decisionWeight: 3,
  doNotContact: false,
  stage: 'Prospect',
  cadenceTrack: '',
  nextTouchDue: '',
  lastContact: '',
  personalNotes: '',
  touchHistory: [],
});

const EMPTY_ORCHESTRA = () => ({
  name: '',
  city: '',
  state: '',
  tier: 'T2',
  website: '',
  guestModel: 'unknown',
  fitScore: '',
  repProfile: '',
  status: 'active',
});

const TABS = ['Pipeline', 'Orchestras', 'Templates', 'Playbook'];

function Field({ label, children }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

const selectStyle = { ...inputStyle, cursor: 'pointer' };

// ---------------------------------------------------------------- Contact card
function ContactCard({ contact, orchestraName, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const color = STAGE_COLORS[contact.stage] || '#555';
  const touches = contact.touchHistory?.length || 0;

  const [touchType, setTouchType] = useState('Introduction');
  const [touchNotes, setTouchNotes] = useState('');

  function logTouch() {
    const today = new Date().toISOString().slice(0, 10);
    const entry = { date: today, type: touchType, notes: touchNotes.trim(), response: '' };
    onChange({
      ...contact,
      touchHistory: [...(contact.touchHistory || []), entry],
      lastContact: today,
      stage: contact.stage === 'Prospect' ? 'Contacted' : contact.stage,
    });
    setTouchNotes('');
  }

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
          gridTemplateColumns: '1.3fr 1.2fr 1fr 130px 70px auto',
          gap: '10px',
          padding: '10px 14px',
          cursor: 'pointer',
          alignItems: 'center',
        }}
      >
        <div style={{ fontWeight: 500, fontSize: '13px' }}>
          {contact.name || <span style={{ color: '#444' }}>Unnamed</span>}
          {contact.doNotContact && <span style={{ color: '#7a3a3a', fontSize: '10px', marginLeft: 6 }}>⛔</span>}
        </div>
        <div style={{ fontSize: '11px', color: '#888' }}>{contact.title || contact.roleCategory}</div>
        <div style={{ fontSize: '11px', color: '#666' }}>{orchestraName}</div>
        <div>
          <span style={{ fontSize: '11px', color, background: `${color}18`, padding: '2px 8px', borderRadius: '4px' }}>
            {contact.stage}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>{touches} touch{touches !== 1 ? 'es' : ''}</div>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>✕</button>
      </div>

      {open && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <Field label="Name">
              <input value={contact.name} onChange={e => onChange({ ...contact, name: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Title">
              <input value={contact.title} onChange={e => onChange({ ...contact, title: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Role">
              <select value={contact.roleCategory} onChange={e => onChange({ ...contact, roleCategory: e.target.value })} style={selectStyle}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Email">
              <input value={contact.email} onChange={e => onChange({ ...contact, email: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Email confidence">
              <select value={contact.emailConfidence} onChange={e => onChange({ ...contact, emailConfidence: e.target.value })} style={selectStyle}>
                {EMAIL_CONFIDENCE.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Phone">
              <input value={contact.phone} onChange={e => onChange({ ...contact, phone: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Stage">
              <select value={contact.stage} onChange={e => onChange({ ...contact, stage: e.target.value })} style={selectStyle}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Decision weight (1–5)">
              <input type="number" min="1" max="5" value={contact.decisionWeight} onChange={e => onChange({ ...contact, decisionWeight: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Next touch due">
              <input type="date" value={contact.nextTouchDue} onChange={e => onChange({ ...contact, nextTouchDue: e.target.value })} style={inputStyle} />
            </Field>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <Field label="Private notes">
              <textarea value={contact.personalNotes} onChange={e => onChange({ ...contact, personalNotes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#888', marginBottom: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={contact.doNotContact} onChange={e => onChange({ ...contact, doNotContact: e.target.checked, stage: e.target.checked ? 'Do Not Contact' : contact.stage })} />
            Do not contact (hard stop — honor any opt-out immediately)
          </label>

          {/* Touch log */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Touch history {contact.lastContact ? `· last ${contact.lastContact}` : ''}
            </div>
            {touches > 0 && (
              <div style={{ marginBottom: '10px' }}>
                {contact.touchHistory.map((t, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#999', display: 'flex', gap: '8px', padding: '3px 0' }}>
                    <span style={{ color: '#666', minWidth: '78px' }}>{t.date}</span>
                    <span style={{ color: GOLD, minWidth: '120px' }}>{t.type}</span>
                    <span>{t.notes}{t.response ? ` — ↩ ${t.response}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: '8px', alignItems: 'center' }}>
              <select value={touchType} onChange={e => setTouchType(e.target.value)} style={selectStyle}>
                {TOUCH_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input value={touchNotes} onChange={e => setTouchNotes(e.target.value)} placeholder="What went out / what came back…" style={inputStyle} />
              <button onClick={logTouch} style={{ background: 'rgba(200,168,74,0.15)', border: '1px solid rgba(200,168,74,0.3)', borderRadius: '6px', color: GOLD, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '8px 14px', whiteSpace: 'nowrap' }}>
                Log touch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Orchestra block
function OrchestraBlock({ orchestra, contacts, onChangeOrch, onDeleteOrch, onAddContact, onChangeContact, onDeleteContact }) {
  const [open, setOpen] = useState(false);
  const tierColor = orchestra.tier === 'T1' ? GOLD : '#4a7abf';

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 90px auto', gap: '10px', padding: '12px 14px', cursor: 'pointer', alignItems: 'center' }}>
        <div style={{ fontWeight: 500, fontSize: '14px' }}>{orchestra.name || 'Untitled'}</div>
        <div style={{ fontSize: '12px', color: '#777' }}>{orchestra.city}{orchestra.state ? `, ${orchestra.state}` : ''}</div>
        <div><span style={{ fontSize: '10px', color: tierColor, background: `${tierColor}18`, padding: '2px 7px', borderRadius: '4px' }}>{TIER_LABEL[orchestra.tier] || orchestra.tier}</span></div>
        <div style={{ fontSize: '11px', color: '#666' }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</div>
        <button onClick={e => { e.stopPropagation(); onDeleteOrch(); }} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>✕</button>
      </div>

      {open && (
        <div style={{ padding: '4px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', margin: '12px 0' }}>
            <Field label="Name"><input value={orchestra.name} onChange={e => onChangeOrch({ ...orchestra, name: e.target.value })} style={inputStyle} /></Field>
            <Field label="City"><input value={orchestra.city} onChange={e => onChangeOrch({ ...orchestra, city: e.target.value })} style={inputStyle} /></Field>
            <Field label="State"><input value={orchestra.state} onChange={e => onChangeOrch({ ...orchestra, state: e.target.value })} style={inputStyle} /></Field>
            <Field label="Tier">
              <select value={orchestra.tier} onChange={e => onChangeOrch({ ...orchestra, tier: e.target.value })} style={selectStyle}>
                {TIERS.map(t => <option key={t} value={t}>{t} — {TIER_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="Guest-conductor model">
              <select value={orchestra.guestModel} onChange={e => onChangeOrch({ ...orchestra, guestModel: e.target.value })} style={selectStyle}>
                {['unknown', 'rotating', 'MD-only'].map(g => <option key={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Fit score (0–100)"><input type="number" min="0" max="100" value={orchestra.fitScore} onChange={e => onChangeOrch({ ...orchestra, fitScore: e.target.value })} style={inputStyle} /></Field>
            <Field label="Website"><input value={orchestra.website} onChange={e => onChangeOrch({ ...orchestra, website: e.target.value })} style={inputStyle} /></Field>
            <Field label="Status">
              <select value={orchestra.status} onChange={e => onChangeOrch({ ...orchestra, status: e.target.value })} style={selectStyle}>
                {['active', 'paused', 'do-not-contact'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <Field label="Repertoire / fit notes (does American rep? MD transition? guest appetite?)">
              <textarea value={orchestra.repProfile} onChange={e => onChangeOrch({ ...orchestra, repProfile: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </div>

          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Contacts</div>
          {contacts.map(c => (
            <ContactCard key={c.id} contact={c} orchestraName={orchestra.name} onChange={onChangeContact} onDelete={() => onDeleteContact(c.id)} />
          ))}
          {orchestra.website && (
            <a href={orchestra.website} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#4a7abf', marginRight: '14px' }}>Open site ↗</a>
          )}
          <button onClick={() => onAddContact(orchestra.id)} style={{ background: 'rgba(74,122,191,0.15)', border: '1px solid rgba(74,122,191,0.3)', borderRadius: '6px', color: '#4a7abf', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '5px 12px', marginTop: '6px' }}>
            + Add contact
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Playbook
function Playbook() {
  const S = ({ title, children }) => (
    <div style={{ marginBottom: '22px' }}>
      <div style={{ fontSize: '13px', color: GOLD, marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
  return (
    <div style={{ maxWidth: '760px' }}>
      <S title="The frame">
        This is brand-nurture, not a sales sequence. Every touch <em>gives</em> something and asks for
        nothing. The goal is recognition: be the name an artistic administrator already knows when an
        American-repertoire guest comes up.
      </S>
      <S title="Cadence by tier">
        <strong>T1 Majors</strong> — ~3–4 touches/year, pure value, multi-year horizon.<br />
        <strong>T2 Regional (primary)</strong> — ~5–6/year: intro → artifact → program idea → soft availability.<br />
        <strong>T3 Metropolitan</strong> — ~4–5/year, warmer sooner.<br />
        <strong>T4 Adjacent</strong> — opportunistic, repertoire-triggered.
      </S>
      <S title="Cadence rules">
        · Minimum 3–4 weeks between touches to one contact.<br />
        · Never two touches to the same orchestra in the same week.<br />
        · Never send the same template twice — always advance.<br />
        · Any reply pauses the cadence and moves them into the funnel below.<br />
        · Heaviest outreach in the programming-decision window (~Jan–Apr); go quiet during a run.
      </S>
      <S title="The funnel">
        <strong>No response</strong> → stay on cadence; downgrade to 1–2/year after ~5 unanswered.<br />
        <strong>Positive reply → In Conversation</strong> → personal reply within 24–48h, still no hard ask.<br />
        <strong>Warm signal → Meeting</strong> → offer a low-stakes 15-min call, then park at On Radar.<br />
        <strong>On Radar</strong> → the warm bench; 2–3 personal touches/year.<br />
        <strong>Invited → Contracted → Performed</strong> → it inverts; they ask. Build the relationship
        with players and the personnel manager — they drive re-invitations.<br />
        <strong>Re-engagement</strong> → thank-you within a week (no ask); ~30 days later share any
        press/subscription signal (the thesis, proven); at next-season planning, "let's do it again."
        A completed engagement seeds new prospects via referral.
      </S>
      <S title="Guardrails">
        No bulk auto-send. Confirm SPF/DKIM/DMARC and warm the domain before volume. Scraped contacts
        are suggestions to review, never truth. Honor any opt-out instantly. Every person, email, and
        note lives only in Firestore — never in committed source.
      </S>
    </div>
  );
}

// -------------------------------------------------------------------- Module
export default function Podium() {
  const [orchestras, setOrchestras] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState(null);
  const [tab, setTab] = useState('Pipeline');

  const [filterStage, setFilterStage] = useState('All');
  const [filterTier, setFilterTier] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('intro');
  const [copied, setCopied] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    Promise.all([loadCollection(ORCH), loadCollection(CONTACTS)]).then(([o, c]) => {
      setOrchestras(o);
      setContacts(c);
    });
    loadKey(TEMPLATES_KEY, { templates: DEFAULT_TEMPLATES }).then(d => {
      setTemplates(d.templates && Object.keys(d.templates).length ? d.templates : DEFAULT_TEMPLATES);
    });
  }, []);

  const saveOrch = useCallback(async o => {
    const saved = await saveRecord(ORCH, o);
    setOrchestras(prev => {
      const i = prev.findIndex(x => x.id === saved.id);
      if (i >= 0) { const n = [...prev]; n[i] = saved; return n; }
      return [...prev, saved];
    });
    return saved;
  }, []);

  const saveContact = useCallback(async c => {
    const saved = await saveRecord(CONTACTS, c);
    setContacts(prev => {
      const i = prev.findIndex(x => x.id === saved.id);
      if (i >= 0) { const n = [...prev]; n[i] = saved; return n; }
      return [...prev, saved];
    });
  }, []);

  const removeOrch = useCallback(async id => {
    await deleteRecord(ORCH, id);
    const kids = contacts.filter(c => c.orchestraId === id);
    for (const k of kids) await deleteRecord(CONTACTS, k.id);
    setOrchestras(prev => prev.filter(x => x.id !== id));
    setContacts(prev => prev.filter(c => c.orchestraId !== id));
  }, [contacts]);

  const removeContact = useCallback(async id => {
    await deleteRecord(CONTACTS, id);
    setContacts(prev => prev.filter(x => x.id !== id));
  }, []);

  async function seedOrchestras() {
    setSeeding(true);
    const existing = new Set(orchestras.map(o => `${o.name}|${o.city}`));
    const added = [];
    for (const s of ORCHESTRA_SEED) {
      if (existing.has(`${s.name}|${s.city}`)) continue;
      const saved = await saveRecord(ORCH, { ...EMPTY_ORCHESTRA(), ...s });
      added.push(saved);
    }
    setOrchestras(prev => [...prev, ...added]);
    setSeeding(false);
  }

  function saveTemplates(next) {
    setTemplates(next);
    saveKey(TEMPLATES_KEY, { templates: next });
  }

  if (!orchestras || !templates) return <div style={{ padding: '40px', color: '#666' }}>Loading…</div>;

  const orchById = Object.fromEntries(orchestras.map(o => [o.id, o]));
  const stageCounts = Object.fromEntries(STAGES.map(s => [s, contacts.filter(c => c.stage === s).length]));

  const q = search.trim().toLowerCase();
  const filteredContacts = contacts.filter(c => {
    if (filterStage !== 'All' && c.stage !== filterStage) return false;
    const o = orchById[c.orchestraId];
    if (filterTier !== 'All' && o?.tier !== filterTier) return false;
    if (q) {
      const hay = `${c.name} ${c.title} ${c.roleCategory} ${o?.name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const visibleOrchestras = orchestras
    .filter(o => filterTier === 'All' || o.tier === filterTier)
    .filter(o => !q || `${o.name} ${o.city} ${o.state}`.toLowerCase().includes(q))
    .sort((a, b) => (a.tier || '').localeCompare(b.tier || '') || (a.name || '').localeCompare(b.name || ''));

  const tmpl = templates[selectedTemplate];
  const fullTemplate = `Subject: ${tmpl.subject}\n\n${tmpl.body}`;

  const headline = [
    { label: 'On Radar', v: stageCounts['On Radar'] || 0, c: GOLD },
    { label: 'In Conversation', v: stageCounts['In Conversation'] || 0, c: '#4abf9a' },
    { label: 'Invited', v: stageCounts['Invited'] || 0, c: '#bf9a4a' },
  ];

  return (
    <div>
      {/* header */}
      <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>Guest Conducting</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 400 }}>Podium</h1>
        </div>
        <div style={{ display: 'flex', gap: '18px' }}>
          {headline.map(h => (
            <div key={h.label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '20px', fontWeight: 300, color: h.c }}>{h.v}</div>
              <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>{h.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 28px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'transparent', border: 'none',
            borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
            color: tab === t ? '#e8e8e8' : '#555',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', padding: '12px 16px 10px',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '22px 28px', maxWidth: '980px' }}>

        {/* filters (Pipeline + Orchestras) */}
        {(tab === 'Pipeline' || tab === 'Orchestras') && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inputStyle, width: '180px' }} />
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
              <option value="All">All tiers</option>
              {TIERS.map(t => <option key={t} value={t}>{t} — {TIER_LABEL[t]}</option>)}
            </select>
            {tab === 'Pipeline' && (
              <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
                <option value="All">All stages</option>
                {STAGES.map(s => <option key={s}>{s} ({stageCounts[s] || 0})</option>)}
              </select>
            )}
          </div>
        )}

        {/* PIPELINE */}
        {tab === 'Pipeline' && (
          <div>
            {filteredContacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                <div style={{ fontSize: '26px', marginBottom: '10px' }}>♪</div>
                <div style={{ fontSize: '13px' }}>No contacts yet. Add orchestras, then add the people who decide on guests.</div>
                <button onClick={() => setTab('Orchestras')} style={{ marginTop: '12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#888', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '6px 14px' }}>Go to Orchestras</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1fr 130px 70px auto', gap: '10px', padding: '4px 14px', marginBottom: '4px' }}>
                  {['Name', 'Title', 'Orchestra', 'Stage', 'Touches', ''].map((h, i) => (
                    <span key={i} style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                  ))}
                </div>
                {filteredContacts.map(c => (
                  <ContactCard key={c.id} contact={c} orchestraName={orchById[c.orchestraId]?.name || '—'} onChange={saveContact} onDelete={() => removeContact(c.id)} />
                ))}
              </>
            )}
          </div>
        )}

        {/* ORCHESTRAS */}
        {tab === 'Orchestras' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => saveOrch(EMPTY_ORCHESTRA())} style={{ background: 'rgba(74,122,191,0.15)', border: '1px solid rgba(74,122,191,0.3)', borderRadius: '6px', color: '#4a7abf', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '6px 14px' }}>+ Add orchestra</button>
              <button onClick={seedOrchestras} disabled={seeding} style={{ background: 'rgba(200,168,74,0.12)', border: '1px solid rgba(200,168,74,0.28)', borderRadius: '6px', color: GOLD, cursor: seeding ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '6px 14px', opacity: seeding ? 0.6 : 1 }}>
                {seeding ? 'Loading…' : 'Load seed list (T1+T2)'}
              </button>
              <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#555', alignSelf: 'center' }}>{orchestras.length} orchestras</div>
            </div>
            {visibleOrchestras.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px' }}>No orchestras yet. Load the seed list to start with the majors and regionals.</div>
              </div>
            ) : (
              visibleOrchestras.map(o => (
                <OrchestraBlock
                  key={o.id}
                  orchestra={o}
                  contacts={contacts.filter(c => c.orchestraId === o.id)}
                  onChangeOrch={saveOrch}
                  onDeleteOrch={() => removeOrch(o.id)}
                  onAddContact={oid => saveContact(EMPTY_CONTACT(oid))}
                  onChangeContact={saveContact}
                  onDeleteContact={removeContact}
                />
              ))
            )}
          </div>
        )}

        {/* TEMPLATES */}
        {tab === 'Templates' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {Object.entries(templates).map(([key, t]) => (
                <button key={key} onClick={() => setSelectedTemplate(key)} style={{
                  background: selectedTemplate === key ? 'rgba(200,168,74,0.15)' : 'transparent',
                  border: `1px solid ${selectedTemplate === key ? 'rgba(200,168,74,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '5px',
                  color: selectedTemplate === key ? GOLD : '#666',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '5px 12px',
                }}>{t.label}</button>
              ))}
            </div>
            <div style={{ marginBottom: '10px', fontSize: '12px', color: '#555', lineHeight: 1.6 }}>
              Value-first, no direct ask — that's the whole strategy. Templates are editable and saved
              privately; fill in your real signature once and it sticks. Replace [bracketed placeholders]
              and personalize every send.
            </div>
            <div style={{ marginBottom: '10px' }}>
              <Field label="Subject">
                <input
                  value={tmpl.subject}
                  onChange={e => saveTemplates({ ...templates, [selectedTemplate]: { ...tmpl, subject: e.target.value } })}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ position: 'relative' }}>
              <textarea
                value={tmpl.body}
                onChange={e => saveTemplates({ ...templates, [selectedTemplate]: { ...tmpl, body: e.target.value } })}
                rows={18}
                style={{ ...inputStyle, lineHeight: 1.75, color: '#bbb', resize: 'vertical' }}
              />
              <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                <button onClick={() => saveTemplates({ ...templates, [selectedTemplate]: DEFAULT_TEMPLATES[selectedTemplate] || tmpl })} title="Restore default text" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', color: '#666', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '4px 10px' }}>Reset</button>
                <button onClick={() => { navigator.clipboard.writeText(fullTemplate); setCopied(true); setTimeout(() => setCopied(false), 1800); }} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', color: copied ? '#6abf4a' : '#888', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '4px 10px' }}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            </div>
          </div>
        )}

        {/* PLAYBOOK */}
        {tab === 'Playbook' && <Playbook />}
      </div>
    </div>
  );
}
