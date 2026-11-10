import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {siteConfig} from '../src/config.js';
import {readAnalyticsChoice, analyticsPage} from '../src/analytics.js';

const source = readFileSync(new URL('../src/analytics.js',import.meta.url),'utf8');
function browser(choice) {
  const handlers = {}, scripts = [], deletedCookies = [], stored = {};
  const state = {reloads:0, focused:0};
  if (choice) stored['sqac-analytics-choice'] = JSON.stringify({value:choice, expires:Date.now()+86400000});
  const control = name => ({addEventListener:(_,fn)=>handlers[name]=fn,focus:()=>state.focused++});
  const panel = {hidden:true, querySelector:selector=>control(selector)};
  const settings = control('settings');
  const storage = {getItem:key=>stored[key] || null,setItem:(key,value)=>stored[key]=value};
  const document = {title:'Singing Quakers Alumni Choir',referrer:'https://search.example/search?q=private@example.org',head:{append:script=>scripts.push(script)},createElement:()=>({}),querySelector:selector=>selector==='[data-analytics-choice]'?panel:settings};
  Object.defineProperty(document,'cookie',{get:()=> '_ga=one; _ga_TEST=two; choir_preference=keep',set:value=>deletedCookies.push(value)});
  const window = {location:{origin:'https://sqachoir.com',hostname:'sqachoir.com',pathname:'/connect.html',search:'?email=private@example.org',hash:'#private',reload:()=>state.reloads++},localStorage:storage};
  const context = vm.createContext({document,window,Date,URL,siteConfig:{analyticsMeasurementId:'G-TEST1234'}});
  vm.runInContext(source.replace(/^import .*;\n/m,'').replace(/^export /gm,''),context);
  context.setupAnalytics();
  return {handlers,scripts,window,stored,panel,state,deletedCookies};
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

test('Analytics never loads before consent; accept loads once and withdrawal disables it',()=>{
  const h=browser();assert.equal(h.panel.hidden,false);assert.equal(h.scripts.length,0);assert.equal(h.window.dataLayer,undefined);
  h.handlers['[data-analytics-decline]']();assert.equal(h.scripts.length,0);assert.equal(h.panel.hidden,true);assert.equal(JSON.parse(h.stored['sqac-analytics-choice']).value,'denied');
  h.handlers.settings();assert.equal(h.panel.hidden,false);
  h.handlers['[data-analytics-allow]']();h.handlers['[data-analytics-allow]']();assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-TEST1234');
  const commands=h.window.dataLayer.map(x=>Array.from(x));const config=commands.find(x=>x[0]==='config');
  assert.equal(config[2].allow_google_signals,false);assert.equal(config[2].allow_ad_personalization_signals,false);assert.equal(config[2].page_location,'https://sqachoir.com/connect.html');assert.equal(config[2].page_referrer,'https://search.example');
  assert.ok(commands.filter(x=>x[0]==='consent').every(x=>x[2].ad_storage==='denied'&&x[2].ad_user_data==='denied'&&x[2].ad_personalization==='denied'));
  assert.ok(!JSON.stringify(commands).includes('private@example.org'));
  h.handlers['[data-analytics-decline]']();assert.equal(h.window['ga-disable-G-TEST1234'],true);assert.equal(h.state.reloads,1);assert.ok(h.deletedCookies.every(x=>!x.startsWith('choir_preference=')));
  assert.equal(browser('denied').scripts.length,0);assert.equal(browser('denied').panel.hidden,true);assert.equal(browser('granted').scripts.length,1);
});


test('Every published page offers analytics choices and accurate privacy information',()=>{
  assert.match(siteConfig.analyticsMeasurementId,/^G-[A-Z0-9]+$/);
  const pages=['index.html','our-story.html','concerts.html','rehearsal-room.html','connect.html','privacy.html','thank-you.html','404.html'];
  for (const page of pages) {
    const html=readFileSync(new URL('../dist/'+page,import.meta.url),'utf8');
    assert.ok(html.includes('data-analytics-settings'),page);
    assert.ok(html.includes('data-analytics-choice hidden'),page);
    assert.ok(html.includes('data-analytics-allow'),page);
    assert.ok(html.includes('data-analytics-decline'),page);
    assert.ok(!html.includes('googletagmanager.com/gtag/js'),page);
  }
  const privacy=readFileSync(new URL('../dist/privacy.html',import.meta.url),'utf8');
  assert.ok(privacy.includes('Advertising features are disabled'));
  assert.ok(!privacy.includes('does not use advertising trackers or analytics cookies'));
});
