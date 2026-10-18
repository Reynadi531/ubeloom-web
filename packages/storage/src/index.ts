/**
 * Private S3-compatible object storage (RustFS in development). Objects are never
 * public: readers get short-lived presigned URLs.
 */
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageConfig = {
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_BUCKET: string;
};

const PRESIGN_SECONDS = 10 * 60;

export function createStorage(env: StorageConfig) {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // RustFS / MinIO style endpoints address buckets by path, not subdomain.
    forcePathStyle: true,
  });
  const bucket = env.S3_BUCKET;

  let bucketReady: Promise<void> | undefined;

  /** Creates the bucket on first use so a fresh dev volume works without setup. */
  function ensureBucket() {
    bucketReady ??= (async () => {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })().catch((error) => {
      bucketReady = undefined;
      throw error;
    });
    return bucketReady;
  }

  return {
    async putObject(key: string, body: Uint8Array, contentType: string) {
      await ensureBucket();
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    /** Short-lived GET URL for a private object. */
    presignGet(key: string) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: PRESIGN_SECONDS,
      });
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
