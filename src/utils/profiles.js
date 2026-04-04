import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Parse AWS credentials file and extract profile names
 * @returns {Array} Array of AWS account profile objects
 */
export const getAwsProfiles = () => {
  const credentialsPath = join(homedir(), '.aws', 'credentials');
  
  if (!existsSync(credentialsPath)) {
    return [];
  }
  
  try {
    const content = readFileSync(credentialsPath, 'utf8');
    const profileRegex = /^\[([^\]]+)\]/gm;
    const profiles = [];
    let match;
    
    while ((match = profileRegex.exec(content)) !== null) {
      const profileName = match[1];
      // Skip 'default' profile or include it as 'default'
      profiles.push({
        id: `account-${profiles.length + 1}`,
        name: profileName.charAt(0).toUpperCase() + profileName.slice(1),
        profile: profileName,
        region: 'us-east-1', // Default region, could be customized
      });
    }
    
    return profiles;
  } catch (err) {
    console.error('Error reading AWS credentials:', err);
    return [];
  }
};
