import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_REGION = 'us-east-1';

const getAwsPaths = (awsDir = join(homedir(), '.aws')) => ({
  awsDir,
  credentialsPath: join(awsDir, 'credentials'),
  configPath: join(awsDir, 'config'),
});

/**
 * Mask a sensitive credential string for safe display in the UI
 * @param {string} value
 * @returns {string}
 */
export const maskCredential = (value) => {
  if (!value) return '(not set)';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

/**
 * Validate an AWS profile name
 * @param {string} profileName
 * @returns {string} Trimmed profile name
 */
export const validateProfileName = (profileName) => {
  const trimmed = (profileName || '').trim();
  if (!trimmed) {
    throw new Error('Profile name is required.');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error('Profile name may only contain letters, numbers, dots, hyphens, and underscores.');
  }
  return trimmed;
};

const extractSectionKey = (headerLine, isConfig) => {
  const trimmed = headerLine.trim();
  if (isConfig) {
    if (trimmed === '[default]') {
      return 'default';
    }
    const profileMatch = trimmed.match(/^\[profile\s+([^\]]+)\]$/);
    if (profileMatch) {
      return profileMatch[1].trim();
    }
    return null;
  }

  const credMatch = trimmed.match(/^\[([^\]]+)\]$/);
  if (credMatch) {
    return credMatch[1].trim();
  }
  return null;
};

const formatSectionHeader = (profileName, isConfig) => {
  if (isConfig) {
    return profileName === 'default' ? '[default]' : `[profile ${profileName}]`;
  }
  return `[${profileName}]`;
};

const parseIni = (content, isConfig) => {
  const normalized = content.replace(/\r\n/g, '\n');
  const rawLines = normalized.split('\n');
  // Drop a single trailing empty line caused by final newline
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  const preamble = [];
  const sections = [];
  let currentSection = null;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      currentSection = {
        header: trimmed,
        key: extractSectionKey(trimmed, isConfig),
        lines: [],
      };
      sections.push(currentSection);
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  return { preamble, sections };
};

const parseKeyValues = (lines) => {
  const values = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.*)$/);
    if (match) {
      values[match[1]] = match[2].trim();
    }
  }
  return values;
};

const upsertSection = (doc, targetKey, newKey, updates, isConfig) => {
  const header = formatSectionHeader(newKey, isConfig);
  const existing = doc.sections.find((s) => s.key === targetKey);

  if (existing) {
    existing.header = header;
    existing.key = newKey;
    const handled = new Set();
    const nextLines = [];

    for (const line of existing.lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.*)$/);
      if (match && Object.prototype.hasOwnProperty.call(updates, match[1])) {
        const key = match[1];
        if (!handled.has(key)) {
          handled.add(key);
          if (updates[key] !== null && updates[key] !== undefined && updates[key] !== '') {
            nextLines.push(`${key} = ${updates[key]}`);
          }
        }
      } else {
        nextLines.push(line);
      }
    }

    // Find insertion index before trailing blank lines
    let insertIdx = nextLines.length;
    while (insertIdx > 0 && nextLines[insertIdx - 1].trim() === '') {
      insertIdx--;
    }

    const toInsert = [];
    for (const [key, val] of Object.entries(updates)) {
      if (!handled.has(key) && val !== null && val !== undefined && val !== '') {
        toInsert.push(`${key} = ${val}`);
      }
    }

    if (toInsert.length > 0) {
      nextLines.splice(insertIdx, 0, ...toInsert);
    }

    existing.lines = nextLines;
    return;
  }

  // Append new section
  const newLines = [];
  for (const [key, val] of Object.entries(updates)) {
    if (val !== null && val !== undefined && val !== '') {
      newLines.push(`${key} = ${val}`);
    }
  }

  doc.sections.push({
    header,
    key: newKey,
    lines: newLines,
  });
};

const removeSection = (doc, targetKey) => {
  doc.sections = doc.sections.filter((s) => s.key !== targetKey);
};

const serializeIni = (doc) => {
  const outputLines = [];

  const trimmedPreamble = [...doc.preamble];
  while (trimmedPreamble.length > 0 && trimmedPreamble[trimmedPreamble.length - 1].trim() === '') {
    trimmedPreamble.pop();
  }
  if (trimmedPreamble.length > 0) {
    outputLines.push(...trimmedPreamble);
  }

  for (const section of doc.sections) {
    if (outputLines.length > 0 && outputLines[outputLines.length - 1].trim() !== '') {
      outputLines.push('');
    }
    outputLines.push(section.header);

    const sectionLines = [...section.lines];
    while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1].trim() === '') {
      sectionLines.pop();
    }
    outputLines.push(...sectionLines);
  }

  if (outputLines.length === 0) {
    return '';
  }

  return `${outputLines.join('\n')}\n`;
};

const readIniFile = (filePath, isConfig) => {
  if (!existsSync(filePath)) {
    return { preamble: [], sections: [] };
  }
  const content = readFileSync(filePath, 'utf8');
  return parseIni(content, isConfig);
};

const writeIniFile = (awsDir, filePath, doc) => {
  if (!existsSync(awsDir)) {
    mkdirSync(awsDir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(filePath, serializeIni(doc), { encoding: 'utf8', mode: 0o600 });
};

/**
 * Parse AWS config file and extract region per profile
 * @param {string} [awsDir]
 * @returns {Object} Map of profile name to region
 */
const getProfileRegions = (awsDir) => {
  const { configPath } = getAwsPaths(awsDir);
  const regions = {};

  if (!existsSync(configPath)) {
    return regions;
  }

  try {
    const doc = readIniFile(configPath, true);
    for (const section of doc.sections) {
      if (!section.key) continue;
      const kv = parseKeyValues(section.lines);
      if (kv.region) {
        regions[section.key] = kv.region;
      }
    }
  } catch (err) {
    // Silently ignore config parse errors
  }

  return regions;
};

/**
 * Parse AWS credentials file and extract profile objects
 * @param {string} [awsDir]
 * @returns {Array} Array of AWS account profile objects
 */
export const getAwsProfiles = (awsDir) => {
  const { credentialsPath } = getAwsPaths(awsDir);

  if (!existsSync(credentialsPath)) {
    return [];
  }

  const profileRegions = getProfileRegions(awsDir);

  try {
    const doc = readIniFile(credentialsPath, false);
    const profiles = [];

    for (const section of doc.sections) {
      if (!section.key) continue;
      const profileName = section.key;
      const kv = parseKeyValues(section.lines);
      const region = profileRegions[profileName] || kv.region || DEFAULT_REGION;

      profiles.push({
        id: `account-${profiles.length + 1}`,
        name: profileName.charAt(0).toUpperCase() + profileName.slice(1),
        profile: profileName,
        region,
        accessKeyId: kv.aws_access_key_id || '',
        secretAccessKey: kv.aws_secret_access_key || '',
        sessionToken: kv.aws_session_token || '',
      });
    }

    return profiles;
  } catch (err) {
    console.error('Error reading AWS credentials:', err);
    return [];
  }
};

/**
 * Add a new AWS account profile to ~/.aws/credentials and ~/.aws/config
 * @param {Object} accountData
 * @param {string} [awsDir]
 * @returns {Array} Updated list of AWS account profiles
 */
export const addAwsProfile = (accountData, awsDir) => {
  const profileName = validateProfileName(accountData.profile);
  const accessKeyId = (accountData.accessKeyId || '').trim();
  const secretAccessKey = (accountData.secretAccessKey || '').trim();
  const region = (accountData.region || '').trim() || DEFAULT_REGION;
  const sessionToken = (accountData.sessionToken || '').trim();

  if (!accessKeyId) {
    throw new Error('Access Key ID is required.');
  }
  if (!secretAccessKey) {
    throw new Error('Secret Access Key is required.');
  }

  const paths = getAwsPaths(awsDir);
  const credDoc = readIniFile(paths.credentialsPath, false);

  if (credDoc.sections.some((s) => s.key === profileName)) {
    throw new Error(`Profile "${profileName}" already exists.`);
  }

  upsertSection(
    credDoc,
    profileName,
    profileName,
    {
      aws_access_key_id: accessKeyId,
      aws_secret_access_key: secretAccessKey,
      aws_session_token: sessionToken || null,
    },
    false
  );
  writeIniFile(paths.awsDir, paths.credentialsPath, credDoc);

  const configDoc = readIniFile(paths.configPath, true);
  upsertSection(configDoc, profileName, profileName, { region }, true);
  writeIniFile(paths.awsDir, paths.configPath, configDoc);

  return getAwsProfiles(awsDir);
};

/**
 * Update an existing AWS account profile in ~/.aws/credentials and ~/.aws/config
 * @param {string} originalProfileName
 * @param {Object} accountData
 * @param {string} [awsDir]
 * @returns {Array} Updated list of AWS account profiles
 */
export const updateAwsProfile = (originalProfileName, accountData, awsDir) => {
  const newProfileName = validateProfileName(accountData.profile);
  const accessKeyId = (accountData.accessKeyId || '').trim();
  const secretAccessKey = (accountData.secretAccessKey || '').trim();
  const region = (accountData.region || '').trim() || DEFAULT_REGION;
  const sessionToken = (accountData.sessionToken || '').trim();

  if (!accessKeyId) {
    throw new Error('Access Key ID is required.');
  }

  const paths = getAwsPaths(awsDir);
  const credDoc = readIniFile(paths.credentialsPath, false);
  const existingSection = credDoc.sections.find((s) => s.key === originalProfileName);

  if (!existingSection) {
    throw new Error(`Profile "${originalProfileName}" not found.`);
  }

  if (
    newProfileName !== originalProfileName &&
    credDoc.sections.some((s) => s.key === newProfileName)
  ) {
    throw new Error(`Profile "${newProfileName}" already exists.`);
  }

  const credUpdates = {
    aws_access_key_id: accessKeyId,
    aws_session_token: sessionToken || null,
  };
  // Only overwrite secret access key if the user provided a new one
  if (secretAccessKey) {
    credUpdates.aws_secret_access_key = secretAccessKey;
  }

  upsertSection(credDoc, originalProfileName, newProfileName, credUpdates, false);
  writeIniFile(paths.awsDir, paths.credentialsPath, credDoc);

  const configDoc = readIniFile(paths.configPath, true);
  upsertSection(configDoc, originalProfileName, newProfileName, { region }, true);
  writeIniFile(paths.awsDir, paths.configPath, configDoc);

  return getAwsProfiles(awsDir);
};

/**
 * Remove an AWS account profile from ~/.aws/credentials and ~/.aws/config
 * @param {string} profileName
 * @param {string} [awsDir]
 * @returns {Array} Updated list of AWS account profiles
 */
export const removeAwsProfile = (profileName, awsDir) => {
  const paths = getAwsPaths(awsDir);

  if (existsSync(paths.credentialsPath)) {
    const credDoc = readIniFile(paths.credentialsPath, false);
    removeSection(credDoc, profileName);
    writeIniFile(paths.awsDir, paths.credentialsPath, credDoc);
  }

  if (existsSync(paths.configPath)) {
    const configDoc = readIniFile(paths.configPath, true);
    removeSection(configDoc, profileName);
    writeIniFile(paths.awsDir, paths.configPath, configDoc);
  }

  return getAwsProfiles(awsDir);
};
