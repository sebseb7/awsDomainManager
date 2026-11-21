import QRCode from 'qrcode';

/**
 * Build a compact, universally parseable JSON payload for S3 bucket credentials QR codes.
 * @param {Object} params
 * @param {string} params.bucket
 * @param {string} params.region
 * @param {string} params.accessKeyId
 * @param {string} params.secretAccessKey
 * @param {string} [params.role]
 * @returns {string}
 */
export const buildBucketQrPayload = ({
  bucket,
  region,
  accessKeyId,
  secretAccessKey,
  role,
}) => {
  const payload = {
    bucket,
    region,
    ...(role ? { role } : {}),
    accessKeyId,
    secretAccessKey,
  };
  return JSON.stringify(payload);
};

/**
 * Render a QR code into compact Unicode half-block terminal lines.
 * Intended to be displayed with black foreground on white background so
 * cameras can scan it reliably on both dark and light terminal themes.
 * @param {string} text
 * @param {Object} [options]
 * @param {number} [options.margin=2]
 * @param {'L'|'M'|'Q'|'H'} [options.errorCorrectionLevel='L']
 * @returns {string[]}
 */
export const renderQrLines = (text, options = {}) => {
  const { margin = 2, errorCorrectionLevel = 'L' } = options;
  const qr = QRCode.create(text, { errorCorrectionLevel });
  const size = qr.modules.size;
  const totalSize = size + margin * 2;

  const isDark = (row, col) => {
    const r = row - margin;
    const c = col - margin;
    if (r < 0 || r >= size || c < 0 || c >= size) {
      return false;
    }
    return Boolean(qr.modules.get(r, c));
  };

  const lines = [];
  for (let row = 0; row < totalSize; row += 2) {
    let line = '';
    for (let col = 0; col < totalSize; col++) {
      const top = isDark(row, col);
      const bottom = row + 1 < totalSize ? isDark(row + 1, col) : false;

      if (top && bottom) {
        line += '█';
      } else if (top && !bottom) {
        line += '▀';
      } else if (!top && bottom) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }

  return lines;
};
