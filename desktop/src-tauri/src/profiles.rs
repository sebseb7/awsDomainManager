use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_REGION: &str = "us-east-1";

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub profile: String,
    pub region: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: Option<String>,
    pub session_token: Option<String>,
}

struct AwsPaths {
    aws_dir: PathBuf,
    credentials_path: PathBuf,
    config_path: PathBuf,
}

fn get_aws_paths() -> Result<AwsPaths, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not determine home directory.".to_string())?;
    let aws_dir = home.join(".aws");
    Ok(AwsPaths {
        credentials_path: aws_dir.join("credentials"),
        config_path: aws_dir.join("config"),
        aws_dir,
    })
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

#[derive(Debug, Clone)]
struct IniSection {
    header: String,
    key: Option<String>,
    lines: Vec<String>,
}

#[derive(Debug, Clone)]
struct IniDoc {
    preamble: Vec<String>,
    sections: Vec<IniSection>,
}

fn extract_section_key(header_line: &str, is_config: bool) -> Option<String> {
    let trimmed = header_line.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return None;
    }
    let inner = trimmed[1..trimmed.len() - 1].trim();
    if is_config {
        if inner == "default" {
            return Some("default".to_string());
        }
        if let Some(rest) = inner.strip_prefix("profile") {
            if rest.starts_with(char::is_whitespace) {
                let name = rest.trim();
                if !name.is_empty() {
                    return Some(name.to_string());
                }
            }
        }
        None
    } else if !inner.is_empty() {
        Some(inner.to_string())
    } else {
        None
    }
}

fn format_section_header(profile_name: &str, is_config: bool) -> String {
    if is_config {
        if profile_name == "default" {
            "[default]".to_string()
        } else {
            format!("[profile {}]", profile_name)
        }
    } else {
        format!("[{}]", profile_name)
    }
}

fn parse_ini(content: &str, is_config: bool) -> IniDoc {
    let normalized = content.replace("\r\n", "\n");
    let mut raw_lines: Vec<String> = normalized.split('\n').map(|s| s.to_string()).collect();
    if raw_lines.last().map(|s| s.is_empty()).unwrap_or(false) {
        raw_lines.pop();
    }

    let mut preamble = Vec::new();
    let mut sections: Vec<IniSection> = Vec::new();

    for line in raw_lines {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') && trimmed.len() >= 3 {
            sections.push(IniSection {
                header: trimmed.to_string(),
                key: extract_section_key(trimmed, is_config),
                lines: Vec::new(),
            });
        } else if let Some(last) = sections.last_mut() {
            last.lines.push(line);
        } else {
            preamble.push(line);
        }
    }

    IniDoc { preamble, sections }
}

fn parse_kv_line(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
        return None;
    }
    let (k, v) = trimmed.split_once('=')?;
    let key = k.trim();
    if key.is_empty()
        || !key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return None;
    }
    Some((key.to_string(), v.trim().to_string()))
}

fn parse_key_values(lines: &[String]) -> HashMap<String, String> {
    let mut values = HashMap::new();
    for line in lines {
        if let Some((k, v)) = parse_kv_line(line) {
            values.insert(k, v);
        }
    }
    values
}

fn upsert_section(
    doc: &mut IniDoc,
    target_key: &str,
    new_key: &str,
    updates: &[(&str, Option<String>)],
    is_config: bool,
) {
    let header = format_section_header(new_key, is_config);
    let update_map: HashMap<&str, &Option<String>> =
        updates.iter().map(|(k, v)| (*k, v)).collect();

    if let Some(existing) = doc
        .sections
        .iter_mut()
        .find(|s| s.key.as_deref() == Some(target_key))
    {
        existing.header = header;
        existing.key = Some(new_key.to_string());

        let mut handled: HashSet<String> = HashSet::new();
        let mut next_lines: Vec<String> = Vec::new();

        for line in &existing.lines {
            if let Some((k, _)) = parse_kv_line(line) {
                if let Some(val_opt) = update_map.get(k.as_str()) {
                    if !handled.contains(&k) {
                        handled.insert(k.clone());
                        if let Some(val) = val_opt {
                            if !val.is_empty() {
                                next_lines.push(format!("{} = {}", k, val));
                            }
                        }
                    }
                    continue;
                }
            }
            next_lines.push(line.clone());
        }

        let mut insert_idx = next_lines.len();
        while insert_idx > 0 && next_lines[insert_idx - 1].trim().is_empty() {
            insert_idx -= 1;
        }

        let mut to_insert = Vec::new();
        for (k, v) in updates {
            if !handled.contains(*k) {
                if let Some(val) = v {
                    if !val.is_empty() {
                        to_insert.push(format!("{} = {}", k, val));
                    }
                }
            }
        }

        if !to_insert.is_empty() {
            next_lines.splice(insert_idx..insert_idx, to_insert);
        }

        existing.lines = next_lines;
        return;
    }

    let mut new_lines = Vec::new();
    for (k, v) in updates {
        if let Some(val) = v {
            if !val.is_empty() {
                new_lines.push(format!("{} = {}", k, val));
            }
        }
    }

    doc.sections.push(IniSection {
        header,
        key: Some(new_key.to_string()),
        lines: new_lines,
    });
}

fn remove_section(doc: &mut IniDoc, target_key: &str) {
    doc.sections
        .retain(|s| s.key.as_deref() != Some(target_key));
}

fn serialize_ini(doc: &IniDoc) -> String {
    let mut output_lines: Vec<String> = Vec::new();

    let mut trimmed_preamble = doc.preamble.clone();
    while trimmed_preamble
        .last()
        .map(|s| s.trim().is_empty())
        .unwrap_or(false)
    {
        trimmed_preamble.pop();
    }
    output_lines.extend(trimmed_preamble);

    for section in &doc.sections {
        if output_lines
            .last()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
        {
            output_lines.push(String::new());
        }
        output_lines.push(section.header.clone());

        let mut section_lines = section.lines.clone();
        while section_lines
            .last()
            .map(|s| s.trim().is_empty())
            .unwrap_or(false)
        {
            section_lines.pop();
        }
        output_lines.extend(section_lines);
    }

    if output_lines.is_empty() {
        return String::new();
    }

    format!("{}\n", output_lines.join("\n"))
}

fn read_ini_file(file_path: &Path, is_config: bool) -> Result<IniDoc, String> {
    if !file_path.exists() {
        return Ok(IniDoc {
            preamble: Vec::new(),
            sections: Vec::new(),
        });
    }
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read {}: {}", file_path.display(), e))?;
    Ok(parse_ini(&content, is_config))
}

fn write_ini_file(aws_dir: &Path, file_path: &Path, doc: &IniDoc) -> Result<(), String> {
    if !aws_dir.exists() {
        fs::create_dir_all(aws_dir)
            .map_err(|e| format!("Failed to create {}: {}", aws_dir.display(), e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(aws_dir, fs::Permissions::from_mode(0o700));
        }
    }
    fs::write(file_path, serialize_ini(doc))
        .map_err(|e| format!("Failed to write {}: {}", file_path.display(), e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(file_path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn get_profile_regions(paths: &AwsPaths) -> HashMap<String, String> {
    let mut regions = HashMap::new();
    if let Ok(doc) = read_ini_file(&paths.config_path, true) {
        for section in &doc.sections {
            if let Some(key) = &section.key {
                let kv = parse_key_values(&section.lines);
                if let Some(region) = kv.get("region") {
                    if !region.is_empty() {
                        regions.insert(key.clone(), region.clone());
                    }
                }
            }
        }
    }
    regions
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

pub fn get_aws_profiles() -> Result<Vec<AwsProfile>, String> {
    let paths = get_aws_paths()?;
    if !paths.credentials_path.exists() {
        return Ok(Vec::new());
    }

    let profile_regions = get_profile_regions(&paths);
    let doc = read_ini_file(&paths.credentials_path, false)?;
    let mut profiles = Vec::new();

    for section in &doc.sections {
        if let Some(profile_name) = &section.key {
            let kv = parse_key_values(&section.lines);
            let region = profile_regions
                .get(profile_name)
                .cloned()
                .or_else(|| kv.get("region").cloned())
                .unwrap_or_else(|| DEFAULT_REGION.to_string());

            profiles.push(AwsProfile {
                id: format!("account-{}", profiles.len() + 1),
                name: capitalize_first(profile_name),
                profile: profile_name.clone(),
                region,
                access_key_id: kv.get("aws_access_key_id").cloned().unwrap_or_default(),
                secret_access_key: kv.get("aws_secret_access_key").cloned().unwrap_or_default(),
                session_token: kv.get("aws_session_token").cloned().unwrap_or_default(),
            });
        }
    }

    Ok(profiles)
}

pub fn get_profile_by_name(profile_name: &str) -> Result<AwsProfile, String> {
    let profiles = get_aws_profiles()?;
    profiles
        .into_iter()
        .find(|p| p.profile == profile_name)
        .ok_or_else(|| format!("AWS profile \"{}\" not found in ~/.aws/credentials.", profile_name))
}

pub fn add_aws_profile(input: AccountInput) -> Result<Vec<AwsProfile>, String> {
    let profile_name = validate_profile_name(&input.profile)?;
    let access_key_id = input.access_key_id.trim().to_string();
    let secret_access_key = input
        .secret_access_key
        .unwrap_or_default()
        .trim()
        .to_string();
    let region = input
        .region
        .unwrap_or_default()
        .trim()
        .to_string();
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

    let paths = get_aws_paths()?;
    let mut cred_doc = read_ini_file(&paths.credentials_path, false)?;

    if cred_doc
        .sections
        .iter()
        .any(|s| s.key.as_deref() == Some(profile_name.as_str()))
    {
        return Err(format!("Profile \"{}\" already exists.", profile_name));
    }

    let session_opt = if session_token.is_empty() {
        None
    } else {
        Some(session_token)
    };

    upsert_section(
        &mut cred_doc,
        &profile_name,
        &profile_name,
        &[
            ("aws_access_key_id", Some(access_key_id)),
            ("aws_secret_access_key", Some(secret_access_key)),
            ("aws_session_token", session_opt),
        ],
        false,
    );
    write_ini_file(&paths.aws_dir, &paths.credentials_path, &cred_doc)?;

    let mut config_doc = read_ini_file(&paths.config_path, true)?;
    upsert_section(
        &mut config_doc,
        &profile_name,
        &profile_name,
        &[("region", Some(region))],
        true,
    );
    write_ini_file(&paths.aws_dir, &paths.config_path, &config_doc)?;

    get_aws_profiles()
}

pub fn update_aws_profile(
    original_profile_name: &str,
    input: AccountInput,
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

    let paths = get_aws_paths()?;
    let mut cred_doc = read_ini_file(&paths.credentials_path, false)?;

    if !cred_doc
        .sections
        .iter()
        .any(|s| s.key.as_deref() == Some(original_profile_name))
    {
        return Err(format!("Profile \"{}\" not found.", original_profile_name));
    }

    if new_profile_name != original_profile_name
        && cred_doc
            .sections
            .iter()
            .any(|s| s.key.as_deref() == Some(new_profile_name.as_str()))
    {
        return Err(format!("Profile \"{}\" already exists.", new_profile_name));
    }

    let session_opt = if session_token.is_empty() {
        None
    } else {
        Some(session_token)
    };

    let mut updates: Vec<(&str, Option<String>)> = vec![
        ("aws_access_key_id", Some(access_key_id)),
        ("aws_session_token", session_opt),
    ];
    if !secret_access_key.is_empty() {
        updates.push(("aws_secret_access_key", Some(secret_access_key)));
    }

    upsert_section(
        &mut cred_doc,
        original_profile_name,
        &new_profile_name,
        &updates,
        false,
    );
    write_ini_file(&paths.aws_dir, &paths.credentials_path, &cred_doc)?;

    let mut config_doc = read_ini_file(&paths.config_path, true)?;
    upsert_section(
        &mut config_doc,
        original_profile_name,
        &new_profile_name,
        &[("region", Some(region))],
        true,
    );
    write_ini_file(&paths.aws_dir, &paths.config_path, &config_doc)?;

    get_aws_profiles()
}

pub fn remove_aws_profile(profile_name: &str) -> Result<Vec<AwsProfile>, String> {
    let paths = get_aws_paths()?;

    if paths.credentials_path.exists() {
        let mut cred_doc = read_ini_file(&paths.credentials_path, false)?;
        remove_section(&mut cred_doc, profile_name);
        write_ini_file(&paths.aws_dir, &paths.credentials_path, &cred_doc)?;
    }

    if paths.config_path.exists() {
        let mut config_doc = read_ini_file(&paths.config_path, true)?;
        remove_section(&mut config_doc, profile_name);
        write_ini_file(&paths.aws_dir, &paths.config_path, &config_doc)?;
    }

    get_aws_profiles()
}
