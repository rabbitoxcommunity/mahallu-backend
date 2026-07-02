const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

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

// Derives the R2 object key from a previously-returned public URL, or null
// if the URL isn't one of ours (e.g. a legacy local path).
const keyFromUrl = (url) => {
  if (!R2_PUBLIC_URL || !url) return null;
  const prefix = `${R2_PUBLIC_URL.replace(/\/$/, '')}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
};

// Deletes the object a previously-returned public URL points to. Silently
// no-ops for URLs that aren't ours (e.g. legacy local paths) or if missing.
const deleteFromR2ByUrl = async (url) => {
  const key = keyFromUrl(url);
  if (!R2_BUCKET_NAME || !key) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error('Failed to delete R2 object', key, err.message);
  }
};

// Fetches an object's stream/metadata from R2 for proxying through our own
// server — avoids exposing browsers to the R2 origin directly, which sidesteps
// CORS entirely (R2.dev doesn't send CORS headers by default) since the
// browser only ever talks to our own API origin. Returns null if the URL
// isn't ours.
const streamFromR2ByUrl = async (url) => {
  const key = keyFromUrl(url);
  if (!R2_BUCKET_NAME || !key) return null;
  const obj = await getClient().send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  return { body: obj.Body, contentType: obj.ContentType, contentLength: obj.ContentLength };
};

module.exports = { uploadToR2, deleteFromR2ByUrl, streamFromR2ByUrl };
