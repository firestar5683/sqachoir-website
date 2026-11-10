import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {siteConfig} from '../src/config.js';
import {readAnalyticsChoice, analyticsPage} from '../src/analytics.js';

const source = readFileSync(new URL('../src/analytics.js',import.meta.url),'utf8');
function browser(choice) {
  const scripts = [], stored = {};
  if (choice) stored['sqac-analytics-choice'] = JSON.stringify({value:choice, expires:Date.now()+86400000});
  const document = {title:'Singing Quakers Alumni Choir',referrer:'https://search.example/search?q=private@example.org',head:{append:script=>scripts.push(script)},createElement:()=>({})};
  const window = {location:{origin:'https://sqachoir.com',pathname:'/connect.html',search:'?email=private@example.org',hash:'#private'},localStorage:{getItem:key=>stored[key] || null}};
  const context = vm.createContext({document,window,Date,URL,siteConfig:{analyticsMeasurementId:'G-TEST1234'}});
  vm.runInContext(source.replace(/^import .*;\n/m,'').replace(/^export /gm,''),context);
  context.setupAnalytics();
  return {scripts,window};
}

test('Analytics consent expires safely and page metadata strips private URL details',()=>{
  const storage = value=>({getItem:()=>value});
  assert.equal(readAnalyticsChoice(storage('invalid')),null);
  assert.equal(readAnalyticsChoice(storage(JSON.stringify({value:'granted',expires:500})),1000),null);
  assert.equal(readAnalyticsChoice(storage(JSON.stringify({value:'granted',expires:2000})),1000),'granted');
  assert.equal(readAnalyticsChoice({getItem:()=>{throw Error('Blocked storage');}}),null);
  assert.deepEqual(analyticsPage({origin:'https://sqachoir.com',pathname:'/connect.html',search:'?email=private@example.org',hash:'#private'},'https://search.example/search?q=private@example.org'),{page_location:'https://sqachoir.com/connect.html',page_referrer:'https://search.example'});
  assert.equal(analyticsPage({origin:'https://sqachoir.com',pathname:'/private@example.org'},'javascript:alert(1)').page_location,'https://sqachoir.com/404.html');
  assert.equal(analyticsPage({origin:'https://sqachoir.com',pathname:'/'},'invalid').page_referrer,'');
});

test('Analytics starts automatically without a banner and honors existing opt-outs',()=>{
  const h=browser();assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-TEST1234');
  const commands=h.window.dataLayer.map(x=>Array.from(x));const config=commands.find(x=>x[0]==='config');
  assert.equal(config[2].allow_google_signals,false);assert.equal(config[2].allow_ad_personalization_signals,false);assert.equal(config[2].page_location,'https://sqachoir.com/connect.html');assert.equal(config[2].page_referrer,'https://search.example');
  assert.ok(commands.filter(x=>x[0]==='consent').every(x=>x[2].ad_storage==='denied'&&x[2].ad_user_data==='denied'&&x[2].ad_personalization==='denied'));
  assert.ok(!JSON.stringify(commands).includes('private@example.org'));
  assert.equal(browser('denied').scripts.length,0);assert.equal(browser('granted').scripts.length,1);
});


test('Every published page omits the banner and retains Analytics and accurate privacy information',()=>{
  assert.match(siteConfig.analyticsMeasurementId,/^G-[A-Z0-9]+$/);
  const pages=['index.html','our-story.html','concerts.html','rehearsal-room.html','connect.html','privacy.html','thank-you.html','404.html'];
  for (const page of pages) {
    const html=readFileSync(new URL('../dist/'+page,import.meta.url),'utf8');
    assert.ok(!html.includes('data-analytics-settings'),page);
    assert.ok(!html.includes('data-analytics-choice'),page);
    assert.ok(!html.includes('Allow analytics'),page);
    assert.ok(!html.includes('Cookie choices'),page);
    assert.ok(!html.includes('googletagmanager.com/gtag/js'),page);
  }
  const privacy=readFileSync(new URL('../dist/privacy.html',import.meta.url),'utf8');
  assert.ok(privacy.includes('Advertising features are disabled'));
  assert.ok(privacy.includes('This website uses Google Analytics'));
  assert.ok(privacy.includes('opt-out browser add-on'));
  assert.ok(readFileSync(new URL('../src/app.js',import.meta.url),'utf8').includes('setupAnalytics();'));
  assert.ok(readFileSync(new URL('../dist/analytics.js',import.meta.url),'utf8').includes('googletagmanager.com/gtag/js'));
  assert.ok(!privacy.includes('does not use advertising trackers or analytics cookies'));
});
