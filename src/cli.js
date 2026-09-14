'use strict';

// Argument parsing and command dispatch. roadmap-live.js is the thin entry
// that calls main().

const path = require('path');
const i18n = require('./i18n');
const { loadRoadmap, displayName, warnings, stripControls, LARGE_FILE_BYTES, TAGLINE_MAX } = require('./validate');

const DEFAULT_FILE = 'roadmap.json';
const DEFAULT_PORT = 4242;
const COMMANDS = ['sync', 'render', 'init', 'auth', 'doctor'];

function parseArgs(argv) {
  const opts = {
    command: null,
    file: DEFAULT_FILE,
    port: String(DEFAULT_PORT),
    check: false,
    help: false,
    repo: null,
    dryRun: false,
    apply: false,
    provider: null,
    public: false,
    logout: false,
    out: null,
    theme: null,
    mode: null,
    key: null,
    noBootstrap: false,
  };
  const takeValue = (i, name) => {
    if (argv[i + 1] === undefined) throw new Error(`${name} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const name = a.startsWith('--') && eq > 0 ? a.slice(0, eq) : a;
    const inline = a.startsWith('--') && eq > 0 ? a.slice(eq + 1) : undefined;
    const value = () => (inline !== undefined ? inline : takeValue(i++, name));
    if (name === '--check') opts.check = true;
    else if (name === '-h' || name === '--help') opts.help = true;
    else if (name === '--port') opts.port = value();
    else if (name === '--repo') opts.repo = value();
    else if (name === '--dry-run') opts.dryRun = true;
    else if (name === '--apply') opts.apply = true;
    else if (name === '--provider') opts.provider = value();
    else if (name === '--public') opts.public = true;
    else if (name === '--logout') opts.logout = true;
    else if (name === '--out') opts.out = value();
    else if (name === '--theme') opts.theme = value();
    else if (name === '--mode') opts.mode = value();
    else if (name === '--key') opts.key = value();
    else if (name === '--no-bootstrap') opts.noBootstrap = true;
    else if (name.startsWith('-')) throw Object.assign(new Error(`unknown option: ${name}`), { key: 'cli.unknownOption', params: { option: name } });
    else if (opts.command === null && COMMANDS.includes(a) && opts.file === DEFAULT_FILE) opts.command = a;
    else opts.file = a;
  }
  const port = Number(opts.port);
  if (opts.port === undefined || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw Object.assign(new Error(`invalid port: ${opts.port}`), { key: 'cli.invalidPort', params: { port: opts.port } });
  }
  if (opts.mode !== null && !['light', 'dark'].includes(opts.mode)) {
    throw Object.assign(new Error(`invalid mode: ${opts.mode}`), { key: 'cli.unknownOption', params: { option: `--mode ${opts.mode}` } });
  }
  opts.port = port;
  opts.file = path.resolve(opts.file);
  return opts;
}

function runCheck(file, env = process.env) {
  const result = loadRoadmap(file);
  const t = i18n.cliT(result.data, env);
  const name = displayName(file);
  if (result.ok) {
    const active = result.data.items.filter((it) => it.status === 'active').length;
    const done = result.data.items.filter((it) => it.status === 'done').length;
    console.log(t('cli.checkOk', { file: name, milestones: result.data.milestones.length, items: result.data.items.length, done, active }));
    if (active > 1) console.log(t('cli.checkParallel', { n: active }));
    const bytes = Buffer.byteLength(result.raw, 'utf8');
    if (bytes > LARGE_FILE_BYTES) console.log(t('cli.checkLarge', { file: name, kb: Math.round(bytes / 1024) }));
    for (const w of warnings(result.data)) {
      // Ids come from the file; strip control characters so a stray newline or
      // escape sequence cannot forge or rewrite terminal lines.
      const item = w.item === undefined ? undefined : stripControls(w.item);
      if (w.key === 'taglineLong') console.log(t('cli.checkTagline', { length: w.length, max: TAGLINE_MAX }));
      else if (w.key === 'goalDoneUnderTarget') console.log(t('cli.checkGoalDone', { item, current: w.current, target: w.target }));
      else if (w.key === 'goalReachedButOpen') console.log(t('cli.checkGoalReached', { item, current: w.current, target: w.target }));
    }
    return 0;
  }
  console.error(t('cli.checkProblems', { file: name, n: result.errors.length }));
  for (const err of result.errors) console.error(`  - ${err}`);
  return 1;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const t = i18n.cliT(null, env);
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    const msg = e.key ? t(e.key, e.params) : e.message;
    console.error(`roadmap-live: ${msg}\n\n${t('cli.usage')}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(t('cli.usage'));
    return 0;
  }
  if (opts.check) process.exit(runCheck(opts.file, env));

  let code = 0;
  switch (opts.command) {
    case 'sync':
      code = await require('./sync').runSync(opts, env);
      break;
    case 'render':
      code = require('./render').runRender(opts, env);
      break;
    case 'init':
      code = await require('./init').runInit(opts, env);
      break;
    case 'auth':
      code = await require('./auth').runAuth(opts, env);
      break;
    case 'doctor':
      code = await require('./doctor').runDoctor(opts, env);
      break;
    default:
      require('./server').startServer(opts, env);
      return undefined;
  }
  process.exit(code);
  return code;
}

module.exports = { parseArgs, runCheck, main, DEFAULT_FILE, DEFAULT_PORT, COMMANDS };
