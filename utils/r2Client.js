const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

let client = null;
const getClient = () => {
  if (!client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials missing — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
    }
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
};

// Uploads a buffer to R2 under `key` and returns its public URL. Pass
// `downloadName` to make the browser download-with-filename instead of
// rendering the PDF inline when the URL is opened directly.
const uploadToR2 = async (key, buffer, { contentType = 'application/pdf', downloadName } = {}) => {
  if (!R2_BUCKET_NAME) throw new Error('R2_BUCKET_NAME missing in .env');
  if (!R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL missing in .env');

  await getClient().send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ...(downloadName ? { ContentDisposition: `attachment; filename="${downloadName}"` } : {}),
  }));

  return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
};

module.exports = { uploadToR2 };
