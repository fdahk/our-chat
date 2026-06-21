// S3 兼容对象存储抽象层。dev 连 MinIO、prod 连腾讯云 COS(S3 兼容 endpoint),
// 业务代码只依赖本模块导出的函数,不直接碰文件系统,也不感知底层是 MinIO 还是 COS。
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomUUID } from 'crypto';
import path from 'path';
import type { Readable } from 'stream';

const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const region = process.env.S3_REGION ?? 'us-east-1';
const bucket = process.env.S3_BUCKET ?? 'our-chat';
const accessKeyId = process.env.S3_ACCESS_KEY ?? 'minioadmin';
const secretAccessKey = process.env.S3_SECRET_KEY ?? 'minioadmin123';
// MinIO 必须 path-style(endpoint/bucket/key);COS 两种都支持,统一开
const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true';
const publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL ?? `${endpoint}/${bucket}`).replace(/\/+$/, '');

const client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle,
});

export const STORAGE_BUCKET = bucket;

/** 对象键 → 可公开访问的完整 URL(bucket 公有读) */
export function publicUrl(key: string): string {
  return `${publicBaseUrl}/${key}`;
}

/**
 * 生成对象键:uploads/{yyyymm}/{base}{ext}。
 * base 传 md5(秒传去重友好,同内容同 key)或留空用 uuid(分片等无 md5 场景)。
 */
export function buildObjectKey(originalName: string, base?: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  return `uploads/${yyyymm}/${base ?? randomUUID()}${ext}`;
}

export async function putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/** 流式直传(边收边传,不在内存里聚合整文件)。供 /stream 端点用。 */
export async function putObjectStream(
  key: string,
  body: Readable,
  contentType?: string,
): Promise<void> {
  const uploader = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType },
  });
  await uploader.done();
}

export async function getObjectStream(key: string): Promise<Readable> {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return res.Body as Readable;
}

export async function deleteObject(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** 对象存在则返回元信息,不存在返回 null(用于校验) */
export async function headObject(
  key: string,
): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch {
    return null;
  }
}

// ==================== 分片上传(S3 multipart)====================

export async function createMultipartUpload(key: string, contentType?: string): Promise<string> {
  const res = await client.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
  );
  if (!res.UploadId) throw new Error('createMultipartUpload 未返回 UploadId');
  return res.UploadId;
}

/** 上传一个分片,返回该片的 ETag(完成合并时需要)。partNumber 从 1 开始。 */
export async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const res = await client.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    }),
  );
  if (!res.ETag) throw new Error('uploadPart 未返回 ETag');
  return res.ETag;
}

/** 查询某次 multipart 已上传的分片(断点续传用),按 partNumber 升序 */
export async function listUploadedParts(
  key: string,
  uploadId: string,
): Promise<{ partNumber: number; etag: string }[]> {
  const parts: { partNumber: number; etag: string }[] = [];
  let marker: string | undefined;
  for (;;) {
    const res = await client.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
    );
    for (const p of res.Parts ?? []) {
      if (p.PartNumber != null && p.ETag != null) {
        parts.push({ partNumber: p.PartNumber, etag: p.ETag });
      }
    }
    if (!res.IsTruncated) break;
    marker = res.NextPartNumberMarker;
    if (!marker) break;
  }
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await client.send(
    new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
  );
}
