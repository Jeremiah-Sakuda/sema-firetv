import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

function check(files, tracked = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-source-check-'));
  try {
    fs.mkdirSync(path.join(root, 'tools'));
    fs.copyFileSync('tools/check-repo.js', path.join(root, 'tools/check-repo.js'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({type: 'module'}));
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
      fs.writeFileSync(path.join(root, name), text);
    }
    execFileSync('git', ['init', '-q'], {cwd: root});
    if (tracked.length) execFileSync('git', ['add', '--force', '--', ...tracked], {cwd: root});
    return spawnSync(process.execPath, ['tools/check-repo.js'], {cwd: root, encoding: 'utf8'});
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}

test('source check allows public engineering results and official judging requirements', () => {
  const result = check({'README.md': '# App\nTests pass. Judges can run the app.\n', 'evidence.json': '{"tests": 3, "passed": true}'});
  assert.equal(result.status, 0, result.stderr);
});

test('source check rejects private directories and historical plans even before staging', () => {
  for (const file of ['docs/planning/notes.md', 'docs/submission/draft.md', 'docs/PLAN-TO-SUBMISSION.md']) {
    const result = check({[file]: 'Internal notes'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /local-only material/);
  }
});

test('source check rejects internal report structure under a generic filename', () => {
  for (const [file, text] of [
    ['report.json', JSON.stringify({criterionMeans: {}})],
    ['src/app.js', '// Oct 5 ' + 'panel'],
    ['tests/ui.test.js', '// panel ' + 'fixes'],
  ]) {
    const result = check({[file]: text});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /internal evaluation material/);
  }
  const account = check({'evidence.json': JSON.stringify({['aws' + 'Authentication']: 'temporary session verified'})});
  assert.equal(account.status, 1);
  assert.match(account.stderr, /account-session operational notes/);
});

test('ignoring a previously staged private file does not make it publishable', () => {
  const result = check({'.gitignore': 'docs/planning/\n', 'docs/planning/notes.md': 'Internal notes'}, ['docs/planning/notes.md']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /local-only material/);
});
