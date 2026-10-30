/**
 * Georgiadis Photography: the newsletter
 *
 * Keeps the list of people who asked for dispatches by email and, when a new outing goes
 * up on the site, sends each of them a short note about it with a link straight to the
 * outing. It runs as a Google Apps Script web app, so mail goes out from the Google
 * account that installs it, under the name "Georgiadis Photography".
 *
 *   - The site's sign-up form posts here. Each new address gets one email asking it to
 *     confirm (nothing else is ever sent to an address that hasn't confirmed).
 *   - Every hour the script reads the site's outings feed (data/dispatches.json). An
 *     outing that has been on the site, unchanged, for SETTLE_HOURS is announced once.
 *     Outings already on the site when the newsletter is set up are never announced.
 *   - Every email has its own unsubscribe link, which works in one click on the site.
 *
 * Setup (once), signed in to the account the newsletter should come from:
 *   1. script.google.com → New project → paste this file over the sample code.
 *   2. Choose "setupNewsletter" in the function menu and click Run, then allow access.
 *      This makes the subscriber sheet in your Drive, schedules the hourly check and
 *      notes the outings already on the site.
 *   3. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone.
 *      Copy the web app URL: the site's sign-up form sends to it.
 *   4. Optional: run "sendNewsletterTest" to send yourself both emails as subscribers
 *      will see them.
 *
 * Settings live in Project Settings → Script properties, all optional:
 *   SITE_URL       the public site (default below)
 *   SENDER_NAME    the name the mail comes from
 *   REPLY_TO       where replies go, if not this account
 *   SETTLE_HOURS   how long an outing must stay unchanged before it's announced, so a
 *                  day still being uploaded goes out once, complete (default 6)
 *
 * A free Google account can send to about 100 addresses a day; a longer list simply
 * carries on the next day, picking up where it stopped.
 */

const DEFAULTS_ = {
  SITE_URL: 'https://marcusgeorgiadis.github.io/georgiadis-photography/',
  SENDER_NAME: 'Georgiadis Photography',
  REPLY_TO: '',
  SETTLE_HOURS: '6',
};
const CONFIRMS_PER_HOUR_ = 30; // sign-up emails, at most, so the form can't be used to flood anyone
const TIME_BUDGET_MS_ = 4.5 * 60 * 1000;
const EMAIL_RE_ = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const COLS_ = ['email', 'status', 'token', 'requested', 'confirmed', 'unsubscribed', 'source', 'last_issue', 'confirm_sent', 'confirm_count'];
const LOG_COLS_ = ['outing', 'date', 'title', 'status', 'when', 'recipients'];

function cfg_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v != null && v !== '' ? v : DEFAULTS_[k] || '';
}
function siteUrl_() { return cfg_('SITE_URL').replace(/\/?$/, '/'); }

/* ---------- setup ---------- */

/** Run once: makes the subscriber sheet, schedules the hourly check and notes what's already on the site. */
function setupNewsletter() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('Georgiadis Photography newsletter');
    const subs = ss.getSheets()[0];
    subs.setName('Subscribers');
    subs.appendRow(COLS_);
    subs.setFrozenRows(1);
    const log = ss.insertSheet('Dispatches');
    log.appendRow(LOG_COLS_);
    log.setFrozenRows(1);
    props.setProperty('SHEET_ID', ss.getId());
  }
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'checkForNewOutings')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkForNewOutings').timeBased().everyHours(1).create();
  checkForNewOutings();
  const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  Logger.log('Ready. Subscribers are kept in "%s": %s', ss.getName(), ss.getUrl());
  Logger.log('Next: Deploy → New deployment → Web app (execute as Me, access Anyone), and give the site its URL.');
}

/** Sends you the latest dispatch and the confirmation email, as subscribers see them. */
function sendNewsletterTest() {
  const me = Session.getEffectiveUser().getEmail();
  const feed = fetchFeed_();
  if (!feed || !feed.outings.length) throw new Error('The site\'s outings feed could not be read.');
  const d = dispatchEmail_(feed, [feed.outings[0]], 'test');
  send_(me, '[Test] ' + d.subject, d);
  const c = confirmEmail_(feed, 'test');
  send_(me, '[Test] ' + c.subject, c);
  Logger.log('Sent both to %s.', me);
}

/** Confirms the addresses you added yourself (sign-ups whose source is "owner"), so they needn't click the link. */
function confirmAddedByOwner() {
  const book = book_();
  let n = 0;
  book.list.forEach((rec) => {
    if (rec.status === 'pending' && rec.source === 'owner') {
      rec.status = 'confirmed';
      rec.confirmed = new Date();
      book.save(rec);
      n++;
    }
  });
  Logger.log('Confirmed %s address%s you added.', n, n === 1 ? '' : 'es');
}

/** Sends the newest outing on the site to everyone confirmed, even if it was on the site before the newsletter began. */
function announceLatest() {
  const feed = fetchFeed_();
  if (!feed || !feed.outings.length) throw new Error('The site\'s outings feed could not be read.');
  const props = PropertiesService.getScriptProperties();
  const state = JSON.parse(props.getProperty('STATE') || '{}');
  if (state.issue) throw new Error('A dispatch is still going out. Try again in an hour.');
  const o = feed.outings[0];
  state.started = state.started || Date.now();
  state.issue = { id: 'i' + Date.now(), outings: [o.id] };
  props.setProperty('STATE', JSON.stringify(state));
  checkForNewOutings_(false);
  Logger.log('Sent "%s" (%s).', o.title, o.when);
}

/** Announces any outing waiting to settle right away, instead of after SETTLE_HOURS. */
function sendWaitingNow() {
  checkForNewOutings_(true);
}

/* ---------- the web app: sign up, confirm, unsubscribe ---------- */

function doPost(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { p = (e && e.parameter) || {}; }
  return reply_(handle_(p), null);
}
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.action) return reply_({ ok: true, name: cfg_('SENDER_NAME') }, p.callback);
  return reply_(handle_(p), p.callback);
}
// JSON, or JSONP for a page that can't read the JSON across sites
function reply_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && /^[\w.$]{1,64}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function handle_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };
  try {
    if (p.action === 'subscribe') return subscribe_(p);
    if (p.action === 'confirm') return confirm_(String(p.token || ''));
    if (p.action === 'unsubscribe') return unsubscribe_(String(p.token || ''));
    return { ok: false, error: 'action' };
  } catch (err) {
    console.error(err && err.stack || err);
    return { ok: false, error: 'server' };
  } finally {
    lock.releaseLock();
  }
}

function subscribe_(p) {
  // a hidden field people never see: anything that fills it in is a bot, and is told all went well
  if (p.website) return { ok: true, state: 'pending' };
  const email = String(p.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE_.test(email)) return { ok: false, error: 'email' };
  const book = book_();
  let rec = book.find((r) => r.email === email);
  const now = new Date();
  // Already on the list: the form answers as it does for anyone (so it never tells a stranger who
  // subscribes), and the address itself gets a short note saying so, with its unsubscribe link.
  if (rec && rec.status === 'confirmed') {
    const since = rec.confirm_sent ? now - new Date(rec.confirm_sent) : Infinity;
    if (since >= 60 * 60e3 && allowConfirmation_()) {
      book.mark(rec, 'confirm_sent', now);
      const a = alreadyEmail_(rec.token);
      send_(email, a.subject, a);
    }
    return { ok: true, state: 'pending' };
  }
  if (rec && rec.status === 'pending') {
    const since = rec.confirm_sent ? now - new Date(rec.confirm_sent) : Infinity;
    const today = rec.requested && now - new Date(rec.requested) < 864e5;
    // one confirmation every ten minutes, three a day, to any one address
    if (since < 10 * 60e3 || (today && +rec.confirm_count >= 3)) return { ok: true, state: 'pending' };
  }
  if (!allowConfirmation_()) return { ok: false, error: 'busy' };
  const fresh = !rec || rec.status !== 'pending' || !(rec.requested && now - new Date(rec.requested) < 864e5);
  rec = rec || { email: email };
  rec.status = 'pending';
  rec.token = rec.token || newToken_();
  if (fresh) { rec.requested = now; rec.confirm_count = 0; }
  rec.unsubscribed = '';
  rec.source = String(p.source || '').slice(0, 40);
  rec.confirm_sent = now;
  rec.confirm_count = (+rec.confirm_count || 0) + 1;
  book.save(rec);
  const c = confirmEmail_(null, rec.token);
  send_(email, c.subject, c);
  return { ok: true, state: 'pending' };
}
function confirm_(token) {
  const book = book_();
  const rec = token && book.find((r) => r.token === token);
  if (!rec) return { ok: false, error: 'token' };
  if (rec.status !== 'confirmed') {
    rec.status = 'confirmed';
    rec.confirmed = new Date();
    rec.unsubscribed = '';
    book.save(rec);
  }
  return { ok: true, state: 'confirmed', email: mask_(rec.email) };
}
function unsubscribe_(token) {
  const book = book_();
  const rec = token && book.find((r) => r.token === token);
  if (!rec) return { ok: false, error: 'token' };
  if (rec.status !== 'unsubscribed') {
    rec.status = 'unsubscribed';
    rec.unsubscribed = new Date();
    book.save(rec);
  }
  return { ok: true, state: 'unsubscribed', email: mask_(rec.email) };
}
function allowConfirmation_() {
  if (MailApp.getRemainingDailyQuota() < 5) return false;
  const props = PropertiesService.getScriptProperties();
  const hour = Math.floor(Date.now() / 3600e3);
  const w = JSON.parse(props.getProperty('CONFIRM_WINDOW') || '{}');
  const n = w.hour === hour ? w.n : 0;
  if (n >= CONFIRMS_PER_HOUR_) return false;
  props.setProperty('CONFIRM_WINDOW', JSON.stringify({ hour: hour, n: n + 1 }));
  return true;
}
function newToken_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
function mask_(email) {
  const at = email.indexOf('@');
  return at > 2 ? email.slice(0, 2) + '•••' + email.slice(at) : '•••' + email.slice(at);
}

/* ---------- the subscriber sheet ---------- */

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setupNewsletter first.');
  return SpreadsheetApp.openById(id);
}
// The subscribers as records, and a way to write one back to its row.
function book_() {
  const sh = spreadsheet_().getSheetByName('Subscribers');
  const values = sh.getDataRange().getValues();
  const list = values.slice(1).map((r, i) => {
    const rec = { row: i + 2 };
    COLS_.forEach((k, j) => { rec[k] = r[j]; });
    rec.email = String(rec.email || '').trim().toLowerCase();
    return rec;
  });
  return {
    list: list,
    find: (fn) => list.find(fn),
    save: (rec) => {
      const row = COLS_.map((k) => (rec[k] == null ? '' : rec[k]));
      if (rec.row) sh.getRange(rec.row, 1, 1, COLS_.length).setValues([row]);
      else { sh.appendRow(row); rec.row = sh.getLastRow(); list.push(rec); }
    },
    mark: (rec, key, value) => { rec[key] = value; sh.getRange(rec.row, COLS_.indexOf(key) + 1).setValue(value); },
  };
}

/* ---------- announcing new outings ---------- */

function fetchFeed_() {
  const r = UrlFetchApp.fetch(siteUrl_() + 'data/dispatches.json?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) { console.warn('Feed: HTTP ' + r.getResponseCode()); return null; }
  const feed = JSON.parse(r.getContentText());
  return feed && Array.isArray(feed.outings) ? feed : null;
}

/** The hourly check (scheduled by setupNewsletter). */
function checkForNewOutings() {
  checkForNewOutings_(false);
}
function checkForNewOutings_(now_) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  const t0 = Date.now();
  try {
    const feed = fetchFeed_();
    if (!feed) return;
    const props = PropertiesService.getScriptProperties();
    const ss = spreadsheet_(), log = ss.getSheetByName('Dispatches');
    const logged = new Set(log.getDataRange().getValues().slice(1).map((r) => String(r[0])));
    const state = JSON.parse(props.getProperty('STATE') || '{}');
    state.seen = state.seen || {};
    // the first run: everything already on the site counts as announced
    if (!state.started) {
      feed.outings.slice().reverse().forEach((o) => { if (!logged.has(o.id)) log.appendRow([o.id, o.date, o.title, 'already on the site', new Date(), 0]); });
      state.started = Date.now();
      props.setProperty('STATE', JSON.stringify(state));
      return;
    }
    if (!state.issue) {
      const inFeed = new Set(feed.outings.map((o) => o.id));
      Object.keys(state.seen).forEach((id) => { if (!inFeed.has(id)) delete state.seen[id]; });
      const settle = Math.max(0, +cfg_('SETTLE_HOURS') || 0) * 3600e3, now = Date.now(), due = [];
      feed.outings.forEach((o) => {
        if (logged.has(o.id)) return;
        const s = state.seen[o.id];
        // a new outing waits until it has stopped growing, so it goes out once, complete
        if (!s) { state.seen[o.id] = { frames: o.frames, changed: now }; if (now_ || !settle) due.push(o.id); return; }
        if (s.frames !== o.frames) { s.frames = o.frames; s.changed = now; if (!now_) return; }
        if (now_ || now - s.changed >= settle) due.push(o.id);
      });
      if (due.length) state.issue = { id: 'i' + now, outings: due };
    }
    if (state.issue) {
      const res = sendIssue_(feed, state.issue, t0);
      if (res.done) {
        state.issue.outings.forEach((id) => {
          const o = feed.outings.find((x) => x.id === id);
          if (o) log.appendRow([o.id, o.date, o.title, 'sent', new Date(), res.sent + (state.issue.sentBefore || 0)]);
          delete state.seen[id];
        });
        state.issue = null;
      } else {
        state.issue.sentBefore = (state.issue.sentBefore || 0) + res.sent;
      }
    }
    props.setProperty('STATE', JSON.stringify(state));
  } finally {
    lock.releaseLock();
  }
}
// Sends this issue to everyone confirmed who hasn't had it yet. Stops at the day's mail
// quota or the run's time limit, and carries on from there next hour.
function sendIssue_(feed, issue, t0) {
  const outs = issue.outings.map((id) => feed.outings.find((o) => o.id === id)).filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!outs.length) return { done: true, sent: 0 };
  const book = book_();
  let sent = 0;
  for (const rec of book.list) {
    if (rec.status !== 'confirmed' || rec.last_issue === issue.id) continue;
    if (Date.now() - t0 > TIME_BUDGET_MS_ || MailApp.getRemainingDailyQuota() < 1) return { done: false, sent: sent };
    const mail = dispatchEmail_(feed, outs, rec.token);
    try {
      send_(rec.email, mail.subject, mail);
    } catch (err) {
      console.error('Sending to row ' + rec.row + ': ' + err);
      if (/quota|limit/i.test(String(err))) return { done: false, sent: sent };
      continue;
    }
    book.mark(rec, 'last_issue', issue.id);
    sent++;
  }
  return { done: true, sent: sent };
}
function send_(to, subject, mail) {
  const msg = { to: to, subject: subject, body: mail.text, htmlBody: mail.html, name: cfg_('SENDER_NAME') };
  if (cfg_('REPLY_TO')) msg.replyTo = cfg_('REPLY_TO');
  MailApp.sendEmail(msg);
}

/* ---------- the emails ---------- */
// Table layout and inline styles, which every mail program reads the same way. The site's
// typefaces where the reader's mail program has them, close stand-ins where it doesn't.

const INK_ = '#161916', MUTED_ = '#5c645d', LINE_ = '#d3d8d0', PAPER_ = '#f6f7f3', DESK_ = '#e8eae5', BRASS_ = '#8a6a2a';
const DISPLAY_ = "'Bodoni Moda', Didot, 'Bodoni 72', 'Bodoni MT', Georgia, 'Times New Roman', serif";
const BODY_ = "'Source Sans 3', 'Source Sans Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const DATA_ = "'IBM Plex Mono', Menlo, Consolas, 'Courier New', monospace";

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function plural_(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
function andList_(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

function kicker_(text, color) {
  return '<div style="font-family:' + DATA_ + ';font-size:11px;line-height:16px;letter-spacing:0.16em;text-transform:uppercase;color:' + color + ';">' + text + '</div>';
}
function button_(href, label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:' + INK_ + ';">' +
    '<a href="' + esc_(href) + '" style="display:inline-block;padding:13px 26px;font-family:' + BODY_ + ';font-size:15px;line-height:18px;font-weight:600;color:' + PAPER_ + ';text-decoration:none;border-radius:999px;">' + label + '</a>' +
    '</td></tr></table>';
}
// The page every email shares: the name at the top, the words in the middle, and why it came.
function frame_(o) {
  const site = siteUrl_();
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc_(o.title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400&family=IBM+Plex+Mono:wght@500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">' +
    '<style>body{margin:0;padding:0}a{color:inherit}img{border:0;outline:none}' +
    '@media (max-width:620px){.wrap{width:100%!important}.pad{padding-left:24px!important;padding-right:24px!important}.h1{font-size:30px!important;line-height:34px!important}}</style>' +
    '</head><body style="margin:0;padding:0;background:' + DESK_ + ';">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc_(o.preheader || '') + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + DESK_ + ';"><tr><td align="center" style="padding:28px 12px 36px;">' +
    '<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:' + PAPER_ + ';border-radius:12px;">' +
    '<tr><td class="pad" style="padding:30px 40px 0;">' +
    '<a href="' + esc_(site) + '" style="font-family:' + DISPLAY_ + ';font-size:21px;line-height:24px;color:' + INK_ + ';text-decoration:none;">Georgiadis Photography</a>' +
    '<div style="font-family:' + DATA_ + ';font-size:10px;line-height:16px;letter-spacing:0.18em;text-transform:uppercase;color:' + MUTED_ + ';padding-top:3px;">Wildlife of Central Florida</div>' +
    '</td></tr>' +
    '<tr><td class="pad" style="padding:22px 40px 0;"><div style="height:1px;line-height:1px;font-size:1px;background:' + LINE_ + ';">&nbsp;</div></td></tr>' +
    o.body +
    '<tr><td class="pad" style="padding:30px 40px 34px;"><div style="height:1px;line-height:1px;font-size:1px;background:' + LINE_ + ';">&nbsp;</div>' +
    '<div style="font-family:' + BODY_ + ';font-size:13px;line-height:20px;color:' + MUTED_ + ';padding-top:18px;">' + o.footer + '</div>' +
    '</td></tr></table>' +
    '</td></tr></table></body></html>';
}

// One email for one new outing, or for a few that went up together (the newest leads).
function dispatchEmail_(feed, outs, token) {
  const o = outs[0], more = outs.slice(1), site = siteUrl_();
  const unsub = site + '#/newsletter?unsubscribe=' + encodeURIComponent(token);
  const accent = /^#[0-9a-f]{6}$/i.test(o.accent || '') ? o.accent : BRASS_;
  const facts = [plural_(o.frames, 'frame'), plural_(o.speciesN, 'species', 'species')];
  if (o.companions && o.companions.length > 1) facts.push('with ' + andList_(o.companions.slice(1)));
  const img = o.cover ? '<tr><td class="pad" style="padding:22px 40px 0;"><a href="' + esc_(o.url) + '" style="text-decoration:none;">' +
    '<img src="' + esc_(o.cover.url) + '" width="520" alt="' + esc_(o.cover.alt || o.title) + '" style="display:block;width:100%;max-width:520px;height:auto;border-radius:6px;background:' + LINE_ + ';"></a></td></tr>' : '';
  const also = more.length ? '<tr><td class="pad" style="padding:30px 40px 0;">' + kicker_('Also new', MUTED_) +
    more.map((m) => '<div style="padding-top:10px;font-family:' + BODY_ + ';font-size:15px;line-height:22px;color:' + INK_ + ';">' +
      '<span style="font-family:' + DATA_ + ';font-size:12px;color:' + MUTED_ + ';">' + esc_(m.when) + '</span>&nbsp;&nbsp;' +
      '<a href="' + esc_(m.url) + '" style="color:' + INK_ + ';text-decoration:underline;text-decoration-color:' + LINE_ + ';">' + esc_(m.title) + '</a></div>').join('') +
    '</td></tr>' : '';
  const body =
    '<tr><td class="pad" style="padding:30px 40px 0;">' +
    '<div style="width:28px;height:2px;line-height:2px;font-size:2px;background:' + accent + ';margin-bottom:14px;">&nbsp;</div>' +
    kicker_('From the field &middot; Dispatch No. ' + esc_(o.no), accent) +
    '<h1 class="h1" style="margin:10px 0 0;font-family:' + DISPLAY_ + ';font-size:36px;line-height:40px;font-weight:400;color:' + INK_ + ';">' + esc_(o.when) + '</h1>' +
    '<div style="padding-top:6px;font-family:' + DISPLAY_ + ';font-style:italic;font-size:19px;line-height:26px;color:' + MUTED_ + ';">' + esc_(o.title) + '</div>' +
    '</td></tr>' + img +
    '<tr><td class="pad" style="padding:22px 40px 0;">' +
    '<p style="margin:0;font-family:' + BODY_ + ';font-size:17px;line-height:27px;color:' + INK_ + ';">' + esc_(o.hook) + '</p>' +
    '<div style="padding-top:10px;font-family:' + DATA_ + ';font-size:12px;line-height:18px;color:' + MUTED_ + ';">' + esc_(facts.join(' · ')) + '</div>' +
    '</td></tr>' +
    '<tr><td class="pad" style="padding:24px 40px 0;">' + button_(o.url, 'See the outing &rarr;') + '</td></tr>' + also;
  const footer = 'You asked for dispatches from Georgiadis Photography, a note whenever a new outing goes up. ' +
    '<a href="' + esc_(unsub) + '" style="color:' + MUTED_ + ';">Unsubscribe</a> &middot; <a href="' + esc_(site) + '" style="color:' + MUTED_ + ';">Visit the gallery</a>';
  const subject = more.length
    ? 'From the field: ' + (more.length + 1) + ' new outings, the latest ' + o.when
    : 'From the field · ' + o.when + ': ' + o.title;
  const text = [
    'FROM THE FIELD · DISPATCH NO. ' + o.no,
    o.when + ' · ' + o.title,
    '',
    o.hook,
    facts.join(' · '),
    '',
    'See the outing: ' + o.url,
  ].concat(more.length ? [''].concat(['Also new:'], more.map((m) => '  ' + m.when + ' · ' + m.title + '  ' + m.url)) : [])
    .concat(['', '—', 'Georgiadis Photography · Wildlife of Central Florida', site, 'Unsubscribe: ' + unsub]).join('\n');
  return { subject: subject, html: frame_({ title: subject, preheader: o.hook, body: body, footer: footer }), text: text };
}

// For an address that signs up again while it's already on the list.
function alreadyEmail_(token) {
  const site = siteUrl_();
  const unsub = site + '#/newsletter?unsubscribe=' + encodeURIComponent(token);
  const body =
    '<tr><td class="pad" style="padding:30px 40px 0;">' +
    kicker_('Dispatches by email', BRASS_) +
    '<h1 class="h1" style="margin:10px 0 0;font-family:' + DISPLAY_ + ';font-size:34px;line-height:40px;font-weight:400;color:' + INK_ + ';">You\'re already on the list</h1>' +
    '<p style="margin:16px 0 0;font-family:' + BODY_ + ';font-size:17px;line-height:27px;color:' + INK_ + ';">Someone, probably you, asked to subscribe this address again. Nothing needs doing: the next dispatch will arrive when a new outing goes up.</p>' +
    '</td></tr>' +
    '<tr><td class="pad" style="padding:24px 40px 0;">' + button_(site, 'Visit the gallery') + '</td></tr>';
  const footer = 'Rather not hear from us? <a href="' + esc_(unsub) + '" style="color:' + MUTED_ + ';">Unsubscribe</a>.';
  const subject = 'You\'re already subscribed to Georgiadis Photography';
  const text = ['You\'re already on the list', '', 'Someone, probably you, asked to subscribe this address again. Nothing needs doing: the next dispatch will arrive when a new outing goes up.', '', site, '', 'Unsubscribe: ' + unsub].join('\n');
  return { subject: subject, html: frame_({ title: subject, preheader: 'Nothing needs doing.', body: body, footer: footer }), text: text };
}

// The one email an address gets before it confirms.
function confirmEmail_(feed, token) {
  const site = siteUrl_();
  const link = site + '#/newsletter?confirm=' + encodeURIComponent(token);
  const body =
    '<tr><td class="pad" style="padding:30px 40px 0;">' +
    kicker_('One more step', BRASS_) +
    '<h1 class="h1" style="margin:10px 0 0;font-family:' + DISPLAY_ + ';font-size:34px;line-height:40px;font-weight:400;color:' + INK_ + ';">Confirm your subscription</h1>' +
    '<p style="margin:16px 0 0;font-family:' + BODY_ + ';font-size:17px;line-height:27px;color:' + INK_ + ';">You asked for dispatches from Georgiadis Photography: a short note whenever a new outing from Central Florida\'s wetlands and woods goes up, with a link straight to its photographs.</p>' +
    '</td></tr>' +
    '<tr><td class="pad" style="padding:24px 40px 0;">' + button_(link, 'Confirm subscription') + '</td></tr>' +
    '<tr><td class="pad" style="padding:18px 40px 0;"><p style="margin:0;font-family:' + BODY_ + ';font-size:14px;line-height:22px;color:' + MUTED_ + ';">If the button doesn\'t work, open this link: <a href="' + esc_(link) + '" style="color:' + MUTED_ + ';word-break:break-all;">' + esc_(link) + '</a></p></td></tr>';
  const footer = 'If you didn\'t ask for this, ignore this email: without a confirmation you won\'t hear from us again.';
  const subject = 'Confirm your subscription to Georgiadis Photography';
  const text = ['Confirm your subscription', '', 'You asked for dispatches from Georgiadis Photography: a short note whenever a new outing goes up, with a link straight to its photographs.', '', 'Confirm: ' + link, '', 'If you didn\'t ask for this, ignore this email: without a confirmation you won\'t hear from us again.', '', '—', 'Georgiadis Photography · Wildlife of Central Florida', site].join('\n');
  return { subject: subject, html: frame_({ title: subject, preheader: 'One tap and you\'ll hear when a new outing goes up.', body: body, footer: footer }), text: text };
}
