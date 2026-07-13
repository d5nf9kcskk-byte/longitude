/**
 * podium-sender.mjs
 *
 * GitHub Actions script — sends APPROVED, QUEUED outreach from
 * conductor@grantgilman.com via iCloud+ SMTP (smtp.mail.me.com). iCloud has no
 * drafts/send API, but it speaks standard SMTP with an app-specific password,
 * and GitHub Actions can reach port 587 cleanly (the Cowork container's proxy
 * typically cannot).
 *
 * SAFETY — this never blasts:
 *   · reads only `outreach` docs with status == 'queued' (the app queues them
 *     one at a time, from contacts you've reviewed);
 *   · DRY RUN by default — it logs what it would send and marks docs 'skipped'
 *     unless PODIUM_SEND_LIVE === 'true';
 *   · caps each run at SEND_MAX and spaces sends, staying inside iCloud's daily
 *     limits and protecting domain reputation;
 *   · skips any contact flagged doNotContact or without a plausible address.
 *
 * Trigger this manually (workflow_dispatch) after warming the domain and
 * confirming SPF / DKIM / DMARC on grantgilman.com. Do not put it on a cron
 * until you're confident.
 *
 * Required env (GitHub secrets):
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 *   ICLOUD_SMTP_USER   — your Apple ID email (login), e.g. you@icloud.com
 *   ICLOUD_SMTP_PASS   — an app-specific password (appleid.apple.com)
 *   ICLOUD_FROM        — the from address, e.g. conductor@grantgilman.com
 * Optional:
 *   PODIUM_SEND_LIVE=true   — actually send (otherwise dry run)
 *   SEND_MAX=10             — max messages per run
 *   SEND_DELAY_MS=8000      — ms between sends
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const USER = process.env.ICLOUD_SMTP_USER;
const PASS = process.env.ICLOUD_SMTP_PASS;
const FROM = process.env.ICLOUD_FROM || USER;
const LIVE = process.env.PODIUM_SEND_LIVE === 'true';
const SEND_MAX = Number(process.env.SEND_MAX ?? 10);
const DELAY_MS = Number(process.env.SEND_DELAY_MS ?? 8000);

if (!SERVICE_ACCOUNT_JSON) { console.log('FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping.'); process.exit(0); }

let serviceAccount;
try { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON.'); process.exit(1); }

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const looksLikeEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');

async function main() {
  const snap = await db.collection('outreach')
    .where('status', '==', 'queued')
    .limit(SEND_MAX)
    .get();

  if (snap.empty) { console.log('No queued outreach — nothing to send.'); return; }
  console.log(`${snap.size} queued. Mode: ${LIVE ? 'LIVE SEND' : 'DRY RUN'}.`);

  let transport = null;
  if (LIVE) {
    if (!USER || !PASS) { console.error('LIVE send requested but ICLOUD_SMTP_USER/PASS missing.'); process.exit(1); }
    transport = nodemailer.createTransport({
      host: 'smtp.mail.me.com', port: 587, secure: false,
      auth: { user: USER, pass: PASS },
    });
    await transport.verify();
    console.log('SMTP connection verified.');
  }

  let sent = 0, skipped = 0;
  for (const d of snap.docs) {
    const o = d.data();
    const to = o.to;
    if (o.doNotContact || !looksLikeEmail(to)) {
      await d.ref.update({ status: 'skipped', reason: 'no valid recipient / do-not-contact', processedAt: Date.now() });
      skipped++;
      continue;
    }

    if (!LIVE) {
      console.log(`  [dry] would send to ${to}: "${o.subject}"`);
      await d.ref.update({ status: 'skipped', reason: 'dry run', processedAt: Date.now() });
      skipped++;
      continue;
    }

    try {
      const info = await transport.sendMail({ from: FROM, to, subject: o.subject || '(no subject)', text: o.body || '' });
      await d.ref.update({ status: 'sent', messageId: info.messageId || '', sentAt: Date.now() });
      // Record the touch on the contact, if linked.
      if (o.contactId) {
        const cref = db.collection('contacts').doc(o.contactId);
        const csnap = await cref.get();
        if (csnap.exists) {
          const c = csnap.data();
          const today = new Date().toISOString().slice(0, 10);
          await cref.update({
            touchHistory: [...(c.touchHistory || []), { date: today, type: o.touchType || 'Other', notes: 'sent via iCloud', response: '' }],
            lastContact: today,
            stage: c.stage === 'Prospect' ? 'Contacted' : c.stage,
            updatedAt: Date.now(),
          });
        }
      }
      console.log(`  ✓ sent to ${to}`);
      sent++;
      await sleep(DELAY_MS);
    } catch (e) {
      console.error(`  ✗ ${to}: ${e.message}`);
      await d.ref.update({ status: 'error', error: String(e.message).slice(0, 300), processedAt: Date.now() });
    }
  }

  console.log(`Done. Sent ${sent}, skipped ${skipped}.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
