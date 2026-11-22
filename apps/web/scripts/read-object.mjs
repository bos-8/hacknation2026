import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function readObject(client, bucket, key, maxBytes) {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: AbortSignal.timeout(15000) });
  if (!result.Body) throw new Error("File storage returned no data");
  const reader = result.Body.transformToWebStream().getReader();
  try {
    if ((result.ContentLength ?? Infinity) > maxBytes) throw new Error("Stored file exceeds preview limit");
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Stored file exceeds preview limit");
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks, size));
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}
