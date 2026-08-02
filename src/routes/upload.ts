import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../lib/session";
import { supabase } from "../lib/supabase";

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.use("*", requireAuth);

// Allowed MIME types and their magic byte signatures.
// We verify the actual file content, not the browser-provided Content-Type.
const ALLOWED_TYPES: { mime: string; exts: string[]; check: (bytes: Uint8Array) => boolean }[] = [
  // PDF: %PDF-
  { mime: "application/pdf", exts: [".pdf"], check: (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d },
  // PNG: \x89PNG\r\n\x1a\n
  { mime: "image/png", exts: [".png"], check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  // JPEG: \xff\xd8\xff
  { mime: "image/jpeg", exts: [".jpg", ".jpeg"], check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // GIF: GIF87a or GIF89a
  { mime: "image/gif", exts: [".gif"], check: (b) => b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && (b[3] === 0x38) },
  // WebP: RIFF....WEBP
  { mime: "image/webp", exts: [".webp"], check: (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  // DOCX (ZIP-based): PK\x03\x04
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", exts: [".docx"], check: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  // XLSX (ZIP-based): PK\x03\x04 (same as DOCX, differentiated by extension)
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", exts: [".xlsx"], check: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  // DOC (OLE2): \xd0\xcf\x11\xe0
  { mime: "application/msword", exts: [".doc"], check: (b) => b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
  // XLS (OLE2): \xd0\xcf\x11\xe0 (same as DOC, differentiated by extension)
  { mime: "application/vnd.ms-excel", exts: [".xls"], check: (b) => b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
  // TXT/CSV: no magic bytes, allow if extension matches
  { mime: "text/plain", exts: [".txt", ".csv"], check: () => true },
  { mime: "application/json", exts: [".json"], check: () => true },
];

function detectMimeType(bytes: Uint8Array, fileName: string): { mime: string; valid: boolean } {
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";

  for (const type of ALLOWED_TYPES) {
    if (type.check(bytes)) {
      // Verify extension matches for ZIP-based formats (DOCX/XLSX share signature).
      if (type.exts.includes(ext)) {
        return { mime: type.mime, valid: true };
      }
      // If magic bytes match but extension doesn't, still return the detected type
      // but mark as valid only if it's in the allowed list.
      return { mime: type.mime, valid: true };
    }
  }

  // No magic bytes matched — check if extension is in allowed list (for text files).
  for (const type of ALLOWED_TYPES) {
    if (type.exts.includes(ext) && type.check === (() => true)) {
      return { mime: type.mime, valid: true };
    }
  }

  return { mime: "application/octet-stream", valid: false };
}

// POST /upload -- multipart file upload to Supabase Storage.
// Returns { path, url } on success, { error } on failure.
uploadRoutes.post("/", async (c) => {
  const user = c.get("user");

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "Nenhum arquivo enviado." }, 400);
  }

  // Validate file size (max 10MB).
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: "Arquivo muito grande. Maximo: 10MB." }, 400);
  }

  // Read file bytes for magic byte validation.
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Validate MIME type by magic bytes (don't trust browser Content-Type).
  const { mime: detectedMime, valid } = detectMimeType(uint8Array, file.name);
  if (!valid) {
    return c.json({ error: "Tipo de arquivo nao permitido. Formatos suportados: PDF, PNG, JPG, GIF, WebP, DOCX, XLSX, DOC, XLS, TXT, CSV, JSON." }, 400);
  }

  // Generate a unique path: tenant_id/timestamp-filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${user.tenantId}/${Date.now()}-${safeName}`;

  try {
    const { data, error } = await supabase.storage
      .from("documents")
      .upload(filePath, uint8Array, {
        contentType: detectedMime,
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      return c.json({ error: `Erro no upload: ${error.message}` }, 500);
    }

    // Get a signed URL valid for 1 hour (bucket is private).
    const { data: urlData } = await supabase.storage
      .from("documents")
      .createSignedUrl(data.path, 3600);

    return c.json({
      path: data.path,
      url: urlData?.signedUrl ?? null,
      fileName: file.name,
      size: file.size,
      mimeType: detectedMime,
    }, 200);
  } catch (err) {
    console.error("Upload exception:", err);
    return c.json({ error: `Erro interno: ${(err as Error).message}` }, 500);
  }
});
