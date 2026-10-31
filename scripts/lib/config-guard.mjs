// Pure checks for supabase/config.toml. No file or network access, so every rule is unit tested.
// The tracked config is what `supabase config push` sends to a hosted project, so it must hold no local-only data.

const PLACEHOLDER = /^(placeholder|changeme|change-me|todo|xxx+|your[-_ ].*|dummy|fake|test)$/i;
const ENV_REF = /^env\([A-Za-z_][A-Za-z0-9_]*\)$/;
const TWILIO_TABLES = ['auth.sms.twilio', 'auth.sms.twilio_verify'];
const TWILIO_KEYS = ['account_sid', 'message_service_sid', 'auth_token'];
// A phone-number key with a short numeric code is a static test OTP wherever it appears in a TOML file.
const TEST_OTP_LINE = /^\s*"?\+?\d{10,15}"?\s*=\s*"\d{4,8}"/;

function readValue(raw) {
  const text = raw.trim();
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    return end === -1 ? text.slice(1) : text.slice(1, end);
  }
  return text.split('#')[0].trim();
}

/** Minimal TOML reader: returns { table name -> { key -> raw value } } for uncommented lines. */
export function parseTables(text) {
  const tables = { '': {} };
  let current = '';
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(#.*)?$/);
    if (header) {
      current = header[1].trim();
      tables[current] ??= {};
      continue;
    }
    const pair = line.match(/^\s*([A-Za-z0-9_."-]+)\s*=\s*(.*)$/);
    if (pair) tables[current][pair[1]] = readValue(pair[2]);
  }
  return tables;
}

/** Problems that make a config unsafe to push to any hosted project. */
export function checkSharedConfig(text) {
  const issues = [];
  const tables = parseTables(text);

  const otp = tables['auth.sms.test_otp'];
  if (otp && Object.keys(otp).length > 0) {
    issues.push({ code: 'TEST_OTP', message: `[auth.sms.test_otp] has ${Object.keys(otp).length} static test OTP(s); they belong only in the generated .supabase-local config` });
  } else if (text.split(/\r?\n/).some((line) => TEST_OTP_LINE.test(line))) {
    issues.push({ code: 'TEST_OTP', message: 'a phone number mapped to a static OTP code is present in the shared config' });
  }

  for (const name of TWILIO_TABLES) {
    const table = tables[name];
    if (!table) continue;
    const enabled = table.enabled === 'true';
    for (const key of TWILIO_KEYS) {
      const value = table[key];
      if (value === undefined || value === '') {
        if (enabled) issues.push({ code: 'MISSING_CREDENTIAL', message: `[${name}] is enabled but ${key} is empty; use env(...)` });
      } else if (PLACEHOLDER.test(value)) {
        issues.push({ code: 'PLACEHOLDER_CREDENTIAL', message: `[${name}] ${key} is the placeholder "${value}"` });
      } else if (!ENV_REF.test(value)) {
        issues.push({ code: 'LITERAL_CREDENTIAL', message: `[${name}] ${key} is a literal value; use env(NAME)` });
      }
    }
  }
  return issues;
}

/** Extra checks for the guarded hosted push (see scripts/supabase-config-push.mjs). */
export function checkPushTarget({ targetName, targets, linkedRef, cliVersion, config, env }) {
  const issues = [...checkSharedConfig(config)];
  const target = targets.targets?.[targetName];
  if (!target) {
    issues.push({ code: 'UNKNOWN_TARGET', message: `"${targetName}" is not in scripts/supabase-targets.json` });
    return issues;
  }
  if (!target.ref) issues.push({ code: 'NO_REF', message: `target "${targetName}" has no project ref yet` });
  if (target.ref && (targets.blockedRefs ?? []).includes(target.ref)) issues.push({ code: 'BLOCKED_REF', message: 'target ref is on the blocked list' });
  if (target.ref && linkedRef !== target.ref) issues.push({ code: 'WRONG_PROJECT', message: `linked project is "${linkedRef ?? 'none'}", target "${targetName}" is "${target.ref}"` });
  if (cliVersion !== targets.cliVersion) issues.push({ code: 'CLI_VERSION', message: `Supabase CLI is ${cliVersion}, the project is pinned to ${targets.cliVersion}` });

  if (target.requireTwilio) {
    const twilio = parseTables(config)['auth.sms.twilio'] ?? {};
    if (twilio.enabled !== 'true') issues.push({ code: 'TWILIO_DISABLED', message: `target "${targetName}" requires [auth.sms.twilio] enabled = true` });
    for (const key of TWILIO_KEYS) {
      const ref = (twilio[key] ?? '').match(/^env\(([A-Za-z_][A-Za-z0-9_]*)\)$/);
      const value = ref ? env[ref[1]] : undefined;
      if (!ref) continue; // already reported as missing or literal above
      if (!value) issues.push({ code: 'MISSING_PRODUCTION_CREDENTIAL', message: `${ref[1]} is not set for target "${targetName}"` });
      else if (PLACEHOLDER.test(value)) issues.push({ code: 'PLACEHOLDER_CREDENTIAL', message: `${ref[1]} holds a placeholder value` });
    }
  }
  return issues;
}
