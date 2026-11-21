import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketLocationCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-provider-ini';

/**
 * Create an S3 client for the specified account
 * @param {Object} account - The AWS account object
 * @param {string} [regionOverride] - Optional region override
 * @returns {S3Client} S3 client instance
 */
const createS3Client = (account, regionOverride) => {
  return new S3Client({
    region: regionOverride || account.region || 'us-east-1',
    credentials: fromIni({ profile: account.profile }),
    followRegionRedirects: true,
  });
};

/**
 * Format byte counts into human-readable sizes
 * @param {number} bytes
 * @returns {string}
 */
export const formatBytes = (bytes) => {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return idx === 0 ? `${bytes} B` : `${val.toFixed(1)} ${units[idx]}`;
};

/**
 * Format a Date object as YYYY-MM-DD HH:MM
 * @param {Date|string|undefined} date
 * @returns {string}
 */
export const formatDate = (date) => {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(0, 16).replace('T', ' ');
};

/**
 * Expand leading ~ to home directory and resolve path
 * @param {string} inputPath
 * @returns {string}
 */
export const expandHomePath = (inputPath) => {
  const trimmed = (inputPath || '').trim();
  if (!trimmed) return '';
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return join(homedir(), trimmed.slice(2));
  }
  return resolve(trimmed);
};

/**
 * Validate an S3 bucket name according to AWS naming rules
 * @param {string} name
 * @returns {string} Trimmed bucket name
 */
export const validateBucketName = (name) => {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Bucket name is required.');
  }
  if (trimmed.length < 3 || trimmed.length > 63) {
    throw new Error('Bucket name must be between 3 and 63 characters.');
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(trimmed)) {
    throw new Error('Bucket name must use lowercase letters, numbers, dots, or hyphens, and start/end with a letter or number.');
  }
  if (trimmed.includes('..')) {
    throw new Error('Bucket name cannot contain consecutive periods.');
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    throw new Error('Bucket name cannot be formatted as an IP address.');
  }
  return trimmed;
};

/**
 * Compute parent prefix for S3 folder navigation
 * @param {string} prefix - Current prefix (e.g. "a/b/")
 * @returns {string} Parent prefix (e.g. "a/", or "" for top-level)
 */
export const getParentPrefix = (prefix) => {
  if (!prefix) return '';
  const withoutTrailing = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const lastSlash = withoutTrailing.lastIndexOf('/');
  return lastSlash >= 0 ? withoutTrailing.slice(0, lastSlash + 1) : '';
};

/**
 * Resolve the AWS region for an existing S3 bucket
 * @param {Object} account
 * @param {string} bucketName
 * @returns {Promise<string>}
 */
export const getBucketRegion = async (account, bucketName) => {
  const fallback = account.region || 'us-east-1';
  try {
    const client = createS3Client(account);
    const resp = await client.send(new GetBucketLocationCommand({ Bucket: bucketName }));
    const loc = resp.LocationConstraint;
    if (!loc) return 'us-east-1';
    if (loc === 'EU') return 'eu-west-1';
    return loc;
  } catch {
    return fallback;
  }
};

/**
 * List all S3 buckets in the account
 * @param {Object} account
 * @returns {Promise<Array>}
 */
export const loadBuckets = async (account) => {
  try {
    const client = createS3Client(account);
    const response = await client.send(new ListBucketsCommand({}));
    const buckets = (response.Buckets || []).map((b) => ({
      name: b.Name,
      creationDate: b.CreationDate,
      formattedDate: formatDate(b.CreationDate),
    }));
    return buckets.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    throw new Error(`Failed to load S3 buckets: ${err.message}`);
  }
};

/**
 * Create a new S3 bucket
 * @param {Object} account
 * @param {Object} bucketData - { name, region }
 * @returns {Promise<string>} Created bucket name
 */
export const createBucket = async (account, bucketData) => {
  const bucketName = validateBucketName(bucketData.name);
  const region = (bucketData.region || '').trim() || account.region || 'us-east-1';

  try {
    const client = createS3Client(account, region);
    const params = { Bucket: bucketName };
    if (region !== 'us-east-1') {
      params.CreateBucketConfiguration = {
        LocationConstraint: region,
      };
    }
    await client.send(new CreateBucketCommand(params));
    return bucketName;
  } catch (err) {
    throw new Error(`Failed to create bucket: ${err.message}`);
  }
};

/**
 * Delete an empty S3 bucket
 * @param {Object} account
 * @param {string} bucketName
 * @returns {Promise<void>}
 */
export const deleteBucket = async (account, bucketName) => {
  try {
    const client = createS3Client(account);
    await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
  } catch (err) {
    throw new Error(`Failed to delete bucket: ${err.message}`);
  }
};

/**
 * List folders and objects inside an S3 bucket at the given prefix
 * @param {Object} account
 * @param {string} bucketName
 * @param {string} [prefix='']
 * @returns {Promise<Array>}
 */
export const loadBucketObjects = async (account, bucketName, prefix = '') => {
  try {
    const client = createS3Client(account);
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        Delimiter: '/',
        MaxKeys: 500,
      })
    );

    const folders = (response.CommonPrefixes || [])
      .filter((cp) => cp.Prefix)
      .map((cp) => ({
        key: cp.Prefix,
        displayName: cp.Prefix.startsWith(prefix) ? cp.Prefix.slice(prefix.length) : cp.Prefix,
        isFolder: true,
        size: null,
        formattedSize: '<DIR>',
        lastModified: null,
        formattedDate: '-',
      }));

    const files = (response.Contents || [])
      .filter((obj) => obj.Key && obj.Key !== prefix)
      .map((obj) => ({
        key: obj.Key,
        displayName: obj.Key.startsWith(prefix) ? obj.Key.slice(prefix.length) : obj.Key,
        isFolder: false,
        size: obj.Size ?? 0,
        formattedSize: formatBytes(obj.Size ?? 0),
        lastModified: obj.LastModified,
        formattedDate: formatDate(obj.LastModified),
      }));

    return [...folders, ...files];
  } catch (err) {
    throw new Error(`Failed to load objects: ${err.message}`);
  }
};

/**
 * Upload a local file to an S3 bucket
 * @param {Object} account
 * @param {string} bucketName
 * @param {Object} uploadData - { localPath, key }
 * @returns {Promise<string>} Uploaded S3 object key
 */
export const uploadObject = async (account, bucketName, uploadData) => {
  const resolvedLocal = expandHomePath(uploadData.localPath);
  if (!resolvedLocal) {
    throw new Error('Local file path is required.');
  }
  if (!existsSync(resolvedLocal)) {
    throw new Error(`File not found: ${resolvedLocal}`);
  }
  const stat = statSync(resolvedLocal);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolvedLocal}`);
  }

  let key = (uploadData.key || '').trim();
  if (!key) {
    key = basename(resolvedLocal);
  } else if (key.endsWith('/')) {
    key = `${key}${basename(resolvedLocal)}`;
  }

  try {
    const client = createS3Client(account);
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: createReadStream(resolvedLocal),
        ContentLength: stat.size,
      })
    );
    return key;
  } catch (err) {
    throw new Error(`Failed to upload object: ${err.message}`);
  }
};

/**
 * Download an S3 object to a local file path
 * @param {Object} account
 * @param {string} bucketName
 * @param {string} key
 * @param {string} destinationPath
 * @returns {Promise<string>} Resolved local destination path
 */
export const downloadObject = async (account, bucketName, key, destinationPath) => {
  const resolvedDest = expandHomePath(destinationPath);
  if (!resolvedDest) {
    throw new Error('Destination path is required.');
  }

  try {
    const client = createS3Client(account);
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    const parentDir = dirname(resolvedDest);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const bodyStream =
      typeof response.Body?.pipe === 'function'
        ? response.Body
        : Readable.fromWeb(response.Body);

    await pipeline(bodyStream, createWriteStream(resolvedDest));
    return resolvedDest;
  } catch (err) {
    throw new Error(`Failed to download object: ${err.message}`);
  }
};

/**
 * Delete an object from an S3 bucket
 * @param {Object} account
 * @param {string} bucketName
 * @param {string} key
 * @returns {Promise<void>}
 */
export const deleteObject = async (account, bucketName, key) => {
  try {
    const client = createS3Client(account);
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
  } catch (err) {
    throw new Error(`Failed to delete object: ${err.message}`);
  }
};
