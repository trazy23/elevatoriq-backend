const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const storageServiceMock = require('./storageService-mock');
require('dotenv').config();

// Cloudflare R2 uses S3-compatible API with a jurisdiction-specific endpoint
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT, // Required for Cloudflare R2
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET;

// Upload file buffer to S3, returns the S3 key
async function upload(file, caseId) {
  const ext = path.extname(file.originalname);
  const key = `uploads/${caseId}/${Date.now()}${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));
  return key;
}

// Upload a raw buffer (e.g. generated PDF) to S3, with mock fallback
async function uploadBuffer(buffer, key, contentType = 'application/octet-stream') {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return key;
  } catch (err) {
    console.warn(`[Storage] S3 upload failed (${err.message}), using mock storage`);
    await storageServiceMock.upload(buffer, key);
    return key;
  }
}

// Download a file from S3, returns Buffer — falls back to mock storage if S3 unavailable
async function download(key) {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    console.warn(`[Storage] S3 download failed (${err.message}), trying mock storage`);
    return storageServiceMock.download(key);
  }
}

// Get a presigned download URL (7 days)
async function getPresignedUrl(key, expiresIn = 604800) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

module.exports = { upload, uploadBuffer, download, getPresignedUrl };
