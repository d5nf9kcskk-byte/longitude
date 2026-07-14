/**
 * orchestra-scraper.mjs
 *
 * GitHub Actions script — refreshes Podium's contact database. For the N
 * orchestras whose contacts are stalest, it fetches the staff / board / about
 * page, asks the Claude API to extract upper-level personnel (EDs, MDs,
 * artistic administrators, personnel managers, board members), and writes any
 * NEW or CHANGED people to the `contacts` collection flagged reviewed:false —
 * they land in the app's Review tab for a human to verify before they ever
 * enter cadence. Nothing here emails anyone.
 *
 * Design mirrors ai-reader.mjs (service-account Admin SDK + Anthropic SDK).
 *
 * PRIVACY: the seed list of orchestra names/domains is public and lives in the
 * repo. Extracted PEOPLE — names, titles, emails — are written only to
 * Firestore, never committed (see CLAUDE.md).
 *
 * Required env (GitHub secrets):
 *   ANTHROPIC_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON
 * Optional:
 *   SCRAPE_MAX=8         — orchestras per run
 *   SCRAPE_DELAY_MS=1500 — ms between orchestras (be polite)
 *   SCRAPE_STALE_DAYS=30 — re-scrape an orchestra at most this often
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const MAX = Number(process.env.SCRAPE_MAX ?? 8);
const DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 1500);
const STALE_MS = Number(process.env.SCRAPE_STALE_DAYS ?? 30) * 24 * 3600 * 1000;

if (!ANTHROPIC_KEY) { console.log('ANTHROPIC_API_KEY not set — skipping.'); process.exit(0); }
if (!SERVICE_ACCOUNT_JSON) { console.log('FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping.'); process.exit(0); }

let serviceAccount;
try { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON.'); process.exit(1); }

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Candidate staff/board pages to try, in order.
const PAGE_PATHS = ['', '/staff', '/about/staff', '/about/board', '/board', '/about', '/administration', '/leadership', '/contact', '/about-us'];

function normalizeBase(website) {
  if (!website) return null;
  try { return new URL(website).origin; } catch { return null; }
}

// Crude HTML → text: drop scripts/styles/tags, collapse whitespace. Good enough
// to feed the model, and cheap.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PodiumBot/1.0 (+grantgilman.com; conductor@grantgilman.com) contact-research' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    return await res.text();
  } catch { return null; }
}

// Pull a couple of the most relevant pages and concatenate their text.
async function gatherText(base) {
  const seen = new Set();
  const chunks = [];
  for (const path of PAGE_PATHS) {
    if (chunks.length >= 3) break;
    const url = base + path;
    if (seen.has(url)) continue;
    seen.add(url);
    const html = await fetchPage(url);
    if (html) {
      const text = htmlToText(html);
      if (text.length > 200) chunks.push(`--- ${url} ---\n${text.slice(0, 6000)}`);
    }
    await sleep(400);
  }
  return chunks.join('\n\n');
}

const EXTRACT_SYSTEM = `You extract professional staff and board contacts from an orchestra's public website text. Return ONLY people in upper-level roles that influence guest-conductor decisions: Executive Director, Music Director, Artistic Director, Artistic Administrator, VP of Artistic Planning, General Manager, and Personnel/Orchestra Manager. From the board, include ONLY officers — the Board Chair/President, Vice-Chair, Treasurer, and Secretary — and NOT general board or trustee members. Ignore development, marketing, education, and box-office staff unless clearly senior leadership.

Respond with ONLY a JSON array (no prose, no code fence). Each item:
{"name": "...", "title": "exact title as printed", "roleCategory": "Executive Director|Music Director|Artistic Director|Artistic Administrator|Personnel Manager|Board Member|Other", "email": "if explicitly printed, else null"}

If nothing qualifies, return [].`;

async function extractContacts(text) {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: text.slice(0, 24000) }],
  });
  const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// Infer an email from a dominant address pattern seen on the page, when the
// person's own address isn't printed. Marked "inferred" — never auto-sent.
function inferEmail(name, text, base) {
  if (!name) return null;
  let domain;
  try { domain = new URL(base).hostname.replace(/^www\./, ''); } catch { return null; }
  const emails = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  const onDomain = emails.map(e => e.toLowerCase()).filter(e => e.endsWith('@' + domain));
  if (!onDomain.length) return null;
  const parts = name.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const first = parts[0].replace(/[^a-z]/g, '');
  const last = parts[parts.length - 1].replace(/[^a-z]/g, '');
  const sample = onDomain[0].split('@')[0];
  let local;
  if (sample.includes('.')) local = `${first}.${last}`;
  else if (sample.length <= 2) local = `${first[0]}${last}`;
  else local = `${first}${last}`;
  return `${local}@${domain}`;
}

function keyOf(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  console.log(`Scraper run — up to ${MAX} orchestras.`);
  const orchSnap = await db.collection('orchestras').get();
  if (orchSnap.empty) { console.log('No orchestras seeded — nothing to do.'); return; }

  const now = Date.now();
  const candidates = orchSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(o => o.status !== 'do-not-contact' && normalizeBase(o.website))
    .filter(o => !o.lastScraped || (now - o.lastScraped) > STALE_MS)
    .sort((a, b) => (a.lastScraped || 0) - (b.lastScraped || 0))
    .slice(0, MAX);

  if (!candidates.length) { console.log('Nothing stale enough to scrape.'); return; }

  let inserted = 0;
  for (const orch of candidates) {
    const base = normalizeBase(orch.website);
    console.log(`  ${orch.name} → ${base}`);
    const text = await gatherText(base);
    if (!text) {
      await db.collection('orchestras').doc(orch.id).update({ lastScraped: now, scrapeSource: 'unreachable' });
      continue;
    }

    let people = [];
    try { people = await extractContacts(text); }
    catch (e) { console.error(`    extract error: ${e.message}`); }

    // Existing contacts for this orchestra, keyed by name.
    const existingSnap = await db.collection('contacts').where('orchestraId', '==', orch.id).get();
    const existingKeys = new Set(existingSnap.docs.map(d => keyOf(d.data().name)));

    for (const p of people) {
      if (!p.name || existingKeys.has(keyOf(p.name))) continue;
      const email = p.email || inferEmail(p.name, text, base);
      const emailConfidence = p.email ? 'verified' : (email ? 'inferred' : 'unknown');
      await db.collection('contacts').add({
        orchestraId: orch.id,
        name: p.name,
        title: p.title || '',
        roleCategory: p.roleCategory || 'Other',
        email: email || '',
        emailConfidence,
        phone: '', linkedin: '',
        decisionWeight: 3,
        doNotContact: false,
        stage: 'Prospect',
        cadenceTrack: '',
        nextTouchDue: '',
        lastContact: '',
        personalNotes: '',
        touchHistory: [],
        reviewed: false,
        source: `scraper:${base}`,
        createdAt: now,
        updatedAt: now,
      });
      existingKeys.add(keyOf(p.name));
      inserted++;
    }

    await db.collection('orchestras').doc(orch.id).update({ lastScraped: now, scrapeSource: base });
    await sleep(DELAY_MS);
  }

  console.log(`Done. Inserted ${inserted} new contact(s) for review across ${candidates.length} orchestra(s).`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
