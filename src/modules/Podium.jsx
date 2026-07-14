import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { loadCollection, saveRecord, deleteRecord } from '../podiumStore';
import { loadKey, saveKey } from '../storage';
import { ORCHESTRA_SEED } from '../data/orchestrasSeed';
import { inputStyle, labelStyle, GOLD } from '../theme';

// Podium — guest-conducting outreach system.
//
// A brand-nurture pipeline, not a sales sequence: keep Grant's name and
// artistic identity in front of the people who choose guest conductors (EDs,
// MDs, artistic administrators, personnel managers, board members) with
// value-first touches, and track every contact from cold prospect through an
// invitation and the post-concert re-engagement loop.
//
// Phase 1: database + pipeline + templates + playbook.
// Phase 2: cadence engine — the Due worklist auto-schedules the next touch.
// Phase 3: Review queue for contacts surfaced by the scraper Action.
// Phase 4: Analytics + AI-drafted personalization (via the aiRequests queue).
//
// Storage: dedicated `orchestras` / `contacts` Firestore collections (see
// podiumStore.js). Editable message templates live in one private module blob.

const TEMPLATES_KEY = 'podium_templates_v1';
const ORCH = 'orchestras';
const CONTACTS = 'contacts';

const STAGES = [
  'Prospect', 'Contacted', 'Engaged', 'In Conversation', 'Meeting',
  'On Radar', 'Invited', 'Contracted', 'Performed', 'Re-engagement',
  'Closed', 'Do Not Contact',
];

const STAGE_COLORS = {
  Prospect: '#555', Contacted: '#4a7abf', Engaged: '#4a9abf',
  'In Conversation': '#4abf9a', Meeting: '#7abf4a', 'On Radar': GOLD,
  Invited: '#bf9a4a', Contracted: '#bf7a4a', Performed: '#6abf4a',
  'Re-engagement': '#8a5abf', Closed: '#444', 'Do Not Contact': '#7a3a3a',
};

const ROLES = [
  'Executive Director', 'Music Director', 'Artistic Director',
  'Artistic Administrator', 'Personnel Manager', 'Board Member', 'Other',
];

// The roles that actually influence guest-conductor decisions — used to sort
// the Review queue so the people worth approving float to the top, and to power
// the "discard all board members" bulk action.
const DECISION_ROLES = ['Executive Director', 'Music Director', 'Artistic Director', 'Artistic Administrator', 'Personnel Manager'];
const ROLE_PRIORITY = Object.fromEntries(ROLES.map((r, i) => [r, i]));

const TIERS = ['T1', 'T2', 'T3', 'T4'];
const TIER_LABEL = { T1: 'Major', T2: 'Regional', T3: 'Metropolitan', T4: 'Adjacent' };
const EMAIL_CONFIDENCE = ['unknown', 'inferred', 'verified'];

// Days between touches by tier — the cadence engine schedules from this.
const CADENCE_DAYS = { T1: 90, T2: 60, T3: 75, T4: 120 };

const TOUCH_TYPES = [
  'Introduction', 'Artifact drop', 'Program idea', 'Relevance / timeliness',
  'Soft availability', 'Personal reply', 'Post-concert thank-you',
  'Re-engagement', 'Other',
];

// Ordered value-first sequence for cold → warming contacts.
const TOUCH_SEQUENCE = ['Introduction', 'Artifact drop', 'Program idea', 'Relevance / timeliness', 'Soft availability'];

// Which template each touch type maps to.
const TEMPLATE_FOR_TOUCH = {
  Introduction: 'intro', 'Artifact drop': 'artifact', 'Program idea': 'program',
  'Relevance / timeliness': 'timeliness', 'Soft availability': 'availability',
  'Personal reply': 'reply', 'Post-concert thank-you': 'thankyou', 'Re-engagement': 'reengage',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr + 'T12:00') : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
// The next touch type to suggest, given where the contact is in the funnel.
function suggestNextTouch(contact) {
  switch (contact.stage) {
    case 'In Conversation': return 'Personal reply';
    case 'Performed': return 'Post-concert thank-you';
    case 'Re-engagement': return 'Re-engagement';
    case 'On Radar': return 'Program idea';
    default: {
      const n = contact.touchHistory?.filter(t => TOUCH_SEQUENCE.includes(t.type)).length || 0;
      return TOUCH_SEQUENCE[Math.min(n, TOUCH_SEQUENCE.length - 1)];
    }
  }
}
// A contact is "due" if it has a due date on/before today, or is an unworked
// prospect that has never been touched.
function isDue(contact) {
  if (contact.doNotContact || contact.stage === 'Closed' || contact.stage === 'Do Not Contact') return false;
  const t = todayStr();
  if (contact.nextTouchDue) return contact.nextTouchDue <= t;
  return (contact.touchHistory?.length || 0) === 0;
}
// Fill a template's placeholders from contact + orchestra data.
function mergeTemplate(text, contact, orchestra) {
  return (text || '')
    .replaceAll('[Name]', contact.name || '[Name]')
    .replaceAll('[Orchestra]', orchestra?.name || '[Orchestra]')
    .replaceAll('[City]', orchestra?.city || '[City]')
    .replaceAll('[State]', orchestra?.state || '[State]');
}

// Message library — value-first, no direct ask. Ships with [bracketed]
// placeholders; Grant's real signature lives in the private saved copy.
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

A short note — [new American Muse episode / the published Schwarz article / a recording] just went out, and it made me think of [Orchestra] because [specific reason tied to your audience or recent programming].

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

One concrete idea, offered freely: pair [American work] with [core repertoire anchor] — [one sentence on why the pairing works for your audience and sells the American work rather than apologizing for it].

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

[One genuine question about your season, or an offer to share the fuller program concept / one-sheet — still no hard ask.]

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
· DMA, College-Conservatory of Music (Meier and Thakar)
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
  orchestraId, name: '', title: '', roleCategory: 'Artistic Administrator',
  email: '', emailConfidence: 'unknown', phone: '', linkedin: '',
  decisionWeight: 3, doNotContact: false, stage: 'Prospect', cadenceTrack: '',
  nextTouchDue: '', lastContact: '', personalNotes: '', touchHistory: [],
  reviewed: true, source: 'manual',
});

const EMPTY_ORCHESTRA = () => ({
  name: '', city: '', state: '', tier: 'T2', website: '',
  guestModel: 'unknown', fitScore: '', repProfile: '', status: 'active',
});

const TABS = ['Pipeline', 'Due', 'Orchestras', 'Review', 'Templates', 'Analytics', 'Playbook'];

function Field({ label, children }) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>;
}
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const pill = (color, bg) => ({ fontSize: '11px', color, background: bg || `${color}18`, padding: '2px 8px', borderRadius: '4px' });
const btn = (color) => ({ background: `${color}22`, border: `1px solid ${color}55`, borderRadius: '6px', color, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '6px 12px' });

// ---------------------------------------------------------------- Contact card
function ContactCard({ contact, orchestraName, cadenceDays, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const color = STAGE_COLORS[contact.stage] || '#555';
  const touches = contact.touchHistory?.length || 0;
  const [touchType, setTouchType] = useState(suggestNextTouch(contact));
  const [touchNotes, setTouchNotes] = useState('');

  function logTouch() {
    const today = todayStr();
    const entry = { date: today, type: touchType, notes: touchNotes.trim(), response: '' };
    onChange({
      ...contact,
      touchHistory: [...(contact.touchHistory || []), entry],
      lastContact: today,
      nextTouchDue: addDays(today, cadenceDays),
      stage: contact.stage === 'Prospect' ? 'Contacted' : contact.stage,
    });
    setTouchNotes('');
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', marginBottom: '6px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1fr 130px 70px auto', gap: '10px', padding: '10px 14px', cursor: 'pointer', alignItems: 'center' }}>
        <div style={{ fontWeight: 500, fontSize: '13px' }}>
          {contact.name || <span style={{ color: '#444' }}>Unnamed</span>}
          {contact.doNotContact && <span style={{ color: '#7a3a3a', fontSize: '10px', marginLeft: 6 }}>⛔</span>}
        </div>
        <div style={{ fontSize: '11px', color: '#888' }}>{contact.title || contact.roleCategory}</div>
        <div style={{ fontSize: '11px', color: '#666' }}>{orchestraName}</div>
        <div><span style={pill(color)}>{contact.stage}</span></div>
        <div style={{ fontSize: '11px', color: '#666' }}>{touches} touch{touches !== 1 ? 'es' : ''}</div>
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>✕</button>
      </div>

      {open && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <Field label="Name"><input value={contact.name} onChange={e => onChange({ ...contact, name: e.target.value })} style={inputStyle} /></Field>
            <Field label="Title"><input value={contact.title} onChange={e => onChange({ ...contact, title: e.target.value })} style={inputStyle} /></Field>
            <Field label="Role"><select value={contact.roleCategory} onChange={e => onChange({ ...contact, roleCategory: e.target.value })} style={selectStyle}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Email"><input value={contact.email} onChange={e => onChange({ ...contact, email: e.target.value })} style={inputStyle} /></Field>
            <Field label="Email confidence"><select value={contact.emailConfidence} onChange={e => onChange({ ...contact, emailConfidence: e.target.value })} style={selectStyle}>{EMAIL_CONFIDENCE.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Phone"><input value={contact.phone} onChange={e => onChange({ ...contact, phone: e.target.value })} style={inputStyle} /></Field>
            <Field label="Stage"><select value={contact.stage} onChange={e => onChange({ ...contact, stage: e.target.value })} style={selectStyle}>{STAGES.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Decision weight (1–5)"><input type="number" min="1" max="5" value={contact.decisionWeight} onChange={e => onChange({ ...contact, decisionWeight: e.target.value })} style={inputStyle} /></Field>
            <Field label="Next touch due"><input type="date" value={contact.nextTouchDue} onChange={e => onChange({ ...contact, nextTouchDue: e.target.value })} style={inputStyle} /></Field>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <Field label="Private notes"><textarea value={contact.personalNotes} onChange={e => onChange({ ...contact, personalNotes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#888', marginBottom: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={contact.doNotContact} onChange={e => onChange({ ...contact, doNotContact: e.target.checked, stage: e.target.checked ? 'Do Not Contact' : contact.stage })} />
            Do not contact (hard stop — honor any opt-out immediately)
          </label>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Touch history {contact.lastContact ? `· last ${contact.lastContact}` : ''}{contact.nextTouchDue ? ` · next ${contact.nextTouchDue}` : ''}
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
            <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr auto', gap: '8px', alignItems: 'center' }}>
              <select value={touchType} onChange={e => setTouchType(e.target.value)} style={selectStyle}>{TOUCH_TYPES.map(t => <option key={t}>{t}</option>)}</select>
              <input value={touchNotes} onChange={e => setTouchNotes(e.target.value)} placeholder="What went out / what came back…" style={inputStyle} />
              <button onClick={logTouch} style={btn(GOLD)}>Log touch</button>
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
  const cadenceDays = CADENCE_DAYS[orchestra.tier] || 60;

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 90px auto', gap: '10px', padding: '12px 14px', cursor: 'pointer', alignItems: 'center' }}>
        <div style={{ fontWeight: 500, fontSize: '14px' }}>{orchestra.name || 'Untitled'}</div>
        <div style={{ fontSize: '12px', color: '#777' }}>{orchestra.city}{orchestra.state ? `, ${orchestra.state}` : ''}</div>
        <div><span style={pill(tierColor)}>{TIER_LABEL[orchestra.tier] || orchestra.tier}</span></div>
        <div style={{ fontSize: '11px', color: '#666' }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</div>
        <button onClick={e => { e.stopPropagation(); onDeleteOrch(); }} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>✕</button>
      </div>

      {open && (
        <div style={{ padding: '4px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', margin: '12px 0' }}>
            <Field label="Name"><input value={orchestra.name} onChange={e => onChangeOrch({ ...orchestra, name: e.target.value })} style={inputStyle} /></Field>
            <Field label="City"><input value={orchestra.city} onChange={e => onChangeOrch({ ...orchestra, city: e.target.value })} style={inputStyle} /></Field>
            <Field label="State"><input value={orchestra.state} onChange={e => onChangeOrch({ ...orchestra, state: e.target.value })} style={inputStyle} /></Field>
            <Field label="Tier"><select value={orchestra.tier} onChange={e => onChangeOrch({ ...orchestra, tier: e.target.value })} style={selectStyle}>{TIERS.map(t => <option key={t} value={t}>{t} — {TIER_LABEL[t]}</option>)}</select></Field>
            <Field label="Guest-conductor model"><select value={orchestra.guestModel} onChange={e => onChangeOrch({ ...orchestra, guestModel: e.target.value })} style={selectStyle}>{['unknown', 'rotating', 'MD-only'].map(g => <option key={g}>{g}</option>)}</select></Field>
            <Field label="Fit score (0–100)"><input type="number" min="0" max="100" value={orchestra.fitScore} onChange={e => onChangeOrch({ ...orchestra, fitScore: e.target.value })} style={inputStyle} /></Field>
            <Field label="Website"><input value={orchestra.website} onChange={e => onChangeOrch({ ...orchestra, website: e.target.value })} style={inputStyle} /></Field>
            <Field label="Status"><select value={orchestra.status} onChange={e => onChangeOrch({ ...orchestra, status: e.target.value })} style={selectStyle}>{['active', 'paused', 'do-not-contact'].map(s => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <Field label="Repertoire / fit notes (does American rep? MD transition? guest appetite?)"><textarea value={orchestra.repProfile} onChange={e => onChangeOrch({ ...orchestra, repProfile: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
          </div>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Contacts</div>
          {contacts.map(c => (
            <ContactCard key={c.id} contact={c} orchestraName={orchestra.name} cadenceDays={cadenceDays} onChange={onChangeContact} onDelete={() => onDeleteContact(c.id)} />
          ))}
          {orchestra.website && <a href={orchestra.website} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#4a7abf', marginRight: '14px' }}>Open site ↗</a>}
          <button onClick={() => onAddContact(orchestra.id)} style={{ ...btn('#4a7abf'), marginTop: '6px' }}>+ Add contact</button>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- Due row
function DueRow({ contact, orchestra, template, cadenceDays, onChange }) {
  const suggested = suggestNextTouch(contact);
  const merged = template
    ? `Subject: ${mergeTemplate(template.subject, contact, orchestra)}\n\n${mergeTemplate(template.body, contact, orchestra)}`
    : '(no template for this touch)';
  const [copied, setCopied] = useState(false);
  const [aiId, setAiId] = useState(null);
  const [aiDraft, setAiDraft] = useState(null);
  const [aiErr, setAiErr] = useState(null);

  useEffect(() => {
    if (!aiId || !db) return;
    const ref = doc(db, 'aiRequests', aiId);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return;
      const r = snap.data();
      if (r.status === 'done') { setAiDraft(r.response || ''); setAiId(null); updateDoc(ref, { consumed: true }).catch(() => {}); }
      else if (r.status === 'error') { setAiErr(r.error || 'error'); setAiId(null); }
    });
    return unsub;
  }, [aiId]);

  async function queueAiDraft() {
    if (!db) { setAiErr('Firebase not configured.'); return; }
    setAiErr(null); setAiDraft(null);
    const prompt = `Draft a short, value-first outreach email — no direct ask — from Grant Gilman to a decision-maker at a professional orchestra.

Recipient: ${contact.name || '[unknown]'}, ${contact.title || contact.roleCategory}, ${orchestra?.name || ''} (${orchestra?.city || ''}, ${orchestra?.state || ''}).
Touch type: ${suggested}.
Orchestra notes: ${orchestra?.repProfile || '(none)'}.
Starting template to adapt (keep its voice and the no-ask posture):
${template ? template.body : '(none)'}

Personalize the [bracketed] spots using the orchestra's actual profile where you can; leave a bracket only where you genuinely lack the fact. Keep it tight and specific — no vague affirmation.`;
    try {
      const ref = await addDoc(collection(db, 'aiRequests'), {
        module: 'podium', messages: [{ role: 'user', content: prompt }],
        status: 'pending', consumed: false, createdAt: Date.now(),
      });
      setAiId(ref.id);
    } catch { setAiErr('Could not queue the draft.'); }
  }

  function logSent() {
    const today = todayStr();
    onChange({
      ...contact,
      touchHistory: [...(contact.touchHistory || []), { date: today, type: suggested, notes: 'sent', response: '' }],
      lastContact: today, nextTouchDue: addDays(today, cadenceDays),
      stage: contact.stage === 'Prospect' ? 'Contacted' : contact.stage,
    });
  }
  function snooze(days) { onChange({ ...contact, nextTouchDue: addDays(todayStr(), days) }); }

  const [queued, setQueued] = useState(false);
  async function queueSend() {
    if (!db || !contact.email) return;
    const text = aiDraft ?? mergeTemplate(template?.body, contact, orchestra);
    const subject = mergeTemplate(template?.subject, contact, orchestra);
    try {
      await addDoc(collection(db, 'outreach'), {
        contactId: contact.id, orchestraId: contact.orchestraId,
        to: contact.email, subject, body: text, touchType: suggested,
        doNotContact: !!contact.doNotContact, status: 'queued', createdAt: Date.now(),
      });
      setQueued(true);
    } catch { /* ignore */ }
  }

  const overdue = contact.nextTouchDue && contact.nextTouchDue < todayStr();

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${overdue ? 'rgba(191,122,74,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: '8px', marginBottom: '8px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{contact.name || 'Unnamed'}</span>
          <span style={{ fontSize: '12px', color: '#888', marginLeft: 8 }}>{contact.title || contact.roleCategory} · {orchestra?.name}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={pill(GOLD)}>{suggested}</span>
          <span style={{ fontSize: '11px', color: overdue ? '#bf7a4a' : '#666' }}>{contact.nextTouchDue ? (overdue ? `overdue ${contact.nextTouchDue}` : `due ${contact.nextTouchDue}`) : 'never touched'}</span>
        </div>
      </div>
      <textarea readOnly value={aiDraft ?? merged} rows={aiDraft ? 12 : 7} style={{ ...inputStyle, lineHeight: 1.6, color: '#bbb', resize: 'vertical', marginBottom: '8px' }} />
      {aiErr && <div style={{ fontSize: '11px', color: '#bf7a4a', marginBottom: '8px' }}>AI draft: {aiErr}</div>}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button onClick={() => { navigator.clipboard.writeText(aiDraft ?? merged); setCopied(true); setTimeout(() => setCopied(false), 1600); }} style={btn('#888')}>{copied ? 'Copied!' : 'Copy draft'}</button>
        <button onClick={queueAiDraft} disabled={!!aiId} style={{ ...btn('#8a5abf'), opacity: aiId ? 0.6 : 1 }}>{aiId ? 'Drafting…' : 'Personalize with AI'}</button>
        <button onClick={logSent} style={btn(GOLD)}>Mark sent &amp; reschedule</button>
        {contact.email && (
          <button onClick={queueSend} disabled={queued} title="Queue for the iCloud sender Action (dry-run until you run it live)" style={{ ...btn('#4abf9a'), opacity: queued ? 0.6 : 1 }}>{queued ? 'Queued ✓' : 'Queue to send'}</button>
        )}
        <button onClick={() => snooze(14)} style={btn('#666')}>Snooze 2w</button>
        <button onClick={() => snooze(60)} style={btn('#666')}>Snooze 2mo</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Analytics
function Analytics({ orchestras, contacts }) {
  const stageCounts = Object.fromEntries(STAGES.map(s => [s, contacts.filter(c => c.stage === s).length]));
  const totalTouches = contacts.reduce((s, c) => s + (c.touchHistory?.length || 0), 0);
  const responses = contacts.reduce((s, c) => s + (c.touchHistory?.filter(t => t.response)?.length || 0), 0);
  const contacted = contacts.filter(c => (c.touchHistory?.length || 0) > 0).length;
  const engaged = contacts.filter(c => ['Engaged', 'In Conversation', 'Meeting', 'On Radar', 'Invited', 'Contracted', 'Performed', 'Re-engagement'].includes(c.stage)).length;
  const withContacts = new Set(contacts.map(c => c.orchestraId)).size;
  const respRate = contacted ? Math.round((engaged / contacted) * 100) : 0;

  const stat = (label, value, color) => (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '16px' }}>
      <div style={{ fontSize: '26px', fontWeight: 300, color: color || '#e8e8e8' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#777', marginTop: 4 }}>{label}</div>
    </div>
  );

  const maxStage = Math.max(1, ...STAGES.map(s => stageCounts[s]));

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {stat('Orchestras', orchestras.length)}
        {stat('Orchestras worked', withContacts, GOLD)}
        {stat('Contacts', contacts.length)}
        {stat('Contacted', contacted, '#4a7abf')}
        {stat('Warm (Engaged+)', engaged, '#4abf9a')}
        {stat('Touches logged', totalTouches)}
        {stat('Responses', responses, '#6abf4a')}
        {stat('Engaged rate', `${respRate}%`, GOLD)}
      </div>
      <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Funnel</div>
      {STAGES.map(s => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
          <div style={{ width: '120px', fontSize: '12px', color: '#999', textAlign: 'right' }}>{s}</div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '4px', height: '18px' }}>
            <div style={{ width: `${(stageCounts[s] / maxStage) * 100}%`, background: STAGE_COLORS[s], height: '100%', borderRadius: '4px', minWidth: stageCounts[s] ? '2px' : 0 }} />
          </div>
          <div style={{ width: '30px', fontSize: '12px', color: '#777' }}>{stageCounts[s]}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- Playbook
function Playbook() {
  const Sn = ({ title, children }) => (
    <div style={{ marginBottom: '22px' }}>
      <div style={{ fontSize: '13px', color: GOLD, marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
  return (
    <div style={{ maxWidth: '760px' }}>
      <Sn title="The frame">Brand-nurture, not a sales sequence. Every touch <em>gives</em> something and asks for nothing. The goal is recognition — be the name an artistic administrator already knows when an American-repertoire guest comes up.</Sn>
      <Sn title="Cadence by tier">
        <strong>T1 Majors</strong> — ~every 90 days, pure value, multi-year horizon.<br />
        <strong>T2 Regional (primary)</strong> — ~every 60 days: intro → artifact → program idea → soft availability.<br />
        <strong>T3 Metropolitan</strong> — ~every 75 days, warmer sooner.<br />
        <strong>T4 Adjacent</strong> — ~every 120 days, repertoire-triggered.<br />
        The <strong>Due</strong> tab schedules the next touch automatically each time you mark one sent.
      </Sn>
      <Sn title="Cadence rules">· Min 3–4 weeks between touches to one contact. · Never two touches to the same orchestra in one week. · Never send the same template twice — always advance. · Any reply pauses cadence and moves them into the funnel. · Heaviest outreach in the programming-decision window (~Jan–Apr); quiet during a run.</Sn>
      <Sn title="The funnel">
        <strong>No response</strong> → stay on cadence; downgrade after ~5 unanswered.<br />
        <strong>Positive reply → In Conversation</strong> → personal reply in 24–48h, still no hard ask.<br />
        <strong>Warm signal → Meeting</strong> → offer a 15-min call, then park at On Radar.<br />
        <strong>On Radar</strong> → the warm bench; 2–3 personal touches/year.<br />
        <strong>Invited → Contracted → Performed</strong> → it inverts; build the relationship with players and the personnel manager.<br />
        <strong>Re-engagement</strong> → thank-you within a week (no ask); ~30 days later share any press/subscription signal (the thesis, proven); at next-season planning, "let's do it again." A completed engagement seeds new prospects via referral.
      </Sn>
      <Sn title="Automation">The scraper Action (cron) refreshes orchestra staff/board contacts into the <strong>Review</strong> queue with a source and confidence — approve before they enter cadence. The sender Action can send approved touches from conductor@grantgilman.com via iCloud SMTP, metered and dry-run by default. Nothing sends in bulk; you stay in the loop.</Sn>
      <Sn title="Guardrails">Confirm SPF/DKIM/DMARC and warm the domain before volume. Scraped contacts are suggestions, never truth. Honor any opt-out instantly. Every person, email, and note lives only in Firestore — never in committed source.</Sn>
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
  // Review-tab triage
  const [reviewRole, setReviewRole] = useState('All');
  const [reviewConf, setReviewConf] = useState('All');
  const [reviewSearch, setReviewSearch] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    Promise.all([loadCollection(ORCH), loadCollection(CONTACTS)]).then(([o, c]) => { setOrchestras(o); setContacts(c); });
    loadKey(TEMPLATES_KEY, { templates: DEFAULT_TEMPLATES }).then(d => setTemplates(d.templates && Object.keys(d.templates).length ? d.templates : DEFAULT_TEMPLATES));
  }, []);

  const saveOrch = useCallback(async o => {
    const saved = await saveRecord(ORCH, o);
    setOrchestras(prev => { const i = prev.findIndex(x => x.id === saved.id); if (i >= 0) { const n = [...prev]; n[i] = saved; return n; } return [...prev, saved]; });
    return saved;
  }, []);
  const saveContact = useCallback(async c => {
    const saved = await saveRecord(CONTACTS, c);
    setContacts(prev => { const i = prev.findIndex(x => x.id === saved.id); if (i >= 0) { const n = [...prev]; n[i] = saved; return n; } return [...prev, saved]; });
  }, []);
  const removeOrch = useCallback(async id => {
    await deleteRecord(ORCH, id);
    for (const k of contacts.filter(c => c.orchestraId === id)) await deleteRecord(CONTACTS, k.id);
    setOrchestras(prev => prev.filter(x => x.id !== id));
    setContacts(prev => prev.filter(c => c.orchestraId !== id));
  }, [contacts]);
  const removeContact = useCallback(async id => { await deleteRecord(CONTACTS, id); setContacts(prev => prev.filter(x => x.id !== id)); }, []);

  // Bulk triage for the Review queue — operate on a set of ids, update state once.
  const approveMany = useCallback(async ids => {
    if (!ids.length) return;
    setBulkBusy(true);
    const idset = new Set(ids);
    for (const c of contacts.filter(x => idset.has(x.id))) await saveRecord(CONTACTS, { ...c, reviewed: true });
    setContacts(prev => prev.map(c => (idset.has(c.id) ? { ...c, reviewed: true } : c)));
    setBulkBusy(false);
  }, [contacts]);
  const discardMany = useCallback(async ids => {
    if (!ids.length) return;
    setBulkBusy(true);
    const idset = new Set(ids);
    for (const id of ids) await deleteRecord(CONTACTS, id);
    setContacts(prev => prev.filter(c => !idset.has(c.id)));
    setBulkBusy(false);
  }, []);

  async function seedOrchestras() {
    setSeeding(true);
    const existing = new Set(orchestras.map(o => `${o.name}|${o.city}`));
    const added = [];
    for (const s of ORCHESTRA_SEED) {
      if (existing.has(`${s.name}|${s.city}`)) continue;
      added.push(await saveRecord(ORCH, { ...EMPTY_ORCHESTRA(), ...s }));
    }
    setOrchestras(prev => [...prev, ...added]);
    setSeeding(false);
  }
  function saveTemplates(next) { setTemplates(next); saveKey(TEMPLATES_KEY, { templates: next }); }

  if (!orchestras || !templates) return <div style={{ padding: '40px', color: '#666' }}>Loading…</div>;

  const orchById = Object.fromEntries(orchestras.map(o => [o.id, o]));
  const stageCounts = Object.fromEntries(STAGES.map(s => [s, contacts.filter(c => c.stage === s).length]));
  const q = search.trim().toLowerCase();

  const filteredContacts = contacts.filter(c => {
    if (filterStage !== 'All' && c.stage !== filterStage) return false;
    const o = orchById[c.orchestraId];
    if (filterTier !== 'All' && o?.tier !== filterTier) return false;
    if (q) { const hay = `${c.name} ${c.title} ${c.roleCategory} ${o?.name || ''}`.toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });

  const visibleOrchestras = orchestras
    .filter(o => filterTier === 'All' || o.tier === filterTier)
    .filter(o => !q || `${o.name} ${o.city} ${o.state}`.toLowerCase().includes(q))
    .sort((a, b) => (a.tier || '').localeCompare(b.tier || '') || (a.name || '').localeCompare(b.name || ''));

  const dueContacts = contacts.filter(isDue).sort((a, b) => (a.nextTouchDue || '') .localeCompare(b.nextTouchDue || ''));
  const reviewContacts = contacts.filter(c => c.reviewed === false);

  const rq = reviewSearch.trim().toLowerCase();
  const reviewFiltered = reviewContacts
    .filter(c => reviewRole === 'All' || c.roleCategory === reviewRole)
    .filter(c => reviewConf === 'All' || c.emailConfidence === reviewConf)
    .filter(c => {
      if (!rq) return true;
      const o = orchById[c.orchestraId];
      return `${c.name} ${c.title} ${c.roleCategory} ${o?.name || ''}`.toLowerCase().includes(rq);
    })
    // Decision-makers first, then by orchestra, so the ~4 that matter per org lead.
    .sort((a, b) => {
      const pa = ROLE_PRIORITY[a.roleCategory] ?? 99, pb = ROLE_PRIORITY[b.roleCategory] ?? 99;
      if (pa !== pb) return pa - pb;
      return (orchById[a.orchestraId]?.name || '').localeCompare(orchById[b.orchestraId]?.name || '');
    });
  const reviewBoardCount = reviewContacts.filter(c => c.roleCategory === 'Board Member').length;

  const tmpl = templates[selectedTemplate];
  const fullTemplate = `Subject: ${tmpl.subject}\n\n${tmpl.body}`;
  const headline = [
    { label: 'Due', v: dueContacts.length, c: '#bf7a4a' },
    { label: 'On Radar', v: stageCounts['On Radar'] || 0, c: GOLD },
    { label: 'Invited', v: stageCounts['Invited'] || 0, c: '#bf9a4a' },
  ];

  return (
    <div>
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

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 28px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'transparent', border: 'none', borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === t ? '#e8e8e8' : '#555', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', padding: '12px 16px 10px' }}>
            {t}{t === 'Due' && dueContacts.length ? ` (${dueContacts.length})` : ''}{t === 'Review' && reviewContacts.length ? ` (${reviewContacts.length})` : ''}
          </button>
        ))}
      </div>

      <div style={{ padding: '22px 28px', maxWidth: '980px' }}>
        {(tab === 'Pipeline' || tab === 'Orchestras') && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inputStyle, width: '180px' }} />
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
              <option value="All">All tiers</option>{TIERS.map(t => <option key={t} value={t}>{t} — {TIER_LABEL[t]}</option>)}
            </select>
            {tab === 'Pipeline' && (
              <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
                <option value="All">All stages</option>{STAGES.map(s => <option key={s}>{s} ({stageCounts[s] || 0})</option>)}
              </select>
            )}
          </div>
        )}

        {tab === 'Pipeline' && (
          filteredContacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '10px' }}>
              <div style={{ fontSize: '26px', marginBottom: '10px' }}>♪</div>
              <div style={{ fontSize: '13px' }}>No contacts yet. Add orchestras, then add the people who decide on guests.</div>
              <button onClick={() => setTab('Orchestras')} style={{ marginTop: '12px', ...btn('#666') }}>Go to Orchestras</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.2fr 1fr 130px 70px auto', gap: '10px', padding: '4px 14px', marginBottom: '4px' }}>
                {['Name', 'Title', 'Orchestra', 'Stage', 'Touches', ''].map((h, i) => <span key={i} style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
              </div>
              {filteredContacts.map(c => (
                <ContactCard key={c.id} contact={c} orchestraName={orchById[c.orchestraId]?.name || '—'} cadenceDays={CADENCE_DAYS[orchById[c.orchestraId]?.tier] || 60} onChange={saveContact} onDelete={() => removeContact(c.id)} />
              ))}
            </>
          )
        )}

        {tab === 'Due' && (
          dueContacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '10px' }}>
              <div style={{ fontSize: '13px' }}>Nothing due. Every contact is scheduled ahead — the queue fills as touch dates arrive.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: '#777', marginBottom: '14px' }}>{dueContacts.length} contact{dueContacts.length !== 1 ? 's' : ''} due for a touch. Each draft is pre-filled from the tier template — copy it, personalize with AI, or mark sent to auto-schedule the next one.</div>
              {dueContacts.map(c => {
                const o = orchById[c.orchestraId];
                const t = templates[TEMPLATE_FOR_TOUCH[suggestNextTouch(c)]];
                return <DueRow key={c.id} contact={c} orchestra={o} template={t} cadenceDays={CADENCE_DAYS[o?.tier] || 60} onChange={saveContact} />;
              })}
            </>
          )
        )}

        {tab === 'Orchestras' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => saveOrch(EMPTY_ORCHESTRA())} style={btn('#4a7abf')}>+ Add orchestra</button>
              <button onClick={seedOrchestras} disabled={seeding} style={{ ...btn(GOLD), opacity: seeding ? 0.6 : 1 }}>{seeding ? 'Loading…' : 'Load seed list (T1+T2)'}</button>
              <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#555', alignSelf: 'center' }}>{orchestras.length} orchestras</div>
            </div>
            {visibleOrchestras.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '10px' }}><div style={{ fontSize: '13px' }}>No orchestras yet. Load the seed list to start with the majors and regionals.</div></div>
            ) : (
              visibleOrchestras.map(o => (
                <OrchestraBlock key={o.id} orchestra={o} contacts={contacts.filter(c => c.orchestraId === o.id)} onChangeOrch={saveOrch} onDeleteOrch={() => removeOrch(o.id)} onAddContact={oid => saveContact(EMPTY_CONTACT(oid))} onChangeContact={saveContact} onDeleteContact={removeContact} />
              ))
            )}
          </div>
        )}

        {tab === 'Review' && (
          reviewContacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#444', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '10px' }}><div style={{ fontSize: '13px' }}>Nothing to review. The scraper Action drops new or changed contacts here for approval before they enter cadence.</div></div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: '#777', marginBottom: '12px', lineHeight: 1.6 }}>
                {reviewContacts.length} awaiting review — decision-makers are sorted to the top. Approve the ED / MD / artistic staff / personnel manager per orchestra; most general board members can be discarded. Spot-check any <span style={pill('#bf9a4a')}>inferred</span> email before it's ever sent.
              </div>

              {/* filters */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={reviewSearch} onChange={e => setReviewSearch(e.target.value)} placeholder="Search name / orchestra…" style={{ ...inputStyle, width: '200px' }} />
                <select value={reviewRole} onChange={e => setReviewRole(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
                  <option value="All">All roles</option>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
                <select value={reviewConf} onChange={e => setReviewConf(e.target.value)} style={{ ...selectStyle, width: 'auto' }}>
                  <option value="All">Any email</option>
                  {EMAIL_CONFIDENCE.map(c => <option key={c} value={c}>{c} email</option>)}
                </select>
                <span style={{ fontSize: '11px', color: '#555', marginLeft: 'auto' }}>{reviewFiltered.length} shown</span>
              </div>

              {/* bulk actions */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  disabled={bulkBusy || !reviewFiltered.length}
                  onClick={() => { if (confirm(`Approve all ${reviewFiltered.length} shown contact(s)?`)) approveMany(reviewFiltered.map(c => c.id)); }}
                  style={{ ...btn('#6abf4a'), opacity: bulkBusy || !reviewFiltered.length ? 0.5 : 1 }}
                >Approve all shown ({reviewFiltered.length})</button>
                <button
                  disabled={bulkBusy || !reviewFiltered.length}
                  onClick={() => { if (confirm(`Discard all ${reviewFiltered.length} shown contact(s)? This deletes them.`)) discardMany(reviewFiltered.map(c => c.id)); }}
                  style={{ ...btn('#7a3a3a'), opacity: bulkBusy || !reviewFiltered.length ? 0.5 : 1 }}
                >Discard all shown</button>
                {reviewBoardCount > 0 && (
                  <button
                    disabled={bulkBusy}
                    onClick={() => { if (confirm(`Discard all ${reviewBoardCount} board member(s) across every orchestra? Keeps EDs, MDs, artistic staff, and personnel managers.`)) discardMany(reviewContacts.filter(c => c.roleCategory === 'Board Member').map(c => c.id)); }}
                    style={{ ...btn('#8a5a3a'), opacity: bulkBusy ? 0.5 : 1 }}
                  >Discard all board members ({reviewBoardCount})</button>
                )}
                {bulkBusy && <span style={{ fontSize: '11px', color: GOLD }}>Working…</span>}
              </div>

              {reviewFiltered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#444', fontSize: '13px' }}>No contacts match these filters.</div>
              ) : reviewFiltered.map(c => {
                const o = orchById[c.orchestraId];
                const isDecision = DECISION_ROLES.includes(c.roleCategory);
                return (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isDecision ? 'rgba(106,191,74,0.3)' : 'rgba(138,90,191,0.22)'}`, borderRadius: '8px', marginBottom: '8px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>
                          {c.name || 'Unnamed'}
                          <span style={{ fontSize: '12px', color: '#888', fontWeight: 400 }}> · {c.title || c.roleCategory} · {o?.name}</span>
                          {isDecision && <span style={{ ...pill('#6abf4a'), marginLeft: 8 }}>decision-maker</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>{c.email || '(no email)'} <span style={pill(c.emailConfidence === 'verified' ? '#6abf4a' : c.emailConfidence === 'inferred' ? '#bf9a4a' : '#666')}>{c.emailConfidence}</span></div>
                        {c.source && <div style={{ fontSize: '11px', color: '#666', marginTop: 4 }}>source: {c.source}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button disabled={bulkBusy} onClick={() => saveContact({ ...c, reviewed: true })} style={btn('#6abf4a')}>Approve</button>
                        <button disabled={bulkBusy} onClick={() => removeContact(c.id)} style={btn('#7a3a3a')}>Discard</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )
        )}

        {tab === 'Templates' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {Object.entries(templates).map(([key, t]) => (
                <button key={key} onClick={() => setSelectedTemplate(key)} style={{ background: selectedTemplate === key ? 'rgba(200,168,74,0.15)' : 'transparent', border: `1px solid ${selectedTemplate === key ? 'rgba(200,168,74,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '5px', color: selectedTemplate === key ? GOLD : '#666', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', padding: '5px 12px' }}>{t.label}</button>
              ))}
            </div>
            <div style={{ marginBottom: '10px', fontSize: '12px', color: '#555', lineHeight: 1.6 }}>Value-first, no direct ask — that's the whole strategy. Templates are editable and saved privately; fill in your real signature once and it sticks. Replace [bracketed placeholders] and personalize every send.</div>
            <div style={{ marginBottom: '10px' }}>
              <Field label="Subject"><input value={tmpl.subject} onChange={e => saveTemplates({ ...templates, [selectedTemplate]: { ...tmpl, subject: e.target.value } })} style={inputStyle} /></Field>
            </div>
            <div style={{ position: 'relative' }}>
              <textarea value={tmpl.body} onChange={e => saveTemplates({ ...templates, [selectedTemplate]: { ...tmpl, body: e.target.value } })} rows={18} style={{ ...inputStyle, lineHeight: 1.75, color: '#bbb', resize: 'vertical' }} />
              <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
                <button onClick={() => saveTemplates({ ...templates, [selectedTemplate]: DEFAULT_TEMPLATES[selectedTemplate] || tmpl })} title="Restore default text" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', color: '#666', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '4px 10px' }}>Reset</button>
                <button onClick={() => { navigator.clipboard.writeText(fullTemplate); setCopied(true); setTimeout(() => setCopied(false), 1800); }} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '5px', color: copied ? '#6abf4a' : '#888', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '4px 10px' }}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'Analytics' && <Analytics orchestras={orchestras} contacts={contacts} />}
        {tab === 'Playbook' && <Playbook />}
      </div>
    </div>
  );
}
