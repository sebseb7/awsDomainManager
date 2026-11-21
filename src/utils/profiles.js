import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_REGION = 'us-east-1';
const PBKDF2_ITERATIONS = 100000;
const VAULT_VERSION = 1;
const KDF_NAME = 'pbkdf2-hmac-sha256';
export const VAULT_DISPLAY_PATH = '~/.aws-domain-manager/auth.enc.json';

let sessionPin = null;
let sessionCache = null; // { pin, vaultMac, profiles }

const readLegacyAwsConfigRegions = () => {
  const regions = {};
  let defaultRegion = null;
  try {
    const configPath = join(homedir(), '.aws', 'config');
    if (!existsSync(configPath)) return { regions, defaultRegion };
    const content = readFileSync(configPath, 'utf8');
    let currentProfile = null;
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;
      if (line.startsWith('[') && line.endsWith(']')) {
        const inner = line.slice(1, -1).trim();
        if (inner === 'default') {
          currentProfile = 'default';
        } else {
          const match = inner.match(/^profile\s+(.+)$/);
          currentProfile = match ? match[1].trim() : null;
        }
        continue;
      }
      const kv = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.*)$/);
      if (currentProfile && kv && kv[1] === 'region') {
        const reg = kv[2].trim();
        if (reg) {
          if (currentProfile === 'default') defaultRegion = reg;
          regions[currentProfile] = reg;
        }
      }
    }
  } catch {
    // ignore
  }
  return { regions, defaultRegion };
};

const readLegacyAwsCredentials = () => {
  const profiles = [];
  try {
    const credPath = join(homedir(), '.aws', 'credentials');
    if (!existsSync(credPath)) return profiles;
    const content = readFileSync(credPath, 'utf8');
    const { regions: configRegions, defaultRegion } = readLegacyAwsConfigRegions();
    let currentName = null;
    let currentKv = {};

    const flush = () => {
      if (currentName) {
        const ak = currentKv.aws_access_key_id || '';
        const sk = currentKv.aws_secret_access_key || '';
        if (ak && sk) {
          const region =
            configRegions[currentName] || currentKv.region || defaultRegion || DEFAULT_REGION;
          profiles.push({
            profile: currentName,
            region,
            accessKeyId: ak,
            secretAccessKey: sk,
            sessionToken: currentKv.aws_session_token || '',
          });
        }
      }
    };

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;
      if (line.startsWith('[') && line.endsWith(']') && line.length >= 3) {
        flush();
        currentName = line.slice(1, -1).trim() || null;
        currentKv = {};
        continue;
      }
      const kv = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.*)$/);
      if (kv) {
        currentKv[kv[1]] = kv[2].trim();
      }
    }
    flush();
  } catch {
    // ignore
  }
  return profiles;
};

const reconcileWithLegacyAws = (storedList) => {
  const { regions: configRegions, defaultRegion } = readLegacyAwsConfigRegions();
  const legacyCreds = readLegacyAwsCredentials();
  let changed = false;

  for (const item of storedList) {
    const targetRegion = configRegions[item.profile] || defaultRegion;
    if (
      targetRegion &&
      (!item.region || item.region === DEFAULT_REGION) &&
      targetRegion !== DEFAULT_REGION
    ) {
      item.region = targetRegion;
      changed = true;
    }
  }

  for (const leg of legacyCreds) {
    const existing = storedList.find((p) => p.profile === leg.profile);
    if (existing) {
      if (!existing.accessKeyId || !existing.secretAccessKey) {
        existing.accessKeyId = leg.accessKeyId;
        existing.secretAccessKey = leg.secretAccessKey;
        existing.sessionToken = leg.sessionToken;
        changed = true;
      }
    } else {
      storedList.push(leg);
      changed = true;
    }
  }

  return changed;
};

const getVaultPaths = (vaultDir) => {
  const resolvedDir =
    vaultDir ||
    (process.env.AWS_DOMAIN_MANAGER_DIR && process.env.AWS_DOMAIN_MANAGER_DIR.trim()) ||
    join(homedir(), '.aws-domain-manager');
  return {
    vaultDir: resolvedDir,
    vaultFile: join(resolvedDir, 'auth.enc.json'),
  };
};

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
 * Validate a 6-digit numeric PIN
 * @param {string} pin
 * @returns {string}
 */
export const validatePin = (pin) => {
  const trimmed = String(pin ?? '').trim();
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error('PIN must be exactly 6 digits (0-9).');
  }
  return trimmed;
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

const hmacSha256 = (key, parts) => {
  const mac = crypto.createHmac('sha256', key);
  for (const part of parts) {
    mac.update(part);
  }
  return mac.digest();
};

const deriveMasterKey = (pin, saltBuffer, iterations = PBKDF2_ITERATIONS) => {
  return crypto.pbkdf2Sync(Buffer.from(pin, 'utf8'), saltBuffer, iterations, 32, 'sha256');
};

const derivePinHash = (masterKey, saltBuffer) => {
  return hmacSha256(masterKey, [Buffer.from('aws-domain-manager:pin-hash:v1:', 'utf8'), saltBuffer]);
};

const deriveEncKey = (masterKey, saltBuffer) => {
  return hmacSha256(masterKey, [Buffer.from('aws-domain-manager:enc-key:v1:', 'utf8'), saltBuffer]);
};

const deriveMacKey = (masterKey, saltBuffer) => {
  return hmacSha256(masterKey, [Buffer.from('aws-domain-manager:mac-key:v1:', 'utf8'), saltBuffer]);
};

const computeMac = (macKey, saltBuffer, ivBuffer, ciphertextBuffer) => {
  return hmacSha256(macKey, [
    Buffer.from('aws-domain-manager:mac:v1:', 'utf8'),
    saltBuffer,
    ivBuffer,
    ciphertextBuffer,
  ]);
};

const constantTimeEqual = (a, b) => {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
};

const xorKeystream = (encKey, ivBuffer, dataBuffer) => {
  const out = Buffer.alloc(dataBuffer.length);
  const totalChunks = Math.ceil(dataBuffer.length / 32);
  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const counterBuf = Buffer.alloc(4);
    counterBuf.writeUInt32BE(chunkIdx, 0);
    const keystream = hmacSha256(encKey, [ivBuffer, counterBuf]);
    const start = chunkIdx * 32;
    const end = Math.min(start + 32, dataBuffer.length);
    for (let i = start; i < end; i++) {
      out[i] = dataBuffer[i] ^ keystream[i - start];
    }
  }
  return out;
};

const formatPreview = (b64, len) => {
  const trimmed = String(b64 || '').trim();
  if (trimmed.length <= len) return trimmed;
  return `${trimmed.slice(0, len)}...`;
};

const toAwsProfiles = (storedList) => {
  return (storedList || []).map((p, idx) => ({
    id: `account-${idx + 1}`,
    name: p.profile.charAt(0).toUpperCase() + p.profile.slice(1),
    profile: p.profile,
    region: (p.region || '').trim() || DEFAULT_REGION,
    accessKeyId: p.accessKeyId || '',
    secretAccessKey: p.secretAccessKey || '',
    sessionToken: p.sessionToken || '',
  }));
};

const readVaultFile = (vaultFile) => {
  const content = readFileSync(vaultFile, 'utf8');
  return JSON.parse(content);
};

const writeVaultFile = (paths, vault) => {
  if (!existsSync(paths.vaultDir)) {
    mkdirSync(paths.vaultDir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(paths.vaultFile, `${JSON.stringify(vault, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
};

export const encryptProfilesToVault = (profiles, pin, existingSaltBuffer = null) => {
  const validPin = validatePin(pin);
  const saltBuffer =
    existingSaltBuffer && existingSaltBuffer.length >= 16
      ? existingSaltBuffer
      : crypto.randomBytes(16);
  const ivBuffer = crypto.randomBytes(16);

  const masterKey = deriveMasterKey(validPin, saltBuffer, PBKDF2_ITERATIONS);
  const pinHash = derivePinHash(masterKey, saltBuffer);
  const encKey = deriveEncKey(masterKey, saltBuffer);
  const macKey = deriveMacKey(masterKey, saltBuffer);

  const plaintext = Buffer.from(JSON.stringify(profiles), 'utf8');
  const ciphertext = xorKeystream(encKey, ivBuffer, plaintext);
  const mac = computeMac(macKey, saltBuffer, ivBuffer, ciphertext);

  return {
    version: VAULT_VERSION,
    kdf: KDF_NAME,
    iterations: PBKDF2_ITERATIONS,
    salt: saltBuffer.toString('base64'),
    pinHash: pinHash.toString('base64'),
    iv: ivBuffer.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    mac: mac.toString('base64'),
  };
};

export const verifyPinAgainstVault = (vault, pin) => {
  const validPin = validatePin(pin);
  const saltBuffer = Buffer.from(vault.salt, 'base64');
  const storedPinHash = Buffer.from(vault.pinHash, 'base64');
  const iterations = vault.iterations > 0 ? vault.iterations : PBKDF2_ITERATIONS;

  const masterKey = deriveMasterKey(validPin, saltBuffer, iterations);
  const computedPinHash = derivePinHash(masterKey, saltBuffer);
  return constantTimeEqual(computedPinHash, storedPinHash);
};

export const decryptProfilesFromVault = (vault, pin) => {
  const validPin = validatePin(pin);
  const saltBuffer = Buffer.from(vault.salt, 'base64');
  const storedPinHash = Buffer.from(vault.pinHash, 'base64');
  const ivBuffer = Buffer.from(vault.iv, 'base64');
  const ciphertextBuffer = Buffer.from(vault.ciphertext, 'base64');
  const storedMac = Buffer.from(vault.mac, 'base64');
  const iterations = vault.iterations > 0 ? vault.iterations : PBKDF2_ITERATIONS;

  const masterKey = deriveMasterKey(validPin, saltBuffer, iterations);
  const computedPinHash = derivePinHash(masterKey, saltBuffer);

  if (!constantTimeEqual(computedPinHash, storedPinHash)) {
    throw new Error('Incorrect 6-digit PIN. Salted PIN hash verification failed.');
  }

  const encKey = deriveEncKey(masterKey, saltBuffer);
  const macKey = deriveMacKey(masterKey, saltBuffer);
  const computedMac = computeMac(macKey, saltBuffer, ivBuffer, ciphertextBuffer);

  if (!constantTimeEqual(computedMac, storedMac)) {
    throw new Error('Encrypted auth data integrity check (HMAC) failed.');
  }

  const plaintext = xorKeystream(encKey, ivBuffer, ciphertextBuffer);
  const stored = JSON.parse(plaintext.toString('utf8'));
  return { stored, saltBuffer };
};

/**
 * Get the current PIN-encrypted auth vault status
 * @param {string} [vaultDir]
 * @returns {{ hasPin: boolean, unlocked: boolean, vaultPath: string, saltPreview: string|null, pinHashPreview: string|null }}
 */
export const getAuthStatus = (vaultDir) => {
  const paths = getVaultPaths(vaultDir);
  if (!existsSync(paths.vaultFile)) {
    return {
      hasPin: false,
      unlocked: true,
      vaultPath: VAULT_DISPLAY_PATH,
      saltPreview: null,
      pinHashPreview: null,
    };
  }

  try {
    const vault = readVaultFile(paths.vaultFile);
    const unlocked =
      sessionCache && sessionCache.vaultMac === vault.mac
        ? true
        : sessionPin
          ? verifyPinAgainstVault(vault, sessionPin)
          : false;
    return {
      hasPin: true,
      unlocked,
      vaultPath: VAULT_DISPLAY_PATH,
      saltPreview: formatPreview(vault.salt, 8),
      pinHashPreview: formatPreview(vault.pinHash, 12),
    };
  } catch {
    return {
      hasPin: true,
      unlocked: false,
      vaultPath: VAULT_DISPLAY_PATH,
      saltPreview: null,
      pinHashPreview: null,
    };
  }
};

/**
 * Verify a 6-digit PIN against the stored salted PIN hash and unlock the auth vault for this session
 * @param {string} pin
 * @param {string} [vaultDir]
 * @returns {Array} Decrypted AWS profiles
 */
export const unlockWithPin = (pin, vaultDir) => {
  const validPin = validatePin(pin);
  const paths = getVaultPaths(vaultDir);
  if (!existsSync(paths.vaultFile)) {
    sessionPin = validPin;
    sessionCache = { pin: validPin, vaultMac: '', profiles: [] };
    return [];
  }

  let vault = readVaultFile(paths.vaultFile);
  const { stored, saltBuffer } = decryptProfilesFromVault(vault, validPin);

  if (!vaultDir && !process.env.AWS_DOMAIN_MANAGER_DIR) {
    if (reconcileWithLegacyAws(stored)) {
      vault = encryptProfilesToVault(stored, validPin, saltBuffer);
      writeVaultFile(paths, vault);
    }
  }

  sessionPin = validPin;
  const profiles = toAwsProfiles(stored);
  sessionCache = { pin: validPin, vaultMac: vault.mac, profiles };
  return profiles;
};

/**
 * Lock the in-memory auth session so the 6-digit PIN is required again
 * @param {string} [vaultDir]
 */
export const lockAuthSession = (vaultDir) => {
  sessionPin = null;
  sessionCache = null;
  return getAuthStatus(vaultDir);
};

/**
 * Read and decrypt AWS account profiles using the unlocked session PIN
 * @param {string} [vaultDir]
 * @param {string} [pinOverride]
 * @returns {Array} Array of AWS account profile objects
 */
export const getAwsProfiles = (vaultDir, pinOverride) => {
  const paths = getVaultPaths(vaultDir);
  if (!existsSync(paths.vaultFile)) {
    return [];
  }

  const activePin = pinOverride || sessionPin;
  if (!activePin) {
    return [];
  }

  const vault = readVaultFile(paths.vaultFile);
  if (!pinOverride && sessionCache && sessionCache.vaultMac === vault.mac) {
    return sessionCache.profiles;
  }

  const { stored } = decryptProfilesFromVault(vault, activePin);
  const profiles = toAwsProfiles(stored);
  sessionCache = { pin: activePin, vaultMac: vault.mac, profiles };
  return profiles;
};

/**
 * Add a new AWS account profile to the PIN-encrypted auth vault
 * @param {Object} accountData
 * @param {string} [vaultDir]
 * @param {string} [pinOverride]
 * @returns {Array} Updated list of AWS account profiles
 */
export const addAwsProfile = (accountData, vaultDir, pinOverride) => {
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

  const paths = getVaultPaths(vaultDir);

  if (!existsSync(paths.vaultFile)) {
    const rawPin = pinOverride || accountData.pin || sessionPin;
    if (!rawPin) {
      throw new Error(
        'A 6-digit PIN is required when creating the first account to encrypt auth data.'
      );
    }
    const validPin = validatePin(rawPin);
    const stored = [
      {
        profile: profileName,
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken,
      },
    ];
    if (!vaultDir && !process.env.AWS_DOMAIN_MANAGER_DIR) {
      reconcileWithLegacyAws(stored);
    }
    const vault = encryptProfilesToVault(stored, validPin, null);
    writeVaultFile(paths, vault);
    sessionPin = validPin;
    const profiles = toAwsProfiles(stored);
    sessionCache = { pin: validPin, vaultMac: vault.mac, profiles };
    return profiles;
  }

  const rawPin = pinOverride || accountData.pin || sessionPin;
  if (!rawPin) {
    throw new Error('Auth vault is locked. Enter your 6-digit PIN to unlock.');
  }
  const activePin = validatePin(rawPin);
  const existingVault = readVaultFile(paths.vaultFile);
  const { stored, saltBuffer } = decryptProfilesFromVault(existingVault, activePin);

  if (stored.some((p) => p.profile === profileName)) {
    throw new Error(`Profile "${profileName}" already exists.`);
  }

  stored.push({
    profile: profileName,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
  });

  const updatedVault = encryptProfilesToVault(stored, activePin, saltBuffer);
  writeVaultFile(paths, updatedVault);
  sessionPin = activePin;
  const profiles = toAwsProfiles(stored);
  sessionCache = { pin: activePin, vaultMac: updatedVault.mac, profiles };

  return profiles;
};

/**
 * Update an existing AWS account profile in the PIN-encrypted auth vault
 * @param {string} originalProfileName
 * @param {Object} accountData
 * @param {string} [vaultDir]
 * @param {string} [pinOverride]
 * @returns {Array} Updated list of AWS account profiles
 */
export const updateAwsProfile = (originalProfileName, accountData, vaultDir, pinOverride) => {
  const newProfileName = validateProfileName(accountData.profile);
  const accessKeyId = (accountData.accessKeyId || '').trim();
  const secretAccessKey = (accountData.secretAccessKey || '').trim();
  const region = (accountData.region || '').trim() || DEFAULT_REGION;
  const sessionToken = (accountData.sessionToken || '').trim();

  if (!accessKeyId) {
    throw new Error('Access Key ID is required.');
  }

  const paths = getVaultPaths(vaultDir);
  if (!existsSync(paths.vaultFile)) {
    throw new Error(`Profile "${originalProfileName}" not found.`);
  }

  const rawPin = pinOverride || accountData.pin || sessionPin;
  if (!rawPin) {
    throw new Error('Auth vault is locked. Enter your 6-digit PIN to unlock.');
  }
  const activePin = validatePin(rawPin);
  const existingVault = readVaultFile(paths.vaultFile);
  const { stored, saltBuffer } = decryptProfilesFromVault(existingVault, activePin);

  const existingIdx = stored.findIndex((p) => p.profile === originalProfileName);
  if (existingIdx < 0) {
    throw new Error(`Profile "${originalProfileName}" not found.`);
  }

  if (
    newProfileName !== originalProfileName &&
    stored.some((p) => p.profile === newProfileName)
  ) {
    throw new Error(`Profile "${newProfileName}" already exists.`);
  }

  stored[existingIdx] = {
    profile: newProfileName,
    region,
    accessKeyId,
    secretAccessKey: secretAccessKey || stored[existingIdx].secretAccessKey,
    sessionToken,
  };

  const updatedVault = encryptProfilesToVault(stored, activePin, saltBuffer);
  writeVaultFile(paths, updatedVault);
  sessionPin = activePin;
  const profiles = toAwsProfiles(stored);
  sessionCache = { pin: activePin, vaultMac: updatedVault.mac, profiles };

  return profiles;
};

/**
 * Remove an AWS account profile from the PIN-encrypted auth vault
 * @param {string} profileName
 * @param {string} [vaultDir]
 * @param {string} [pinOverride]
 * @returns {Array} Updated list of AWS account profiles
 */
export const removeAwsProfile = (profileName, vaultDir, pinOverride) => {
  const paths = getVaultPaths(vaultDir);
  if (!existsSync(paths.vaultFile)) {
    return [];
  }

  const rawPin = pinOverride || sessionPin;
  if (!rawPin) {
    throw new Error('Auth vault is locked. Enter your 6-digit PIN to unlock.');
  }
  const activePin = validatePin(rawPin);
  const existingVault = readVaultFile(paths.vaultFile);
  const { stored, saltBuffer } = decryptProfilesFromVault(existingVault, activePin);

  const remaining = stored.filter((p) => p.profile !== profileName);
  if (remaining.length === 0) {
    try {
      unlinkSync(paths.vaultFile);
    } catch {
      // ignore unlink error
    }
    sessionPin = null;
    sessionCache = null;
    return [];
  }

  const updatedVault = encryptProfilesToVault(remaining, activePin, saltBuffer);
  writeVaultFile(paths, updatedVault);
  const profiles = toAwsProfiles(remaining);
  sessionCache = { pin: activePin, vaultMac: updatedVault.mac, profiles };
  return profiles;
};
