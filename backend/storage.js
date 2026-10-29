const { fail } = require("./apiHelpers");
function createStorage(env = process.env, fetcher = fetch) {
  const bucket = env.SUPABASE_STORAGE_BUCKET || "harvest-images";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  let base;
  if (env.SUPABASE_URL || key) {
    try {
      const url = new URL(env.SUPABASE_URL);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        (url.protocol !== "https:" &&
          !(
            local &&
            env.NODE_ENV !== "production" &&
            url.protocol === "http:"
          )) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !key ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(bucket)
      )
        throw new Error();
      base = url.origin;
    } catch {
      throw new Error(
        "Configure a valid SUPABASE_URL, backend service key and Storage bucket.",
      );
    }
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const encode = (path) => path.split("/").map(encodeURIComponent).join("/");
  let verifiedUntil = 0,
    checking;
  async function request(path, options = {}) {
    if (!base) fail(503, "Image storage is not configured.");
    let response;
    try {
      response = await fetcher(`${base}/storage/v1${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      fail(
        503,
        "Image storage is temporarily unavailable. Retry with the same event ID.",
      );
    }
    return response;
  }
  async function privateBucket() {
    if (Date.now() < verifiedUntil) return;
    if (checking) return checking;
    checking = (async () => {
      const response = await request(`/bucket/${encodeURIComponent(bucket)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.public !== false)
        fail(503, "A private harvest image bucket must be configured.");
      verifiedUntil = Date.now() + 60000;
    })();
    try {
      await checking;
    } finally {
      checking = null;
    }
  }
  async function upload({ farmerId, gatewayId, eventId, image }) {
    await privateBucket();
    const path = `${farmerId}/${gatewayId}/${eventId}/${image.sequence_number}-${image.sha256}.${image.content_type === "image/png" ? "png" : "jpg"}`;
    const response = await request(
      `/object/${encodeURIComponent(bucket)}/${encode(path)}`,
      {
        method: "POST",
        headers: { "Content-Type": image.content_type, "x-upsert": "false" },
        body: image.bytes,
      },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      // Only reuse deterministic, content-addressed paths inside our verified private bucket.
      if (!(
        response.status === 409 ||
        (response.status === 400 &&
          ["Duplicate", "409"].includes(
            String(data?.error || data?.statusCode),
          ))
      ))
        fail(503, "Image upload failed. Retry with the same event ID.");
    }
    return { bucket, path, sha256: image.sha256 };
  }
  async function signRows(rows, farmerId) {
    const cloud = rows.filter((row) => row.storage_path);
    if (!cloud.length) return rows;
    try {
      await privateBucket();
      if (
        cloud.some(
          (row) =>
            row.storage_bucket !== bucket ||
            !row.storage_path.startsWith(`${farmerId}/`) ||
            row.storage_path
              .split("/")
              .some((part) => !part || part === "." || part === ".."),
        )
      )
        throw new Error();
      const paths = [...new Set(cloud.map((row) => row.storage_path))];
      const response = await request(
        `/object/sign/${encodeURIComponent(bucket)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths, expiresIn: 300 }),
        },
      );
      const signed = await response.json();
      if (!response.ok || !Array.isArray(signed)) throw new Error();
      const urls = new Map();
      for (const entry of signed) {
        if (!entry.signedURL || entry.error) continue;
        const value = entry.signedURL.startsWith("/object/")
          ? `/storage/v1${entry.signedURL}`
          : entry.signedURL;
        const url = new URL(value, base);
        if (
          url.origin === base &&
          url.pathname.startsWith("/storage/v1/object/sign/")
        )
          urls.set(entry.path, url.href);
      }
      return rows.map((row) =>
        row.storage_path
          ? {
              ...row,
              image_path: urls.get(row.storage_path) || null,
              ...(!urls.has(row.storage_path)
                ? { image_error: "Image access is temporarily unavailable." }
                : {}),
              url_expires_at: new Date(Date.now() + 300000).toISOString(),
            }
          : row,
      );
    } catch {
      console.error("Image signing unavailable.");
      return rows.map((row) =>
        row.storage_path
          ? {
              ...row,
              image_path: null,
              image_error: "Image access is temporarily unavailable.",
            }
          : row,
      );
    }
  }
  return { configured: Boolean(base), upload, signRows };
}
module.exports = { createStorage };
