import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, addDoc, doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { loadKey, saveKey } from '../storage';
import { inputStyle, GOLD } from '../theme';

const STORAGE_KEY = 'schwarz_workbench_v1';

const DEFAULT_DATA = {
  thesis: '',
  sections: [
    { id: '1', title: 'I. Introduction & Argument', content: '' },
    { id: '2', title: 'II. Seattle Years: Delos Era (1983–2000)', content: '' },
    { id: '3', title: 'III. Seattle Years: Naxos American Music Series', content: '' },
    { id: '4', title: 'IV. Eastern Music Festival & Chamber Work', content: '' },
    { id: '5', title: 'V. Miami Period: Frost & Palm Beach (2019–)', content: '' },
    { id: '6', title: 'VI. Legacy & Reframe', content: '' },
  ],
  notes: [],
  outlet: 'American Record Guide',
  wordTarget: 2500,
  messages: [],
  pendingRequestId: null,
};

function wordCount(text) {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function totalWords(data) {
  return (
    wordCount(data.thesis) +
    data.sections.reduce((s, sec) => s + wordCount(sec.content), 0)
  );
}

const TABS = ['Thesis', 'Draft', 'Notes', 'AI Reader'];

export default function SchwarzWorkbench() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Thesis');
  const [activeSection, setActiveSection] = useState('1');
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState(null);
  const chatRef = useRef(null);

  useEffect(() => {
    loadKey(STORAGE_KEY, DEFAULT_DATA).then(setData);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [data?.messages, tab]);

  // Persist through a functional update so async listeners never clobber
  // state captured in a stale closure.
  const persist = useCallback(updater => {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKey(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Watch the pending AI request; the GitHub Action flips it to done/error.
  const pendingId = data?.pendingRequestId;
  useEffect(() => {
    if (!pendingId || !db) return;
    const ref = doc(db, 'aiRequests', pendingId);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) {
        persist(prev => ({ ...prev, pendingRequestId: null }));
        return;
      }
      const req = snap.data();
      if (req.status === 'done' || req.status === 'error') {
        const content = req.status === 'done'
          ? (req.response || 'Empty response.')
          : `The AI reader hit an error: ${req.error || 'unknown'}. Try again.`;
        persist(prev => ({
          ...prev,
          messages: [...prev.messages, { role: 'assistant', content }],
          pendingRequestId: null,
        }));
        updateDoc(ref, { consumed: true }).catch(() => {});
      }
    }, err => {
      console.error('AI request listener error', err);
    });
    return unsub;
  }, [pendingId, persist]);

  if (!data) return <div style={{ padding: '40px', color: '#666' }}>Loading workbench…</div>;

  const wc = totalWords(data);
  const pct = Math.min(100, Math.round((wc / data.wordTarget) * 100));

  function updateThesis(val) { persist(prev => ({ ...prev, thesis: val })); }
  function updateSection(id, content) {
    persist(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, content } : s),
    }));
  }
  function addNote(text) {
    if (!text.trim()) return;
    persist(prev => ({
      ...prev,
      notes: [{ id: crypto.randomUUID(), text, date: new Date().toLocaleDateString() }, ...prev.notes],
    }));
  }
  function deleteNote(id) {
    persist(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== id) }));
  }

  async function sendMessage() {
    if (!input.trim() || data.pendingRequestId) return;
    if (!db) { setSendError('Firebase is not configured.'); return; }
    setSendError(null);

    const userMsg = { role: 'user', content: input };
    const context =
      `[Current thesis: ${data.thesis || '(not yet written)'}]\n` +
      `[Draft word count: ${wc}/${data.wordTarget}]\n\n${input}`;
    const apiMessages = [
      ...data.messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: context },
    ];

    try {
      const ref = await addDoc(collection(db, 'aiRequests'), {
        module: 'schwarz',
        messages: apiMessages,
        status: 'pending',
        consumed: false,
        createdAt: Date.now(),
      });
      setInput('');
      persist(prev => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        pendingRequestId: ref.id,
      }));
    } catch (e) {
      console.error(e);
      setSendError('Could not queue the request — check your connection.');
    }
  }

  async function checkNow() {
    if (!data.pendingRequestId || !db) return;
    const snap = await getDoc(doc(db, 'aiRequests', data.pendingRequestId));
    if (!snap.exists()) persist(prev => ({ ...prev, pendingRequestId: null }));
  }

  const activeSecObj = data.sections.find(s => s.id === activeSection);
  const thinking = Boolean(data.pendingRequestId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{
        padding: '22px 28px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '24px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>
            Article Workbench · {data.outlet}
          </div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '400' }}>
            Gerard Schwarz: A Survey of His Recording Output
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', color: wc > 0 ? GOLD : '#555' }}>
            {wc.toLocaleString()} / {data.wordTarget.toLocaleString()} words
          </div>
          <div style={{
            width: '120px',
            height: '3px',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '2px',
            marginTop: '6px',
            overflow: 'hidden',
          }}>
            <div style={{ width: `${pct}%`, height: '100%', background: GOLD, borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 28px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'transparent',
            border: 'none',
            borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
            color: tab === t ? '#e8e8e8' : '#555',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '13px',
            padding: '12px 16px 10px',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, padding: '24px 28px', maxWidth: '860px' }}>

        {/* THESIS */}
        {tab === 'Thesis' && (
          <div>
            <p style={{ fontSize: '12px', color: '#555', marginTop: 0, lineHeight: '1.6' }}>
              The argument of the article in one paragraph. Not a summary — a thesis. What is the claim that makes this article worth publishing in ARG or Fanfare?
            </p>
            <textarea
              value={data.thesis}
              onChange={e => updateThesis(e.target.value)}
              placeholder="Schwarz built the most coherent case for American orchestral music before the field had a name for it — and the recordings prove it. Start here."
              rows={8}
              style={{ ...inputStyle, lineHeight: '1.7', fontSize: '14px', resize: 'vertical' }}
            />
            <div style={{ fontSize: '11px', color: '#444', marginTop: '8px' }}>{wordCount(data.thesis)} words</div>
            <div style={{
              marginTop: '20px',
              padding: '14px 16px',
              background: 'rgba(200,168,74,0.06)',
              border: '1px solid rgba(200,168,74,0.15)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#888',
              lineHeight: '1.7',
            }}>
              <strong style={{ color: GOLD }}>Note on ARG vs. Fanfare:</strong> ARG (Vroon) rewards polemical clarity — he wants to know what you think before the end of the first paragraph. Fanfare (Flegler) is more survey-oriented and tolerates longer setup. If you're writing for ARG, the thesis above needs to be the first sentence of the article, not the conclusion.
            </div>
          </div>
        )}

        {/* DRAFT */}
        {tab === 'Draft' && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ width: '200px', flexShrink: 0 }}>
              {data.sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: activeSection === s.id ? 'rgba(200,168,74,0.1)' : 'transparent',
                    border: 'none',
                    borderLeft: activeSection === s.id ? `2px solid ${GOLD}` : '2px solid transparent',
                    color: activeSection === s.id ? '#e8e8e8' : '#555',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    padding: '8px 10px',
                    textAlign: 'left',
                    lineHeight: '1.4',
                    marginBottom: '2px',
                  }}
                >
                  {s.title}
                  {wordCount(s.content) > 0 && (
                    <span style={{ display: 'block', fontSize: '10px', color: '#555', marginTop: '2px' }}>
                      {wordCount(s.content)} words
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              {activeSecObj && (
                <>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '10px', fontStyle: 'italic' }}>
                    {activeSecObj.title}
                  </div>
                  <textarea
                    value={activeSecObj.content}
                    onChange={e => updateSection(activeSecObj.id, e.target.value)}
                    placeholder="Write this section here…"
                    rows={18}
                    style={{ ...inputStyle, lineHeight: '1.75', resize: 'vertical' }}
                  />
                  <div style={{ fontSize: '11px', color: '#444', marginTop: '6px' }}>
                    {wordCount(activeSecObj.content)} words in this section
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* NOTES */}
        {tab === 'Notes' && (
          <div>
            <NoteInput onAdd={addNote} />
            <div style={{ marginTop: '16px' }}>
              {data.notes.length === 0 ? (
                <div style={{ color: '#444', fontSize: '13px', fontStyle: 'italic' }}>No research notes yet.</div>
              ) : (
                data.notes.map(n => (
                  <div key={n.id} style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: '7px',
                    padding: '12px 14px',
                    marginBottom: '8px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}>
                    <div style={{ flex: 1, fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>{n.text}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#444' }}>{n.date}</span>
                      <button onClick={() => deleteNote(n.id)} style={{
                        background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontSize: '11px', padding: '0', fontFamily: 'inherit',
                      }}>✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* AI READER */}
        {tab === 'AI Reader' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '560px' }}>
            <p style={{ fontSize: '12px', color: '#555', margin: '0 0 14px', lineHeight: '1.6' }}>
              Share your thesis, a draft section, or a question. Requests are processed by a
              GitHub Action (your API key never touches the browser), so replies land within
              about 15 minutes — or immediately if you run the <em>AI Reader</em> workflow from
              the repo's Actions tab. Come back any time; the conversation is saved.
            </p>
            <div
              ref={chatRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '12px',
              }}
            >
              {data.messages.length === 0 && (
                <div style={{ color: '#444', fontSize: '13px', fontStyle: 'italic' }}>
                  Paste your thesis or a section draft and ask for feedback. Or ask: "What's missing from the Naxos American Music Series framing?"
                </div>
              )}
              {data.messages.map((m, i) => (
                <div key={i} style={{
                  marginBottom: '14px',
                  textAlign: m.role === 'user' ? 'right' : 'left',
                }}>
                  <div style={{
                    display: 'inline-block',
                    maxWidth: '85%',
                    background: m.role === 'user' ? 'rgba(200,168,74,0.12)' : 'rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    lineHeight: '1.65',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
              {thinking && (
                <div style={{ color: '#555', fontSize: '12px', fontStyle: 'italic' }}>
                  Queued for the next AI Reader run…{' '}
                  <button onClick={checkNow} style={{
                    background: 'none', border: 'none', color: GOLD, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '12px', fontStyle: 'italic', padding: 0,
                    textDecoration: 'underline',
                  }}>refresh</button>
                </div>
              )}
              {sendError && (
                <div style={{ color: '#bf5a4a', fontSize: '12px' }}>{sendError}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Share a draft or ask a question… (Enter to send)"
                rows={3}
                style={{ ...inputStyle, resize: 'none', flex: 1 }}
              />
              <button onClick={sendMessage} disabled={thinking} style={{
                background: thinking ? 'rgba(255,255,255,0.05)' : 'rgba(200,168,74,0.15)',
                border: '1px solid rgba(200,168,74,0.3)',
                borderRadius: '7px',
                color: thinking ? '#555' : GOLD,
                cursor: thinking ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                padding: '0 18px',
                alignSelf: 'stretch',
              }}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteInput({ onAdd }) {
  const [text, setText] = useState('');
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Research note, discography detail, framing idea…"
        rows={3}
        style={{ ...inputStyle, flex: 1, resize: 'vertical' }}
      />
      <button onClick={() => { onAdd(text); setText(''); }} style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '7px',
        color: '#888',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '13px',
        padding: '0 16px',
        alignSelf: 'stretch',
      }}>Add</button>
    </div>
  );
}
