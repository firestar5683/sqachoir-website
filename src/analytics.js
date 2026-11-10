import { siteConfig } from './config.js';

const preferenceKey = 'sqac-analytics-choice';
const preferenceLifetime = 180 * 86400000;

export function readAnalyticsChoice(storage, now = Date.now()) {
  try {
    const choice = JSON.parse(storage.getItem(preferenceKey));
    return choice && ['granted', 'denied'].includes(choice.value) && choice.expires > now && choice.expires <= now + preferenceLifetime ? choice.value : null;
  } catch { return null; }
}

export function analyticsPage(location, referrer) {
  let source = '';
  try { const url = new URL(referrer); if (['http:', 'https:'].includes(url.protocol)) source = url.origin; } catch {}
  const pages = ['/', '/index.html', '/our-story.html', '/concerts.html', '/rehearsal-room.html', '/connect.html', '/privacy.html', '/thank-you.html', '/404.html'];
  const path = pages.includes(location.pathname) ? location.pathname : '/404.html';
  return {page_location:location.origin + path, page_referrer:source};
}

export function setupAnalytics() {
  const id = siteConfig.analyticsMeasurementId;
  if (!/^G-[A-Z0-9]+$/.test(id || '')) return;
  const choice = document.querySelector('[data-analytics-choice]');
  const preferences = document.querySelector('[data-analytics-settings]');
  if (!choice || !preferences) return;
  let started = false, openedFromFooter = false;
  const saved = () => { try { return readAnalyticsChoice(window.localStorage); } catch { return null; } };
  const remember = value => {
    try { window.localStorage.setItem(preferenceKey, JSON.stringify({value, expires:Date.now() + preferenceLifetime})); } catch {}
  };
  const start = () => {
    if (started) return;
    started = true;
    window['ga-disable-' + id] = false;
    window.dataLayer = window.dataLayer || [];
    const gtag = function() { window.dataLayer.push(arguments); };
    gtag('consent', 'default', {analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
    gtag('consent', 'update', {analytics_storage:'granted', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
    gtag('js', new Date());
    gtag('config', id, {...analyticsPage(window.location, document.referrer), page_title:document.title, send_page_view:true, allow_google_signals:false, allow_ad_personalization_signals:false, cookie_expires:preferenceLifetime / 1000, cookie_update:false});
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.append(script);
  };
  const close = () => {
    choice.hidden = true;
    if (openedFromFooter) preferences.focus({preventScroll:true});
  };
  preferences.addEventListener('click', () => {
    openedFromFooter = true;
    choice.hidden = false;
    choice.querySelector('[data-analytics-allow]').focus({preventScroll:true});
  });
  choice.querySelector('[data-analytics-allow]').addEventListener('click', () => {
    remember('granted'); close(); start();
  });
  choice.querySelector('[data-analytics-decline]').addEventListener('click', () => {
    remember('denied');
    window['ga-disable-' + id] = true;
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', window.location.hostname, '.' + window.location.hostname]) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : '');
      }
    }
    close();
    if (started) window.location.reload();
  });
  if (saved() === 'granted') start();
  else if (saved() !== 'denied') choice.hidden = false;
}
