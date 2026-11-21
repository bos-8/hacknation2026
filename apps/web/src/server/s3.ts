import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";

export const s3EndpointSchema = z.url().pipe(z.string().refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" &&
    (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "s3", "seaweedfs"].includes(url.hostname)));
}));

export const s3BucketSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/);

export function createS3Client({ endpoint, region, accessKeyId, secretAccessKey }: {
  endpoint: string; region: string; accessKeyId: string; secretAccessKey: string;
}) {
  return new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 } });
}
