import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { buildEmail, validFormEndpoint, safeMediaUrl, filterTracks, validFormReply } from '../src/app.js';
import { siteConfig } from '../src/config.js';
const dist = resolve('dist');
const appScript = readdirSync(dist).find(f => /^app\.[a-f0-9]{12}\.js$/.test(f));
const pages = readdirSync(dist).filter(f => f.endsWith('.html'));

test('Every page has required landmarks, one H1, title, language and description', () => {
  assert.equal(pages.length, 8);
  for (const file of pages) {
    const html = readFileSync(resolve(dist, file),'utf8');
    assert.equal((html.match(/<h1[ >]/g)||[]).length, 1, file);
    for (const snippet of ['<html lang="en">','name="viewport"','name="description"','<title>','<main id="main">','Skip to content','<footer']) assert.ok(html.includes(snippet), `${file}: ${snippet}`);
    assert.ok(!html.match(/<img(?![^>]*\balt=)[^>]*>/), `Missing image alt in ${file}`);
  }
});

test('Every local link, image, style, script, srcset asset and anchor resolves', () => {
  for (const file of pages) {
    const html = readFileSync(resolve(dist,file),'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = match[1].replaceAll('&amp;','&');
      if (/^(https?:|mailto:)/.test(url)) continue;
      const [pathname, hash] = url.split('#');
      const target = resolve(dist,pathname || file);
      assert.ok(existsSync(target), `${file}: missing ${url}`);
      if (hash && target.endsWith('.html')) assert.ok(readFileSync(target,'utf8').includes(`id="${hash}"`), `${file}: missing anchor ${url}`);
    }
    for (const set of html.matchAll(/srcset="([^"]+)"/g)) for(const entry of set[1].split(',')) assert.ok(existsSync(resolve(dist,entry.trim().split(' ')[0])));
  }
});

test('Email preparation preserves text and cannot inject mail headers', () => {
  const result = buildEmail('contact',{name:'A & B',email:'choir@example.org',topic:'Music? & more',message:'Line 1\nLine 2 & title=#42'});
  const url = new URL(result);
  assert.equal(url.pathname, siteConfig.email);
  assert.equal(url.searchParams.get('subject'), 'Website inquiry: Music? & more');
  assert.ok(url.searchParams.get('body').includes('Line 1\nLine 2 & title=#42'));
  assert.equal([...url.searchParams.keys()].join(','), 'subject,body');
  assert.ok(buildEmail('newsletter',{email:'a@example.org'}).includes('Public%20concert%20updates%20signup%20request'));
});

test('Automatic endpoint and response are limited to the configured Google handler', () => {
  assert.equal(validFormEndpoint(siteConfig.formEndpoint),true);
  for (const url of ['http://script.google.com/macros/s/other/exec','https://evil.example/exec','https://script.google.com/macros/s/other/exec',siteConfig.formEndpoint+'?cc=other@example.org','https://user:secret@script.google.com/macros/s/other/exec','javascript:alert(1)']) assert.equal(validFormEndpoint(url),false,url);
  const reply = {type:'sqac-form-result',requestId:'test-id',ok:true};
  assert.equal(validFormReply('https://n-example-script.googleusercontent.com',reply,'test-id'),true);
  for (const origin of ['https://evil.example','https://script.googleusercontent.com.evil.example','http://n-example-script.googleusercontent.com']) assert.equal(validFormReply(origin,reply,'test-id'),false);
  assert.equal(validFormReply('https://n-example-script.googleusercontent.com',reply,'other-id'),false);
});

test('Media URLs reject script/data/insecure and credential-bearing links', () => {
  assert.equal(safeMediaUrl('https://example.org/track.mp3'),'https://example.org/track.mp3');
  for(const value of ['javascript:alert(1)','data:text/html,Hi','http://example.org','https://user:pass@example.org/file','relative.mp3','']) assert.equal(safeMediaUrl(value),null);
});

test('Rehearsal filtering handles voice, all-voice recordings, search, empty results without mutating source', () => {
  const tracks = [{title:'Alleluia',composer:'A Composer',tracks:[{label:'Soprano',voice:'soprano'},{label:'Alto',voice:'alto'},{label:'Full choir',voice:'all'}]}];
  assert.equal(filterTracks(tracks,' composer ','soprano')[0].tracks.length,2);
  assert.equal(filterTracks(tracks,'ALTO','all')[0].tracks.length,1);
  assert.equal(filterTracks(tracks,'missing','all').length,0);
  assert.equal(tracks[0].tracks.length,3);
});

test('Forms require consent and spam checks without provider email fields', () => {
  const html = readFileSync(resolve(dist,'connect.html'),'utf8');
  assert.equal((html.match(new RegExp(`data-delivery="${siteConfig.formsEnabled ? 'automatic' : 'email-app'}"`,'g'))||[]).length,1);
  assert.ok(html.includes('name="_honey"'));
  assert.ok(html.includes('data-spam-check'));
  assert.ok(html.includes('name="request_id"'));
  assert.ok(!html.includes('signup_record'));
  assert.ok(!html.includes('formsubmit.co'));
  assert.ok(!html.includes('name="_subject"'));
  assert.ok(html.includes('name="consent" type="checkbox"'));
  assert.ok(!readFileSync(resolve(dist,appScript),'utf8').includes('innerHTML'));
  const tracks = JSON.parse(readFileSync(resolve(dist,'tracks.json'),'utf8'));
  assert.deepEqual(tracks.collections.map(c => c.title), ['Hallelujah', 'Salvation Is Created', 'Let Thy Holy Presence', 'Nearer, Still Nearer', 'Guide Me, O Thou Great Jehovah', 'I Want Jesus to Walk With Me', 'Canticle of Praise', 'Do Not Pass Me By', 'Love Never Fails', 'I Am The Sunlight', 'We Are The Music Makers', 'Let It Be']);
  for (const removed of ['Make the most of your practice', 'Explore listening references and keep the music close.']) assert.ok(!readFileSync(resolve(dist,'rehearsal-room.html'),'utf8').includes(removed));
  const concert = readFileSync(resolve(dist,'concerts.html'),'utf8');
  assert.ok(concert.includes('datetime="2027-11-13"'));
  assert.ok(concert.includes('Marianne Forman'));
  for (const title of ['Cry Out and Shout: A Concert of Praise', '25th Anniversary Celebration', 'Come and Worship']) assert.ok(concert.includes(title));
  assert.ok(!concert.includes('undefined'));
  assert.equal((html.match(/<form /g)||[]).length,1);
  assert.ok(html.includes('value="member"'));
  assert.ok(html.includes('value="newsletter"'));
  assert.ok(!html.includes('FormSubmit'));
  assert.ok(!html.includes('Stay in the loop'));
  assert.equal(tracks.referenceOnly,true);
  for(const group of tracks.collections) for(const track of group.tracks) assert.ok(safeMediaUrl(track.url));
});

test('Static deployment output includes domain, sitemap, 404, CSS and local font licenses', () => {
  assert.equal(readFileSync(resolve(dist,'CNAME'),'utf8').trim(),'sqachoir.com');
  for(const file of ['.nojekyll','sitemap.xml','robots.txt','404.html','assets/social-card.png','assets/fonts/dm-sans-LICENSE.txt','assets/fonts/instrument-serif-LICENSE.txt']) assert.ok(existsSync(resolve(dist,file)),file);
  for(const url of readFileSync(resolve(dist,'fonts.css'),'utf8').matchAll(/url\(([^)]+)\)/g)) assert.ok(existsSync(resolve(dist,url[1])));
  assert.ok(statSync(resolve(dist,appScript)).size < 16000);
});
