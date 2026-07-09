/**
 * ai-reader.mjs
 *
 * GitHub Actions script — queries Firestore for aiRequests with
 * status === 'pending', sends each conversation to the Claude API with the
 * Schwarz Workbench editorial system prompt, and writes the response back.
 * The app listens on the request doc and displays the reply when it lands.
 *
 * Required environment variables (GitHub secrets):
 *   ANTHROPIC_API_KEY             — Anthropic API key
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase service account key JSON
 *
 * Optional:
 *   READER_MAX=10        — max requests per run
 *   READER_DELAY_MS=1000 — ms between Claude calls
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const MAX_REQUESTS = Number(process.env.READER_MAX ?? 10);
const DELAY_MS = Number(process.env.READER_DELAY_MS ?? 1000);

if (!ANTHROPIC_KEY) {
  console.log('ANTHROPIC_API_KEY not set — skipping.');
  process.exit(0);
}
if (!SERVICE_ACCOUNT_JSON) {
  console.log('FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping.');
  process.exit(0);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const SYSTEM_PROMPT = `You are a critical reader and editorial collaborator for Grant Gilman, a conductor and music scholar writing a survey article on Gerard Schwarz's recording output. Grant is targeting American Record Guide (editor Donald Vroon) or Fanfare (editor Joel Flegler). These are serious critical outlets that reward a strong voice, a clear argument, and historical perspective — not academic hedging or reverential puff pieces.

About Gerard Schwarz: Distinguished Professor and Music Director of the Frost Symphony Orchestra (University of Miami, since 2019) and Music Director of Palm Beach Symphony. Primary discography: Delos Records and Naxos, centered on his Seattle Symphony tenure (1983–2011). The Naxos work includes a sustained American Music Series covering Hanson, Barber, Chadwick, Piston, Diamond, Schuman, and others. Also conducted Eastern Music Festival recordings.

Grant's repertoire focus centers on the American symphonic tradition — the Second New England School (Chadwick, Beach) through the postwar symphonists (Hanson, Piston, Schuman, Mennin, Creston) — read alongside the contemporary reappraisal of Florence Price and William Grant Still. His brand: podcast "American Muse," forthcoming book "Secrets of American Orchestral Music."

Grant's working professional thesis: he wants to be the conductor an executive director calls when she needs an American symphonic program — a William Schuman symphony, say — rehearsed to the standard of a core European romantic work, one that measurably moves subscriptions and not just applause. Hold his writing to that same standard of specificity and stakes. Vague affirmational language (sincerity, joy, transformation) is the opposite of the brand he's building — push him toward claims a skeptical executive director or a rival critic could actually test.

Your role: read whatever Grant shares (thesis, draft sections, notes, questions) and respond as a sharp editorial eye. Point out where the argument is weak, where a claim needs evidence, where the prose goes slack, and what's genuinely strong. Be specific about the Schwarz repertoire and discography when relevant. No flattery. No hedging. Treat Grant as a peer who can take honest feedback.`;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function answer(messages) {
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages,
  });
  if (msg.stop_reason === 'refusal') {
    throw new Error('The model declined this request.');
  }
  const text = msg.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  return text || 'No response.';
}

async function main() {
  console.log(`Querying Firestore for pending AI requests (max ${MAX_REQUESTS})…`);
  const snap = await db
    .collection('aiRequests')
    .where('status', '==', 'pending')
    .limit(MAX_REQUESTS)
    .get();

  if (snap.empty) {
    console.log('No pending requests — nothing to do.');
    return;
  }

  console.log(`Found ${snap.size} pending request(s).`);
  let done = 0;
  let failed = 0;

  for (const docSnap of snap.docs) {
    const req = docSnap.data();
    const messages = Array.isArray(req.messages) ? req.messages : [];
    if (messages.length === 0) {
      await docSnap.ref.update({ status: 'error', error: 'empty request' });
      failed++;
      continue;
    }
    console.log(`  Answering ${docSnap.id} (${messages.length} message(s))…`);
    try {
      const response = await answer(messages);
      await docSnap.ref.update({
        status: 'done',
        response,
        respondedAt: Date.now(),
      });
      console.log(`    ✓ Done (${response.length} chars)`);
      done++;
    } catch (err) {
      console.error(`    ✗ Error: ${err.message}`);
      await docSnap.ref.update({
        status: 'error',
        error: String(err.message || err).slice(0, 500),
        respondedAt: Date.now(),
      });
      failed++;
    }
    if (snap.docs.indexOf(docSnap) < snap.docs.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Tidy up consumed requests older than 7 days so the collection stays small.
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const old = await db
    .collection('aiRequests')
    .where('consumed', '==', true)
    .where('createdAt', '<', cutoff)
    .limit(50)
    .get();
  for (const d of old.docs) await d.ref.delete();
  if (!old.empty) console.log(`Cleaned up ${old.size} consumed request(s).`);

  console.log(`\nDone. Answered: ${done}, failed: ${failed}.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
