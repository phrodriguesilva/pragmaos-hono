// Document versioning system.
// Tracks changes to documents, storing each version in Supabase Storage
// and metadata in the document_versions table.
//
// PragmaOS 2.

import { supabase } from "./supabase";
import { log } from "./logger";

export interface DocumentVersion {
  id: string;
  documentId: string;
  tenantId: string;
  versionNumber: number;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName?: string;
  changeSummary?: string;
  createdAt: string;
}

// Create a new version of a document.
// Uploads the file to Storage and records the version metadata.
export async function createDocumentVersion(
  tenantId: string,
  documentId: string,
  file: File | Blob,
  mimeType: string,
  uploadedBy: string,
  changeSummary?: string,
): Promise<DocumentVersion | null> {
  // Get the current version count.
  const { count } = await supabase
    .from("document_versions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("document_id", documentId);

  const versionNumber = (count ?? 0) + 1;
  const versionPath = `${tenantId}/${documentId}/v${versionNumber}`;

  // Upload to Storage.
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase
    .storage
    .from("document-versions")
    .upload(versionPath, arrayBuffer, {
      contentType: mimeType,
    });

  if (uploadError) {
    log.error("Failed to upload document version", {
      tenantId,
      documentId,
      versionNumber,
      error: uploadError.message,
    });
    return null;
  }

  // Get the uploader's name.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", uploadedBy)
    .maybeSingle();

  // Record the version metadata.
  const { data, error } = await supabase
    .from("document_versions")
    .insert({
      tenant_id: tenantId,
      document_id: documentId,
      version_number: versionNumber,
      storage_path: versionPath,
      file_size_bytes: arrayBuffer.byteLength,
      mime_type: mimeType,
      uploaded_by: uploadedBy,
      uploaded_by_name: profile?.full_name ?? undefined,
      change_summary: changeSummary ?? null,
    })
    .select("id, document_id, tenant_id, version_number, storage_path, file_size_bytes, mime_type, uploaded_by, uploaded_by_name, change_summary, created_at")
    .single();

  if (error) {
    log.error("Failed to record document version", {
      tenantId,
      documentId,
      error: error.message,
    });
    return null;
  }

  // Update the main document's storage_path to point to the latest version.
  await supabase
    .from("documents")
    .update({
      storage_path: versionPath,
      file_size_bytes: arrayBuffer.byteLength,
      mime_type: mimeType,
    })
    .eq("id", documentId)
    .eq("tenant_id", tenantId);

  log.info("Document version created", {
    tenantId,
    documentId,
    versionNumber,
    fileSize: arrayBuffer.byteLength,
  });

  return {
    id: data.id,
    documentId: data.document_id,
    tenantId: data.tenant_id,
    versionNumber: data.version_number,
    storagePath: data.storage_path,
    fileSizeBytes: data.file_size_bytes,
    mimeType: data.mime_type,
    uploadedBy: data.uploaded_by,
    uploadedByName: data.uploaded_by_name ?? undefined,
    changeSummary: data.change_summary ?? undefined,
    createdAt: data.created_at,
  };
}

// List all versions of a document.
export async function listDocumentVersions(
  tenantId: string,
  documentId: string,
): Promise<DocumentVersion[]> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("id, document_id, tenant_id, version_number, storage_path, file_size_bytes, mime_type, uploaded_by, uploaded_by_name, change_summary, created_at")
    .eq("tenant_id", tenantId)
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });

  if (error) {
    log.error("Failed to list document versions", { tenantId, documentId, error: error.message });
    return [];
  }

  return (data ?? []).map((d) => ({
    id: d.id,
    documentId: d.document_id,
    tenantId: d.tenant_id,
    versionNumber: d.version_number,
    storagePath: d.storage_path,
    fileSizeBytes: d.file_size_bytes,
    mimeType: d.mime_type,
    uploadedBy: d.uploaded_by,
    uploadedByName: d.uploaded_by_name ?? undefined,
    changeSummary: d.change_summary ?? undefined,
    createdAt: d.created_at,
  }));
}

// Get a signed URL to download a specific version.
export async function getVersionDownloadUrl(
  tenantId: string,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .storage
    .from("document-versions")
    .createSignedUrl(storagePath, 3600); // 1 hour expiry

  if (error || !data?.signedUrl) {
    log.error("Failed to create signed URL for version", { tenantId, storagePath, error: error?.message });
    return null;
  }

  return data.signedUrl;
}

// Restore a document to a previous version.
// Creates a new version with the content of the old version.
export async function restoreDocumentVersion(
  tenantId: string,
  documentId: string,
  versionNumber: number,
  restoredBy: string,
): Promise<DocumentVersion | null> {
  // Get the version to restore.
  const { data: version } = await supabase
    .from("document_versions")
    .select("storage_path, mime_type")
    .eq("tenant_id", tenantId)
    .eq("document_id", documentId)
    .eq("version_number", versionNumber)
    .maybeSingle();

  if (!version) {
    log.error("Version not found for restore", { tenantId, documentId, versionNumber });
    return null;
  }

  // Download the old version.
  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from("document-versions")
    .download(version.storage_path);

  if (downloadError || !fileData) {
    log.error("Failed to download version for restore", { tenantId, documentId, versionNumber, error: downloadError?.message });
    return null;
  }

  // Create a new version with the old content.
  return createDocumentVersion(
    tenantId,
    documentId,
    fileData,
    version.mime_type,
    restoredBy,
    `Restaurado da versao ${versionNumber}`,
  );
}

// Format file size for display.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
