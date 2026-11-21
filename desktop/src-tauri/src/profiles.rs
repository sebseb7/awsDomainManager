use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const DEFAULT_REGION: &str = "us-east-1";
const PBKDF2_ITERATIONS: u32 = 100_000;
const VAULT_VERSION: u32 = 1;
const KDF_NAME: &str = "pbkdf2-hmac-sha256";
pub const VAULT_DISPLAY_PATH: &str = "~/.aws-domain-manager/auth.enc.json";

#[derive(Debug, Clone)]
struct UnlockedSession {
    pin: String,
    vault_mac: String,
    profiles: Vec<AwsProfile>,
}

static SESSION_STATE: OnceLock<Mutex<Option<UnlockedSession>>> = OnceLock::new();
static ENTROPY_COUNTER: AtomicU64 = AtomicU64::new(1);

fn session_store() -> &'static Mutex<Option<UnlockedSession>> {
    SESSION_STATE.get_or_init(|| Mutex::new(None))
}

fn get_unlocked_session() -> Option<UnlockedSession> {
    session_store()
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

fn set_unlocked_session(session: Option<UnlockedSession>) {
    if let Ok(mut guard) = session_store().lock() {
        *guard = session;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwsProfile {
    pub id: String,
    pub name: String,
    pub profile: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredProfile {
    pub profile: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub profile: String,
    pub region: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: Option<String>,
    pub session_token: Option<String>,
    pub pin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedVault {
    pub version: u32,
    pub kdf: String,
    pub iterations: u32,
    pub salt: String,
    pub pin_hash: String,
    pub iv: String,
    pub ciphertext: String,
    pub mac: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub has_pin: bool,
    pub unlocked: bool,
    pub vault_path: String,
    pub salt_preview: Option<String>,
    pub pin_hash_preview: Option<String>,
}

struct VaultPaths {
    vault_dir: PathBuf,
    vault_file: PathBuf,
}

fn get_vault_paths(custom_dir: Option<&Path>) -> Result<VaultPaths, String> {
    let vault_dir = if let Some(dir) = custom_dir {
        dir.to_path_buf()
    } else if let Ok(env_dir) = std::env::var("AWS_DOMAIN_MANAGER_DIR") {
        let trimmed = env_dir.trim();
        if !trimmed.is_empty() {
            PathBuf::from(trimmed)
        } else {
            let home =
                dirs::home_dir().ok_or_else(|| "Could not determine home directory.".to_string())?;
            home.join(".aws-domain-manager")
        }
    } else {
        let home =
            dirs::home_dir().ok_or_else(|| "Could not determine home directory.".to_string())?;
        home.join(".aws-domain-manager")
    };

    Ok(VaultPaths {
        vault_file: vault_dir.join("auth.enc.json"),
        vault_dir,
    })
}

/// Read ~/.aws/config regions and ~/.aws/credentials profiles (if present) so existing user
/// accounts or regions (e.g. eu-central-1) are preserved when encrypting into the PIN vault.
fn read_legacy_aws_config_regions() -> (HashMap<String, String>, Option<String>) {
    let mut regions = HashMap::new();
    let mut default_region = None;
    let Some(home) = dirs::home_dir() else {
        return (regions, default_region);
    };
    let config_path = home.join(".aws").join("config");
    let Ok(content) = fs::read_to_string(&config_path) else {
        return (regions, default_region);
    };

    let mut current_profile: Option<String> = None;
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let inner = line[1..line.len() - 1].trim();
            if inner == "default" {
                current_profile = Some("default".to_string());
            } else if let Some(rest) = inner.strip_prefix("profile") {
                if rest.starts_with(char::is_whitespace) {
                    let name = rest.trim();
                    if !name.is_empty() {
                        current_profile = Some(name.to_string());
                    }
                }
            } else {
                current_profile = None;
            }
            continue;
        }
        if let (Some(ref prof), Some((k, v))) = (&current_profile, line.split_once('=')) {
            if k.trim() == "region" {
                let reg = v.trim();
                if !reg.is_empty() {
                    if prof == "default" {
                        default_region = Some(reg.to_string());
                    }
                    regions.insert(prof.clone(), reg.to_string());
                }
            }
        }
    }
    (regions, default_region)
}

fn read_legacy_aws_credentials() -> Vec<StoredProfile> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let cred_path = home.join(".aws").join("credentials");
    let Ok(content) = fs::read_to_string(&cred_path) else {
        return Vec::new();
    };
    let (config_regions, default_region) = read_legacy_aws_config_regions();

    let mut profiles = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_kv: HashMap<String, String> = HashMap::new();

    let flush_profile = |name: Option<String>,
                         kv: &HashMap<String, String>,
                         out: &mut Vec<StoredProfile>| {
        if let Some(prof_name) = name {
            let ak = kv.get("aws_access_key_id").cloned().unwrap_or_default();
            let sk = kv.get("aws_secret_access_key").cloned().unwrap_or_default();
            if !ak.is_empty() && !sk.is_empty() {
                let region = config_regions
                    .get(&prof_name)
                    .cloned()
                    .or_else(|| kv.get("region").cloned())
                    .or_else(|| default_region.clone())
                    .unwrap_or_else(|| DEFAULT_REGION.to_string());
                out.push(StoredProfile {
                    profile: prof_name,
                    region,
                    access_key_id: ak,
                    secret_access_key: sk,
                    session_token: kv.get("aws_session_token").cloned().unwrap_or_default(),
                });
            }
        }
    };

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') && line.len() >= 3 {
            flush_profile(current_name.take(), &current_kv, &mut profiles);
            current_kv.clear();
            let inner = line[1..line.len() - 1].trim();
            if !inner.is_empty() {
                current_name = Some(inner.to_string());
            }
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            current_kv.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    flush_profile(current_name.take(), &current_kv, &mut profiles);
    profiles
}

/// Reconcile stored profiles with ~/.aws/config regions and any unmigrated ~/.aws/credentials profiles
fn reconcile_with_legacy_aws(stored: &mut Vec<StoredProfile>) -> bool {
    let (config_regions, default_region) = read_legacy_aws_config_regions();
    let legacy_creds = read_legacy_aws_credentials();
    let mut changed = false;

    for item in stored.iter_mut() {
        let target_region = config_regions
            .get(&item.profile)
            .cloned()
            .or_else(|| default_region.clone());
        if let Some(cfg_reg) = target_region {
            if (item.region.trim().is_empty() || item.region == DEFAULT_REGION)
                && cfg_reg != DEFAULT_REGION
            {
                item.region = cfg_reg;
                changed = true;
            }
        }
    }

    for leg in legacy_creds {
        if let Some(existing) = stored.iter_mut().find(|p| p.profile == leg.profile) {
            if existing.access_key_id.trim().is_empty() || existing.secret_access_key.trim().is_empty() {
                existing.access_key_id = leg.access_key_id;
                existing.secret_access_key = leg.secret_access_key;
                existing.session_token = leg.session_token;
                changed = true;
            }
        } else {
            stored.push(leg);
            changed = true;
        }
    }

    changed
}

pub fn validate_pin(pin: &str) -> Result<String, String> {
    let trimmed = pin.trim();
    if trimmed.len() != 6 || !trimmed.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must be exactly 6 digits (0-9).".to_string());
    }
    Ok(trimmed.to_string())
}

pub fn validate_profile_name(profile_name: &str) -> Result<String, String> {
    let trimmed = profile_name.trim();
    if trimmed.is_empty() {
        return Err("Profile name is required.".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(
            "Profile name may only contain letters, numbers, dots, hyphens, and underscores."
                .to_string(),
        );
    }
    Ok(trimmed.to_string())
}

fn hmac_sha256(key: &[u8], parts: &[&[u8]]) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts keys of any length");
    for part in parts {
        mac.update(part);
    }
    let result = mac.finalize().into_bytes();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

/// RFC 2898 PBKDF2-HMAC-SHA256 for a 32-byte (single block) derived key
fn pbkdf2_hmac_sha256(pin: &[u8], salt: &[u8], iterations: u32) -> [u8; 32] {
    let block_index = 1u32.to_be_bytes();
    let mut u = hmac_sha256(pin, &[salt, &block_index]);
    let mut t = u;
    for _ in 1..iterations {
        u = hmac_sha256(pin, &[&u]);
        for (ti, ui) in t.iter_mut().zip(u.iter()) {
            *ti ^= *ui;
        }
    }
    t
}

fn derive_pin_hash(master_key: &[u8; 32], salt: &[u8]) -> [u8; 32] {
    hmac_sha256(master_key, &[b"aws-domain-manager:pin-hash:v1:", salt])
}

fn derive_enc_key(master_key: &[u8; 32], salt: &[u8]) -> [u8; 32] {
    hmac_sha256(master_key, &[b"aws-domain-manager:enc-key:v1:", salt])
}

fn derive_mac_key(master_key: &[u8; 32], salt: &[u8]) -> [u8; 32] {
    hmac_sha256(master_key, &[b"aws-domain-manager:mac-key:v1:", salt])
}

fn compute_mac(mac_key: &[u8; 32], salt: &[u8], iv: &[u8], ciphertext: &[u8]) -> [u8; 32] {
    hmac_sha256(
        mac_key,
        &[b"aws-domain-manager:mac:v1:", salt, iv, ciphertext],
    )
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn xor_keystream(enc_key: &[u8; 32], iv: &[u8], data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    for (chunk_idx, chunk) in data.chunks(32).enumerate() {
        let counter = (chunk_idx as u32).to_be_bytes();
        let keystream = hmac_sha256(enc_key, &[iv, &counter]);
        for (i, byte) in chunk.iter().enumerate() {
            out.push(byte ^ keystream[i]);
        }
    }
    out
}

/// Generate 16 random bytes backed by OS CSPRNG via RandomState + SHA-256 whitening
fn random_bytes_16() -> [u8; 16] {
    let mut hasher = Sha256::new();
    for i in 0..8u64 {
        let rs = RandomState::new();
        let mut h = rs.build_hasher();
        h.write_u64(i ^ ENTROPY_COUNTER.fetch_add(1, Ordering::Relaxed));
        hasher.update(h.finish().to_le_bytes());
    }
    if let Ok(dur) = SystemTime::now().duration_since(UNIX_EPOCH) {
        hasher.update(dur.as_nanos().to_le_bytes());
    }
    hasher.update(std::process::id().to_le_bytes());
    let digest = hasher.finalize();
    let mut out = [0u8; 16];
    out.copy_from_slice(&digest[..16]);
    out
}

fn format_preview(b64: &str, prefix_len: usize) -> String {
    let trimmed = b64.trim();
    if trimmed.len() <= prefix_len {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..prefix_len])
    }
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

fn to_aws_profiles(stored: Vec<StoredProfile>) -> Vec<AwsProfile> {
    stored
        .into_iter()
        .enumerate()
        .map(|(idx, p)| AwsProfile {
            id: format!("account-{}", idx + 1),
            name: capitalize_first(&p.profile),
            profile: p.profile,
            region: if p.region.trim().is_empty() {
                DEFAULT_REGION.to_string()
            } else {
                p.region
            },
            access_key_id: p.access_key_id,
            secret_access_key: p.secret_access_key,
            session_token: p.session_token,
        })
        .collect()
}

fn read_vault_file(vault_file: &Path) -> Result<EncryptedVault, String> {
    let content = fs::read_to_string(vault_file)
        .map_err(|e| format!("Failed to read encrypted auth vault: {}", e))?;
    serde_json::from_str::<EncryptedVault>(&content)
        .map_err(|e| format!("Corrupted encrypted auth vault format: {}", e))
}

fn write_vault_file(paths: &VaultPaths, vault: &EncryptedVault) -> Result<(), String> {
    if !paths.vault_dir.exists() {
        fs::create_dir_all(&paths.vault_dir)
            .map_err(|e| format!("Failed to create {}: {}", paths.vault_dir.display(), e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&paths.vault_dir, fs::Permissions::from_mode(0o700));
        }
    }
    let serialized = serde_json::to_string_pretty(vault)
        .map_err(|e| format!("Failed to serialize encrypted auth vault: {}", e))?;
    fs::write(&paths.vault_file, format!("{}\n", serialized))
        .map_err(|e| format!("Failed to write {}: {}", paths.vault_file.display(), e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&paths.vault_file, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn encrypt_profiles_to_vault(
    profiles: &[StoredProfile],
    pin: &str,
    existing_salt: Option<&[u8]>,
) -> Result<EncryptedVault, String> {
    let valid_pin = validate_pin(pin)?;
    let salt_bytes: Vec<u8> = match existing_salt {
        Some(s) if s.len() >= 16 => s.to_vec(),
        _ => random_bytes_16().to_vec(),
    };
    let iv_bytes = random_bytes_16();

    let master_key = pbkdf2_hmac_sha256(valid_pin.as_bytes(), &salt_bytes, PBKDF2_ITERATIONS);
    let pin_hash = derive_pin_hash(&master_key, &salt_bytes);
    let enc_key = derive_enc_key(&master_key, &salt_bytes);
    let mac_key = derive_mac_key(&master_key, &salt_bytes);

    let plaintext = serde_json::to_vec(profiles)
        .map_err(|e| format!("Failed to encode profiles payload: {}", e))?;
    let ciphertext = xor_keystream(&enc_key, &iv_bytes, &plaintext);
    let mac = compute_mac(&mac_key, &salt_bytes, &iv_bytes, &ciphertext);

    Ok(EncryptedVault {
        version: VAULT_VERSION,
        kdf: KDF_NAME.to_string(),
        iterations: PBKDF2_ITERATIONS,
        salt: BASE64.encode(&salt_bytes),
        pin_hash: BASE64.encode(pin_hash),
        iv: BASE64.encode(iv_bytes),
        ciphertext: BASE64.encode(&ciphertext),
        mac: BASE64.encode(mac),
    })
}

pub fn verify_pin_against_vault(vault: &EncryptedVault, pin: &str) -> Result<bool, String> {
    let valid_pin = validate_pin(pin)?;
    let salt = BASE64
        .decode(vault.salt.trim())
        .map_err(|_| "Invalid salt encoding in encrypted vault.".to_string())?;
    let stored_pin_hash = BASE64
        .decode(vault.pin_hash.trim())
        .map_err(|_| "Invalid PIN hash encoding in encrypted vault.".to_string())?;
    let iterations = if vault.iterations > 0 {
        vault.iterations
    } else {
        PBKDF2_ITERATIONS
    };

    let master_key = pbkdf2_hmac_sha256(valid_pin.as_bytes(), &salt, iterations);
    let computed_pin_hash = derive_pin_hash(&master_key, &salt);
    Ok(constant_time_eq(&computed_pin_hash, &stored_pin_hash))
}

fn decrypt_profiles_from_vault(
    vault: &EncryptedVault,
    pin: &str,
) -> Result<(Vec<StoredProfile>, Vec<u8>), String> {
    let valid_pin = validate_pin(pin)?;
    let salt = BASE64
        .decode(vault.salt.trim())
        .map_err(|_| "Invalid salt encoding in encrypted vault.".to_string())?;
    let stored_pin_hash = BASE64
        .decode(vault.pin_hash.trim())
        .map_err(|_| "Invalid PIN hash encoding in encrypted vault.".to_string())?;
    let iv = BASE64
        .decode(vault.iv.trim())
        .map_err(|_| "Invalid IV encoding in encrypted vault.".to_string())?;
    let ciphertext = BASE64
        .decode(vault.ciphertext.trim())
        .map_err(|_| "Invalid ciphertext encoding in encrypted vault.".to_string())?;
    let stored_mac = BASE64
        .decode(vault.mac.trim())
        .map_err(|_| "Invalid MAC encoding in encrypted vault.".to_string())?;

    let iterations = if vault.iterations > 0 {
        vault.iterations
    } else {
        PBKDF2_ITERATIONS
    };

    let master_key = pbkdf2_hmac_sha256(valid_pin.as_bytes(), &salt, iterations);
    let computed_pin_hash = derive_pin_hash(&master_key, &salt);

    if !constant_time_eq(&computed_pin_hash, &stored_pin_hash) {
        return Err("Incorrect 6-digit PIN. Salted PIN hash verification failed.".to_string());
    }

    let enc_key = derive_enc_key(&master_key, &salt);
    let mac_key = derive_mac_key(&master_key, &salt);
    let computed_mac = compute_mac(&mac_key, &salt, &iv, &ciphertext);

    if !constant_time_eq(&computed_mac, &stored_mac) {
        return Err("Encrypted auth data integrity check (HMAC) failed.".to_string());
    }

    let plaintext = xor_keystream(&enc_key, &iv, &ciphertext);
    let stored: Vec<StoredProfile> = serde_json::from_slice(&plaintext)
        .map_err(|e| format!("Failed to decode decrypted auth data: {}", e))?;

    Ok((stored, salt))
}

pub fn get_auth_status_in(custom_dir: Option<&Path>) -> Result<AuthStatus, String> {
    let paths = get_vault_paths(custom_dir)?;
    if !paths.vault_file.exists() {
        return Ok(AuthStatus {
            has_pin: false,
            unlocked: true,
            vault_path: VAULT_DISPLAY_PATH.to_string(),
            salt_preview: None,
            pin_hash_preview: None,
        });
    }

    let vault = read_vault_file(&paths.vault_file)?;
    let unlocked = match get_unlocked_session() {
        Some(ref session) if session.vault_mac == vault.mac => true,
        Some(ref session) => verify_pin_against_vault(&vault, &session.pin).unwrap_or(false),
        None => false,
    };

    Ok(AuthStatus {
        has_pin: true,
        unlocked,
        vault_path: VAULT_DISPLAY_PATH.to_string(),
        salt_preview: Some(format_preview(&vault.salt, 8)),
        pin_hash_preview: Some(format_preview(&vault.pin_hash, 12)),
    })
}

pub fn get_auth_status() -> Result<AuthStatus, String> {
    get_auth_status_in(None)
}

pub fn unlock_with_pin_in(pin: &str, custom_dir: Option<&Path>) -> Result<Vec<AwsProfile>, String> {
    let valid_pin = validate_pin(pin)?;
    let paths = get_vault_paths(custom_dir)?;
    if !paths.vault_file.exists() {
        set_unlocked_session(Some(UnlockedSession {
            pin: valid_pin,
            vault_mac: String::new(),
            profiles: Vec::new(),
        }));
        return Ok(Vec::new());
    }

    let mut vault = read_vault_file(&paths.vault_file)?;
    let (mut stored, salt) = decrypt_profiles_from_vault(&vault, &valid_pin)?;

    // In real app mode, reconcile region from ~/.aws/config and any unmigrated ~/.aws/credentials profiles
    if custom_dir.is_none() && std::env::var("AWS_DOMAIN_MANAGER_DIR").is_err() {
        if reconcile_with_legacy_aws(&mut stored) {
            if let Ok(updated_vault) = encrypt_profiles_to_vault(&stored, &valid_pin, Some(&salt)) {
                let _ = write_vault_file(&paths, &updated_vault);
                vault = updated_vault;
            }
        }
    }

    let profiles = to_aws_profiles(stored);
    set_unlocked_session(Some(UnlockedSession {
        pin: valid_pin,
        vault_mac: vault.mac,
        profiles: profiles.clone(),
    }));
    Ok(profiles)
}

pub fn unlock_with_pin(pin: &str) -> Result<Vec<AwsProfile>, String> {
    unlock_with_pin_in(pin, None)
}

pub fn lock_auth_session_in(custom_dir: Option<&Path>) -> Result<AuthStatus, String> {
    set_unlocked_session(None);
    get_auth_status_in(custom_dir)
}

pub fn lock_auth_session() -> Result<AuthStatus, String> {
    lock_auth_session_in(None)
}

pub fn get_aws_profiles_in(custom_dir: Option<&Path>) -> Result<Vec<AwsProfile>, String> {
    let paths = get_vault_paths(custom_dir)?;
    if !paths.vault_file.exists() {
        return Ok(Vec::new());
    }

    let session = get_unlocked_session().ok_or_else(|| {
        "Auth vault is locked. Enter your 6-digit PIN to unlock.".to_string()
    })?;

    let vault = read_vault_file(&paths.vault_file)?;
    if session.vault_mac == vault.mac {
        return Ok(session.profiles);
    }

    let (stored, _) = decrypt_profiles_from_vault(&vault, &session.pin)?;
    let profiles = to_aws_profiles(stored);
    set_unlocked_session(Some(UnlockedSession {
        pin: session.pin,
        vault_mac: vault.mac,
        profiles: profiles.clone(),
    }));
    Ok(profiles)
}

pub fn get_aws_profiles() -> Result<Vec<AwsProfile>, String> {
    get_aws_profiles_in(None)
}

pub fn get_profile_by_name(profile_name: &str) -> Result<AwsProfile, String> {
    let profiles = get_aws_profiles()?;
    profiles
        .into_iter()
        .find(|p| p.profile == profile_name)
        .ok_or_else(|| {
            format!(
                "AWS profile \"{}\" not found in PIN-encrypted auth vault.",
                profile_name
            )
        })
}

pub fn add_aws_profile_in(
    input: AccountInput,
    custom_dir: Option<&Path>,
) -> Result<Vec<AwsProfile>, String> {
    let profile_name = validate_profile_name(&input.profile)?;
    let access_key_id = input.access_key_id.trim().to_string();
    let secret_access_key = input
        .secret_access_key
        .unwrap_or_default()
        .trim()
        .to_string();
    let region = input.region.unwrap_or_default().trim().to_string();
    let region = if region.is_empty() {
        DEFAULT_REGION.to_string()
    } else {
        region
    };
    let session_token = input.session_token.unwrap_or_default().trim().to_string();

    if access_key_id.is_empty() {
        return Err("Access Key ID is required.".to_string());
    }
    if secret_access_key.is_empty() {
        return Err("Secret Access Key is required.".to_string());
    }

    let paths = get_vault_paths(custom_dir)?;

    if !paths.vault_file.exists() {
        // First account being created in the app: require a 6-digit PIN!
        let raw_pin = input
            .pin
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| get_unlocked_session().map(|s| s.pin))
            .ok_or_else(|| {
                "A 6-digit PIN is required when creating the first account to encrypt auth data."
                    .to_string()
            })?;
        let valid_pin = validate_pin(&raw_pin)?;

        let mut stored = vec![StoredProfile {
            profile: profile_name,
            region,
            access_key_id,
            secret_access_key,
            session_token,
        }];

        if custom_dir.is_none() && std::env::var("AWS_DOMAIN_MANAGER_DIR").is_err() {
            let _ = reconcile_with_legacy_aws(&mut stored);
        }

        let vault = encrypt_profiles_to_vault(&stored, &valid_pin, None)?;
        write_vault_file(&paths, &vault)?;
        let profiles = to_aws_profiles(stored);
        set_unlocked_session(Some(UnlockedSession {
            pin: valid_pin,
            vault_mac: vault.mac,
            profiles: profiles.clone(),
        }));
        return Ok(profiles);
    }

    // Vault already exists: use session PIN (or input.pin if provided)
    let active_pin = match input
        .pin
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        Some(p) => validate_pin(p)?,
        None => get_unlocked_session()
            .map(|s| s.pin)
            .ok_or_else(|| "Auth vault is locked. Enter your 6-digit PIN to unlock.".to_string())?,
    };

    let existing_vault = read_vault_file(&paths.vault_file)?;
    let (mut stored, salt) = decrypt_profiles_from_vault(&existing_vault, &active_pin)?;

    if stored.iter().any(|p| p.profile == profile_name) {
        return Err(format!("Profile \"{}\" already exists.", profile_name));
    }

    stored.push(StoredProfile {
        profile: profile_name,
        region,
        access_key_id,
        secret_access_key,
        session_token,
    });

    let updated_vault = encrypt_profiles_to_vault(&stored, &active_pin, Some(&salt))?;
    write_vault_file(&paths, &updated_vault)?;
    let profiles = to_aws_profiles(stored);
    set_unlocked_session(Some(UnlockedSession {
        pin: active_pin,
        vault_mac: updated_vault.mac,
        profiles: profiles.clone(),
    }));

    Ok(profiles)
}

pub fn add_aws_profile(input: AccountInput) -> Result<Vec<AwsProfile>, String> {
    add_aws_profile_in(input, None)
}

pub fn update_aws_profile_in(
    original_profile_name: &str,
    input: AccountInput,
    custom_dir: Option<&Path>,
) -> Result<Vec<AwsProfile>, String> {
    let new_profile_name = validate_profile_name(&input.profile)?;
    let access_key_id = input.access_key_id.trim().to_string();
    let secret_access_key = input
        .secret_access_key
        .unwrap_or_default()
        .trim()
        .to_string();
    let region = input.region.unwrap_or_default().trim().to_string();
    let region = if region.is_empty() {
        DEFAULT_REGION.to_string()
    } else {
        region
    };
    let session_token = input.session_token.unwrap_or_default().trim().to_string();

    if access_key_id.is_empty() {
        return Err("Access Key ID is required.".to_string());
    }

    let paths = get_vault_paths(custom_dir)?;
    if !paths.vault_file.exists() {
        return Err(format!("Profile \"{}\" not found.", original_profile_name));
    }

    let active_pin = get_unlocked_session()
        .map(|s| s.pin)
        .ok_or_else(|| "Auth vault is locked. Enter your 6-digit PIN to unlock.".to_string())?;

    let existing_vault = read_vault_file(&paths.vault_file)?;
    let (mut stored, salt) = decrypt_profiles_from_vault(&existing_vault, &active_pin)?;

    if !stored.iter().any(|p| p.profile == original_profile_name) {
        return Err(format!("Profile \"{}\" not found.", original_profile_name));
    }

    if new_profile_name != original_profile_name
        && stored.iter().any(|p| p.profile == new_profile_name)
    {
        return Err(format!("Profile \"{}\" already exists.", new_profile_name));
    }

    for item in &mut stored {
        if item.profile == original_profile_name {
            item.profile = new_profile_name.clone();
            item.region = region.clone();
            item.access_key_id = access_key_id.clone();
            if !secret_access_key.is_empty() {
                item.secret_access_key = secret_access_key.clone();
            }
            item.session_token = session_token.clone();
            break;
        }
    }

    let updated_vault = encrypt_profiles_to_vault(&stored, &active_pin, Some(&salt))?;
    write_vault_file(&paths, &updated_vault)?;
    let profiles = to_aws_profiles(stored);
    set_unlocked_session(Some(UnlockedSession {
        pin: active_pin,
        vault_mac: updated_vault.mac,
        profiles: profiles.clone(),
    }));

    Ok(profiles)
}

pub fn update_aws_profile(
    original_profile_name: &str,
    input: AccountInput,
) -> Result<Vec<AwsProfile>, String> {
    update_aws_profile_in(original_profile_name, input, None)
}

pub fn remove_aws_profile_in(
    profile_name: &str,
    custom_dir: Option<&Path>,
) -> Result<Vec<AwsProfile>, String> {
    let paths = get_vault_paths(custom_dir)?;
    if !paths.vault_file.exists() {
        return Ok(Vec::new());
    }

    let active_pin = get_unlocked_session()
        .map(|s| s.pin)
        .ok_or_else(|| "Auth vault is locked. Enter your 6-digit PIN to unlock.".to_string())?;

    let existing_vault = read_vault_file(&paths.vault_file)?;
    let (mut stored, salt) = decrypt_profiles_from_vault(&existing_vault, &active_pin)?;

    stored.retain(|p| p.profile != profile_name);

    if stored.is_empty() {
        let _ = fs::remove_file(&paths.vault_file);
        set_unlocked_session(None);
        return Ok(Vec::new());
    }

    let updated_vault = encrypt_profiles_to_vault(&stored, &active_pin, Some(&salt))?;
    write_vault_file(&paths, &updated_vault)?;
    let profiles = to_aws_profiles(stored);
    set_unlocked_session(Some(UnlockedSession {
        pin: active_pin,
        vault_mac: updated_vault.mac,
        profiles: profiles.clone(),
    }));

    Ok(profiles)
}

pub fn remove_aws_profile(profile_name: &str) -> Result<Vec<AwsProfile>, String> {
    remove_aws_profile_in(profile_name, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pin_validation_and_salted_hash_encryption() {
        assert!(validate_pin("12345").is_err());
        assert!(validate_pin("1234567").is_err());
        assert!(validate_pin("12345a").is_err());
        assert_eq!(validate_pin(" 482910 ").unwrap(), "482910");

        let temp_dir = std::env::temp_dir().join(format!(
            "aws-domain-manager-test-{}",
            random_bytes_16()
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect::<String>()
        ));
        set_unlocked_session(None);

        let status0 = get_auth_status_in(Some(&temp_dir)).unwrap();
        assert!(!status0.has_pin);
        assert!(status0.unlocked);

        // Creating first account without PIN fails
        let res_no_pin = add_aws_profile_in(
            AccountInput {
                profile: "prod-aws".to_string(),
                region: Some("eu-central-1".to_string()),
                access_key_id: "AKIAIOSFODNN7EXAMPLE".to_string(),
                secret_access_key: Some("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string()),
                session_token: None,
                pin: None,
            },
            Some(&temp_dir),
        );
        assert!(res_no_pin.is_err());

        // Creating first account with 6-digit PIN succeeds and encrypts data
        let created = add_aws_profile_in(
            AccountInput {
                profile: "prod-aws".to_string(),
                region: Some("eu-central-1".to_string()),
                access_key_id: "AKIAIOSFODNN7EXAMPLE".to_string(),
                secret_access_key: Some("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string()),
                session_token: None,
                pin: Some("482910".to_string()),
            },
            Some(&temp_dir),
        )
        .unwrap();
        assert_eq!(created.len(), 1);
        assert_eq!(created[0].profile, "prod-aws");

        // Ensure raw file on disk contains salt and pinHash, and NO plaintext secrets
        let raw_vault = fs::read_to_string(temp_dir.join("auth.enc.json")).unwrap();
        assert!(raw_vault.contains("\"salt\""));
        assert!(raw_vault.contains("\"pinHash\""));
        assert!(!raw_vault.contains("AKIAIOSFODNN7EXAMPLE"));
        assert!(!raw_vault.contains("wJalrXUtnFEMI"));
        assert!(!raw_vault.contains("482910"));

        // Simulate app relaunch (lock session)
        let locked_status = lock_auth_session_in(Some(&temp_dir)).unwrap();
        assert!(locked_status.has_pin);
        assert!(!locked_status.unlocked);
        assert!(get_aws_profiles_in(Some(&temp_dir)).is_err());

        // Wrong 6-digit PIN is caught by salted PIN hash verification
        let wrong_unlock = unlock_with_pin_in("999999", Some(&temp_dir));
        assert!(wrong_unlock.is_err());
        assert!(wrong_unlock
            .unwrap_err()
            .contains("Salted PIN hash verification failed"));

        // Correct 6-digit PIN unlocks and decrypts profiles
        let unlocked_profiles = unlock_with_pin_in("482910", Some(&temp_dir)).unwrap();
        assert_eq!(unlocked_profiles.len(), 1);
        assert_eq!(unlocked_profiles[0].access_key_id, "AKIAIOSFODNN7EXAMPLE");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
