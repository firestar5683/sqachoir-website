import { siteConfig } from './config.js';
import { setupAnalytics } from './analytics.js?v=2';

export function buildEmail(type, values, email = siteConfig.email) {
  const newsletter = type === 'newsletter';
  const subject = newsletter ? 'Public concert updates signup request' : `Website inquiry: ${values.topic || 'General question'}`;
  const body = newsletter
    ? `Please add me to the Singing Quakers Alumni Choir mailing list.\n\nName: ${values.name || '(not provided)'}\nEmail: ${values.email}\n\nI agree to receive concert announcements and choir news by email.`
    : `Name: ${values.name}\nEmail: ${values.email}\n\n${values.message}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function validFormEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) && value === siteConfig.formEndpoint && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function safeMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function filterTracks(collections, query, voice) {
  const normalized = query.trim().toLocaleLowerCase();
  return collections.map(collection => ({ ...collection, tracks: collection.tracks.filter(track =>
    (!normalized || `${collection.title} ${collection.composer || ''} ${track.label}`.toLocaleLowerCase().includes(normalized)) &&
    (voice === 'all' || track.voice === voice || track.voice === 'all')
  ) })).filter(collection => collection.tracks.length);
}

function setupMenu() {
  const button = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#primary-navigation');
  const close = () => { button.setAttribute('aria-expanded', 'false'); delete nav.dataset.open; document.body.classList.remove('menu-open'); };
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    nav.dataset.open = String(open);
    document.body.classList.toggle('menu-open', open);
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') { close(); button.focus(); } });
  window.matchMedia('(min-width: 801px)').addEventListener('change', event => { if (event.matches) close(); });
  window.addEventListener('pageshow', close);
}

export function validFormReply(origin, data, requestId) {
  return /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin) &&
    data?.type === 'sqac-form-result' && data.requestId === requestId && typeof data.ok === 'boolean';
}

function setupForms() {
  const form = document.querySelector('[data-form="intake"]');
  if (!form) return;
  const purpose = form.querySelector('[name=request_type]');
  const message = form.querySelector('[name=message]');
  const consent = form.querySelector('[name=consent]');
  const button = form.querySelector('button[type=submit]');
  const label = form.querySelector('[data-submit-label]');
  const status = form.querySelector('.form-status');
  const descriptions = {inquiry: 'Send a question to the choir.', member: 'For choir singers: member communications and rehearsal updates. Signing up does not confirm choir membership.', newsletter: 'For concertgoers: public performance announcements.'};
  const subjects = {inquiry: 'SQAC | General inquiry', member: 'SQAC | Member list', newsletter: 'SQAC | Concert newsletter'};
  let pending = false, token = '', widget, timer, fingerprint = '', requestId = '';
  const updatePurpose = () => {
    const kind = Object.hasOwn(subjects, purpose.value) ? purpose.value : 'inquiry';
    message.required = kind === 'inquiry';
    consent.required = kind !== 'inquiry';
    form.querySelector('[data-consent-wrap]').hidden = kind === 'inquiry';
    form.querySelector('[data-consent-label]').textContent = kind === 'member' ? 'Send me choir member and rehearsal updates by email.' : 'Send me public concert announcements by email.';
    form.querySelector('[data-message-label]').textContent = kind === 'inquiry' ? 'Your message' : 'A note for the choir (optional)';
    form.querySelector('[data-purpose-help]').textContent = descriptions[kind];
  };
  const selectFromHash = () => { if (location.hash === '#newsletter') purpose.value = 'newsletter'; else if (location.hash === '#sing') purpose.value = 'member'; updatePurpose(); };
  purpose.addEventListener('change', updatePurpose);
  window.addEventListener('hashchange', selectFromHash);
  selectFromHash();
  if (form.dataset.delivery === 'automatic' && validFormEndpoint(form.action)) {
    const frame = document.createElement('iframe');
    frame.name = 'choir-form-response'; frame.hidden = true; frame.title = 'Request delivery';
    form.target = frame.name;
    document.body.append(frame);
    button.disabled = true;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const unavailable = () => {
      token = ''; button.disabled = true;
      status.dataset.state = 'error';
      status.textContent = 'The spam check could not load. Please reload or email the choir directly.';
    };
    script.addEventListener('error', unavailable);
    script.addEventListener('load', () => {
      widget = window.turnstile.render(form.querySelector('[data-spam-check]'), {
        sitekey:siteConfig.turnstileSiteKey, action:'choir_request', theme:'light',
        callback:value => { token = value; button.disabled = pending; },
        'expired-callback':() => { token = ''; button.disabled = true; },
        'error-callback':unavailable
      });
    });
    document.head.append(script);
    const reset = text => {
      pending = false; token = ''; button.disabled = true; label.textContent = 'Send request';
      status.dataset.state = 'error'; status.textContent = text;
      window.turnstile?.reset(widget);
    };
    window.addEventListener('message', event => {
      if (!pending || !validFormReply(event.origin, event.data, requestId)) return;
      clearTimeout(timer);
      if (event.data.ok) { pending = false; window.location.assign('thank-you.html'); }
      else reset(event.data.error || 'We could not accept the request. Please try again or email the choir.');
    });
    window.addEventListener('pageshow', event => { if (event.persisted) reset('Please complete the spam check before sending another request.'); });
    form.addEventListener('submit', event => {
      if (pending || !form.reportValidity() || !token) { event.preventDefault(); return; }
      const values = Object.fromEntries(new FormData(form));
      if (values._honey) { event.preventDefault(); return; }
      const content = JSON.stringify([values.request_type, values.name, values.email, values.message, values.consent]);
      if (content !== fingerprint) { fingerprint = content; requestId = crypto.randomUUID(); }
      form.querySelector('[name=request_id]').value = requestId;
      pending = true; button.disabled = true; label.textContent = 'Sending…'; status.textContent = '';
      timer = setTimeout(() => reset('We could not confirm delivery. Please email the choir before resubmitting your request.'), 60000);
    });
    return;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    if (values._honey) return;
    const body = `Name: ${values.name}\nEmail: ${values.email}\nRequest: ${values.request_type}\nConsent: ${values.consent || 'not applicable'}\n\n${values.message || ''}`;
    window.location.href = `mailto:${siteConfig.email}?subject=${encodeURIComponent(subjects[purpose.value] || subjects.inquiry)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Your email app should open. Press Send there to deliver your request.';
  });
}

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

async function setupTracks() {
  const container = document.querySelector('#track-library');
  if (!container) return;
  let data;
  try {
    const response = await fetch('tracks.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error('Unavailable');
    data = await response.json();
    if (!Array.isArray(data.collections) || !data.collections.length) return;
  } catch { return; }
  const collections = data.collections.filter(c => typeof c.title === 'string' && Array.isArray(c.tracks)).map(c => ({...c, tracks: c.tracks.filter(t => typeof t.label === 'string' && safeMediaUrl(t.url))}));
  if (!collections.some(c => c.tracks.length)) return;
  container.replaceChildren();
  const controls = element('div', 'track-controls');
  const searchField = element('div', 'field');
  const searchLabel = element('label', '', 'Find a piece'); searchLabel.htmlFor = 'track-search';
  const search = element('input'); search.type = 'search'; search.id = 'track-search'; search.placeholder = 'Title, composer or recording';
  searchField.append(searchLabel, search);
  const voiceField = element('div', 'field');
  const voiceLabel = element('label', '', 'Voice part'); voiceLabel.htmlFor = 'voice-filter';
  const voice = element('select'); voice.id = 'voice-filter';
  for (const [value, title] of [['all','All voices'],['soprano','Soprano'],['alto','Alto'],['tenor','Tenor'],['bass','Bass']]) { const option = element('option', '', title); option.value = value; voice.append(option); }
  voiceField.append(voiceLabel, voice); controls.append(searchField);
  if (collections.some(c => c.tracks.some(t => t.voice && t.voice !== 'all'))) controls.append(voiceField);
  const count = element('p', 'track-count'); count.setAttribute('role', 'status');
  const results = element('div');
  container.append(controls, count, results);
  const render = () => {
    const filtered = filterTracks(collections, search.value, voice.value);
    results.replaceChildren();
    const total = filtered.reduce((sum, group) => sum + group.tracks.length, 0);
    count.textContent = `${total} listening resource${total === 1 ? '' : 's'} available`;
    if (!total) results.append(element('p', 'empty-filter', 'No recordings match. Try another title or voice part.'));
    for (const collection of filtered) {
      const group = element('section', 'track-group');
      group.append(element('h3', '', collection.title));
      if (collection.composer) group.append(element('p', 'track-composer', collection.composer));
      if (collection.note) group.append(element('p', 'track-note', collection.note));
      for (const track of collection.tracks) {
        const row = element('div', 'track-row'); row.append(element('p', '', track.label));
        const url = safeMediaUrl(track.url);
        const link = element('a', 'text-link', (track.action || 'Open recording') + ' ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `Open ${collection.title}: ${track.label} in a new tab`);
        row.append(link);
        if (track.audio === true) {
          const audio = element('audio', 'track-player'); audio.controls = true; audio.preload = 'none'; audio.src = url;
          audio.setAttribute('aria-label', `${collection.title}: ${track.label}`);
          audio.append(element('span', '', 'Use the recording link to listen.'));
          audio.addEventListener('play', () => { for (const other of document.querySelectorAll('audio')) if (other !== audio) other.pause(); });
          row.append(audio);
        }
        group.append(row);
      }
      results.append(group);
    }
  };
  search.addEventListener('input', render); voice.addEventListener('change', render); render();
}

if (typeof document !== 'undefined') { setupMenu(); setupForms(); setupTracks(); setupAnalytics(); }
