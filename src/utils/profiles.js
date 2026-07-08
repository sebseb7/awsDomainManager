import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Parse AWS config file and extract region per profile
 * @returns {Object} Map of profile name to region
 */
const getProfileRegions = () => {
  const configPath = join(homedir(), '.aws', 'config');
  const regions = {};

  if (!existsSync(configPath)) {
    return regions;
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    const lines = content.split('\n');
    let currentProfile = 'default';

    for (const line of lines) {
      const profileMatch = line.match(/^\[profile\s+([^\]]+)\]$/);
      const defaultMatch = line.match(/^\[default\]$/);
      if (profileMatch) {
        currentProfile = profileMatch[1];
      } else if (defaultMatch) {
        currentProfile = 'default';
      }

      const regionMatch = line.match(/^region\s*=\s*(\S+)$/);
      if (regionMatch) {
        regions[currentProfile] = regionMatch[1];
      }
    }
  } catch (err) {
    // Silently ignore config parse errors
  }

  return regions;
};

/**
 * Parse AWS credentials file and extract profile names
 * @returns {Array} Array of AWS account profile objects
 */
export const getAwsProfiles = () => {
  const credentialsPath = join(homedir(), '.aws', 'credentials');

  if (!existsSync(credentialsPath)) {
    return [];
  }

  // Also try the config file for regions
  const configPath = join(homedir(), '.aws', 'config');
  const profileRegions = getProfileRegions();

  try {
    const content = readFileSync(credentialsPath, 'utf8');
    const profileRegex = /^\[([^\]]+)\]$/gm;
    const profiles = [];
    let match;

    while ((match = profileRegex.exec(content)) !== null) {
      const profileName = match[1];
      const region = profileRegions[profileName] || 'us-east-1';
      profiles.push({
        id: `account-${profiles.length + 1}`,
        name: profileName.charAt(0).toUpperCase() + profileName.slice(1),
        profile: profileName,
        region: region,
      });
    }

    return profiles;
  } catch (err) {
    console.error('Error reading AWS credentials:', err);
    return [];
  }
};
