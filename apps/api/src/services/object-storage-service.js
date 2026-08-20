import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

export function createObjectStorageService(config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(config.serverSideEncryption ? { ServerSideEncryption: config.serverSideEncryption } : {})
      }));
    },
    async get(key) {
      const result = await client.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: key
      }));
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key
      }));
    }
  };
}
