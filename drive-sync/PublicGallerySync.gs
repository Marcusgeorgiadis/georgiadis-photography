/**
 * Georgiadis Photography: Public Gallery sync
 *
 * Mirrors every "Finals" folder under your Nikon folder into Nikon/Public Gallery,
 * keeps that folder public (anyone with the link can view), and re-checks every
 * 30 minutes for new, changed or deleted Finals. RAW folders are never touched,
 * and nothing in your originals is moved or edited.
 *
 * Setup (once):
 *   1. script.google.com → New project → paste this file over the sample code.
 *   2. Choose "setup" in the function menu and click Run, then allow access.
 * That's it: the first run starts copying and schedules the rest.
 *
 * Copies are made in batches of about five minutes (Apps Script's limit), so the
 * first full copy of a large library finishes over a few scheduled runs.
 */

const NIKON_ID = '1lEhOfHPIO3-Kf4gl6-rhz9d-IwHL14rY';
const PUBLIC_NAME = 'Public Gallery';
const MANIFEST_NAME = 'manifest.json';
const TIME_BUDGET_MS = 4.5 * 60 * 1000;
const FINALS_RE = /^finals?\b/i;
const RAW_RE = /\braws?\b/i;
const RAW_EXT = /\.(nef|nrw|dng|cr2|cr3|crw|arw|srf|sr2|raf|orf|rw2|pef|srw|x3f|3fr|iiq|erf|mef|mos|kdc|dcr|xmp)$/i;
const FOLDER = 'application/vnd.google-apps.folder';
const API = 'https://www.googleapis.com/drive/v3/files';
const VERIFIED_ = {}; // folders already checked during this run

/** Run once: schedules the sync every 30 minutes and starts the first run. */
function setup() {
  DriveApp.getFolderById(NIKON_ID); // confirms access and grants the Drive permission
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sync')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(30).create();
  sync();
}

/** Scheduled entry point. */
function sync() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a previous run is still going
  try {
    run_();
  } finally {
    lock.releaseLock();
  }
}

/** Optional: stop the schedule. Copies stay where they are. */
function stop() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sync')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

function run_() {
  const started = Date.now();
  const pub = ensurePublicFolder_();
  const state = loadManifest_(pub);
  state.error = '';

  // 1. Find every Finals folder and its photos (one listing call per folder).
  const sources = [];
  const outings = listChildren_(NIKON_ID, true).filter((f) => f.id !== pub && !RAW_RE.test(f.name));
  outings.forEach((o) => {
    const found = [];
    if (FINALS_RE.test(o.name.trim())) found.push({ id: o.id, path: [o.name.trim()] });
    else walk_(o.id, [o.name.trim()], found, 1);
    found.forEach((f) => collectImages_(f.id, f.path, 0, sources, f.id));
  });
  if (!sources.length && Object.keys(state.items).length) {
    state.error = 'Drive returned no Finals this run; nothing was changed.';
    saveManifest_(pub, state);
    return;
  }

  // 2. Copy what's new or changed, newest first.
  sources.sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
  const seen = {};
  let copied = 0, finished = true;
  for (const src of sources) {
    seen[src.id] = true;
    const have = state.items[src.id];
    if (have && have.mod === src.modifiedTime && have.size === src.size) continue;
    if (Date.now() - started > TIME_BUDGET_MS) { finished = false; break; }
    const folderId = ensurePath_(pub, src.path, state);
    let copy;
    try {
      copy = api_('post', `${API}/${src.id}/copy?fields=id,name,size,imageMediaMetadata(width,height)&supportsAllDrives=true`, {
        name: src.name,
        parents: [folderId],
        description: `Public copy of ${src.id}`,
      });
    } catch (e) {
      state.error = /storageQuotaExceeded|quota/i.test(String(e))
        ? 'Your Google storage is full, so new Finals could not be copied. Free up space or add storage.'
        : `Copy failed for ${src.name}: ${String(e).slice(0, 200)}`;
      finished = false;
      break;
    }
    if (have && have.pub) trash_(have.pub);
    state.items[src.id] = {
      pub: copy.id,
      name: src.name,
      mod: src.modifiedTime,
      size: src.size,
      path: src.path.join(' / '),
      finals: src.finals,
      w: copy.imageMediaMetadata ? copy.imageMediaMetadata.width : null,
      h: copy.imageMediaMetadata ? copy.imageMediaMetadata.height : null,
    };
    copied++;
    if (copied % 50 === 0) saveManifest_(pub, state); // keep progress if the run is cut off
  }

  // 3. After a complete pass, remove copies whose originals are gone.
  if (finished) {
    Object.keys(state.items).forEach((id) => {
      if (!seen[id]) {
        trash_(state.items[id].pub);
        delete state.items[id];
      }
    });
  }
  state.complete = finished;
  state.copiedLastRun = copied;
  state.total = sources.length;
  saveManifest_(pub, state);
}

function walk_(folderId, path, found, depth) {
  if (depth > 5) return;
  listChildren_(folderId, true).forEach((k) => {
    const t = k.name.trim();
    if (FINALS_RE.test(t)) found.push({ id: k.id, path: path.slice() });
    else if (!RAW_RE.test(t)) walk_(k.id, path.concat(t), found, depth + 1);
  });
}

function collectImages_(folderId, path, depth, out, finalsId) {
  listChildren_(folderId, false).forEach((k) => {
    const t = k.name.trim();
    if (k.mimeType === FOLDER) {
      if (depth < 2 && !RAW_RE.test(t)) collectImages_(k.id, path.concat(t), depth + 1, out, finalsId);
    } else if (/^image\//.test(k.mimeType) && !RAW_EXT.test(t)) {
      out.push({ id: k.id, name: t, modifiedTime: k.modifiedTime, size: Number(k.size || 0), path, finals: finalsId });
    }
  });
}

function listChildren_(parentId, foldersOnly) {
  const out = [];
  let token = '';
  do {
    const q = `'${parentId}' in parents and trashed = false` + (foldersOnly ? ` and mimeType = '${FOLDER}'` : '');
    const res = api_('get', `${API}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` + (token ? `&pageToken=${token}` : ''));
    (res.files || []).forEach((f) => out.push(f));
    token = res.nextPageToken || '';
  } while (token);
  return out;
}

function ensurePublicFolder_() {
  const nikon = DriveApp.getFolderById(NIKON_ID);
  const it = nikon.getFoldersByName(PUBLIC_NAME);
  const folder = it.hasNext() ? it.next() : nikon.createFolder(PUBLIC_NAME);
  if (folder.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK || folder.getSharingPermission() !== DriveApp.Permission.VIEW) {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  if (!folder.getDescription()) folder.setDescription('Public copies of the Nikon Finals for the Georgiadis Photography gallery. Kept in sync automatically.');
  return folder.getId();
}

function ensurePath_(rootId, parts, state) {
  let parent = rootId;
  let key = '';
  for (const name of parts) {
    key += '/' + name;
    let id = state.folders[key];
    if (id && !VERIFIED_[id]) {
      try { if (DriveApp.getFolderById(id).isTrashed()) id = ''; } catch (e) { id = ''; }
    }
    if (!id) {
      const existing = listChildren_(parent, true).filter((f) => f.name === name)[0];
      id = existing ? existing.id : api_('post', `${API}?fields=id`, { name, mimeType: FOLDER, parents: [parent] }).id;
      state.folders[key] = id;
    }
    VERIFIED_[id] = true;
    parent = id;
  }
  return parent;
}

function trash_(id) {
  try { api_('patch', `${API}/${id}?supportsAllDrives=true`, { trashed: true }); } catch (e) { /* already gone */ }
}

function loadManifest_(pubId) {
  const it = DriveApp.getFolderById(pubId).getFilesByName(MANIFEST_NAME);
  if (it.hasNext()) {
    try {
      const m = JSON.parse(it.next().getBlob().getDataAsString());
      m.items = m.items || {};
      m.folders = m.folders || {};
      return m;
    } catch (e) { /* start fresh */ }
  }
  return { version: 1, items: {}, folders: {} };
}

function saveManifest_(pubId, state) {
  state.updated = new Date().toISOString();
  state.publicFolder = pubId;
  const json = JSON.stringify(state);
  const it = DriveApp.getFolderById(pubId).getFilesByName(MANIFEST_NAME);
  if (it.hasNext()) it.next().setContent(json);
  else DriveApp.getFolderById(pubId).createFile(MANIFEST_NAME, json, 'application/json');
}

function api_(method, url, body) {
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };
  if (body) {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(body);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = UrlFetchApp.fetch(url, opts);
    const code = res.getResponseCode();
    if (code === 429 || code >= 500) { Utilities.sleep(1000 * Math.pow(2, attempt)); continue; }
    if (code >= 400) throw new Error(`${code} ${res.getContentText().slice(0, 300)}`);
    const text = res.getContentText();
    return text ? JSON.parse(text) : {};
  }
  throw new Error('Google Drive kept refusing the request; it will be retried on the next run.');
}
