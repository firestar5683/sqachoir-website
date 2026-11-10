import { siteConfig } from './config.js';

export function buildEmail(type, values, email = siteConfig.email) {
  const newsletter = type === 'newsletter';
  const subject = newsletter ? 'Newsletter signup request' : `Website inquiry: ${values.topic || 'General question'}`;
  const body = newsletter
    ? `Please add me to the Singing Quakers Alumni Choir mailing list.\n\nName: ${values.name || '(not provided)'}\nEmail: ${values.email}\n\nI agree to receive concert announcements and choir news by email.`
    : `Name: ${values.name}\nEmail: ${values.email}\n\n${values.message}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function validFormEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'formsubmit.co' && url.pathname === '/' + siteConfig.email && !url.username && !url.password && !url.search && !url.hash;
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

function setupForms() {
  for (const form of document.querySelectorAll('[data-form]')) {
    const type = form.dataset.form;
    const automatic = form.dataset.delivery === 'automatic';
    const button = form.querySelector('button[type=submit]');
    const status = form.querySelector('.form-status');
    const label = form.querySelector('[data-submit-label]');
    const originalLabel = label.textContent;
    window.addEventListener('pageshow', () => { button.disabled = false; label.textContent = originalLabel; });
    form.addEventListener('submit', event => {
      if (button.disabled || !form.reportValidity()) { event.preventDefault(); return; }
      const values = Object.fromEntries(new FormData(form));
      if (values._honey) { event.preventDefault(); return; }
      if (automatic && validFormEndpoint(form.action)) {
        button.disabled = true;
        label.textContent = 'Continuing to secure submission…';
        return;
      }
      event.preventDefault();
      window.location.href = buildEmail(type, values);
      status.textContent = 'Your email app should open with the details filled in. Press Send there to deliver your request. If it doesn’t open, email ' + siteConfig.email + '.';
    });
  }
  for (const link of document.querySelectorAll('[data-topic]')) link.addEventListener('click', () => {
    const select = document.querySelector('#contact-topic');
    if (select) select.value = link.dataset.topic;
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
    const response = await fetch('tracks.json');
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

if (typeof document !== 'undefined') { setupMenu(); setupForms(); setupTracks(); }
