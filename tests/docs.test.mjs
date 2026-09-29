import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEMO = 'https://bellaaaaxu.github.io/crumb/';
const DEPLOY = 'docs/DEPLOYMENT.md';
const FEEDBACK = 'https://github.com/bellaaaaxu/crumb/issues/new/choose';
const TAGLINE = 'Make appreciation something to keep.';
const SUMMARY = 'Open-source recognition and rewards for teams. Self-hosted, with data under your control.';

test('README local assets and links resolve', async () => {
  for (const file of ['README.md','README.zh-CN.md']) {
    const markdown=await readFile(file,'utf8');
    const targets=[...markdown.matchAll(/\]\(([^)]+)\)/g)].map(match=>match[1]);
    for (const target of targets) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      await access(resolve(dirname(file),decodeURIComponent(target.split('#')[0])));
    }
  }
});

test('both READMEs lead with the demo, the deployment guide and feedback', async () => {
  for (const file of ['README.md', 'README.zh-CN.md']) {
    const markdown = await readFile(file, 'utf8');
    const top = markdown.split('\n').slice(0, 20).join('\n');
    for (const link of [DEMO, DEPLOY, FEEDBACK]) assert.ok(top.includes(`](${link})`), `${file} links ${link} near the top`);
    assert.match(top, /<img [^>]*src="assets\/screenshots\/[a-z-]+\.png"[^>]*alt="[^"]+"/, `${file} opens with a real screenshot`);
  }
  assert.ok((await readFile('README.md', 'utf8')).includes(TAGLINE));
});

test('every image a README shows exists and has a description', async () => {
  for (const file of ['README.md', 'README.zh-CN.md']) {
    const markdown = await readFile(file, 'utf8');
    const images = [...markdown.matchAll(/<img ([^>]+)>/g)].map(match => match[1]);
    assert.ok(images.length >= 3, `${file} shows the member view, recognition and redemptions`);
    for (const attributes of images) {
      const src = /src="([^"]+)"/.exec(attributes)?.[1];
      assert.match(attributes, /alt="[^"]{12,}"/, `${file}: ${src} needs a real alt text`);
      await access(resolve(dirname(file), src));
    }
  }
});

test('every other document links only to files that exist', async () => {
  const files = ['CONTRIBUTING.md', 'docs/DEPLOYMENT.md', 'docs/OPERATIONS.md', 'docs/THEMES.md',
    'docs/VALIDATION.md', 'docs/RELEASE-CHECKLIST.md', '.github/pull_request_template.md'];
  for (const file of files) {
    const markdown = await readFile(file, 'utf8');
    for (const [, target] of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      await access(resolve(dirname(file), decodeURIComponent(target.split('#')[0])));
    }
  }
});

test('the public demo and its share card say the same thing as the README', async () => {
  const page = await readFile('index.html', 'utf8');
  const meta = name => new RegExp(`<meta (?:name|property)="${name}" content="([^"]+)"`).exec(page)?.[1];
  for (const name of ['og:title', 'twitter:title']) assert.match(meta(name) ?? '', /make appreciation something to keep/i, name);
  assert.match(/<title>([^<]+)<\/title>/.exec(page)?.[1] ?? '', /make appreciation something to keep/i, 'page title');
  for (const name of ['description', 'og:description', 'twitter:description']) assert.equal(meta(name), SUMMARY, name);
  assert.ok(page.includes(`href="https://github.com/bellaaaaxu/crumb/blob/main/${DEPLOY}"`), 'the demo links the deployment guide');
  assert.ok(page.includes(`href="${FEEDBACK}"`), 'the demo links project feedback');
  assert.match(page, /invented/i, 'the demo says its people and data are invented');
});

test('issue templates exist for bugs, ideas and usage stories, and ask for no personal data', async () => {
  for (const file of ['bug_report.md', 'feature_request.md', 'usage_feedback.md']) {
    // Windows checkouts may have CRLF line endings.
    const text = (await readFile(`.github/ISSUE_TEMPLATE/${file}`, 'utf8')).replace(/\r\n/g, '\n');
    assert.match(text, /^---\nname: .+\nabout: .+/m, file);
    assert.match(text, /real (names|people|employee)/i, `${file} warns against real people’s data`);
  }
});
