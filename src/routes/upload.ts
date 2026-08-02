import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { requireAuth } from "../lib/session";
import { supabase } from "../lib/supabase";

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.use("*", requireAuth);

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

  // Generate a unique path: tenant_id/timestamp-filename
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${user.tenantId}/${Date.now()}-${safeName}`;

  try {
    // Convert File to ArrayBuffer for Supabase upload.
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase.storage
      .from("documents")
      .upload(filePath, uint8Array, {
        contentType: file.type || "application/octet-stream",
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
    }, 200);
  } catch (err) {
    console.error("Upload exception:", err);
    return c.json({ error: `Erro interno: ${(err as Error).message}` }, 500);
  }
});
