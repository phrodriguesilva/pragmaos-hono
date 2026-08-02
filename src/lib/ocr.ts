// OCR service for extracting text from scanned PDFs and images.
// Uses Tesseract.js for client-side OCR (no external API needed).
// For server-side, uses a configurable OCR API (Google Vision, AWS Textract, etc.)
//
// PragmaOS 2.

import { supabase } from "./supabase";
import { log } from "./logger";

export interface OCRResult {
  success: boolean;
  text?: string;
  error?: string;
  pages?: number;
  confidence?: number;
}

export interface OCRConfig {
  provider: "tesseract" | "google_vision" | "aws_textract" | "none";
  apiKey?: string;
  // For Google Vision
  googleProjectId?: string;
}

// Get OCR config from environment or integrations table.
export async function getOCRConfig(tenantId: string): Promise<OCRConfig> {
  // Check if tenant has OCR integration configured.
  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("type", "ocr")
    .eq("active", true)
    .maybeSingle();

  if (integration?.config) {
    const config = integration.config as Record<string, unknown>;
    return {
      provider: (config.provider as "tesseract" | "google_vision" | "aws_textract" | "none") ?? "tesseract",
      apiKey: config.api_key as string | undefined,
      googleProjectId: config.google_project_id as string | undefined,
    };
  }

  // Default: no server-side OCR configured.
  // Client-side Tesseract.js can still be used.
  return { provider: "none" };
}

// Extract text from a PDF or image using Google Vision API.
async function extractWithGoogleVision(
  imageBase64: string,
  apiKey: string,
): Promise<OCRResult> {
  try {
    const resp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [
              { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 },
            ],
          }],
        }),
      },
    );

    if (!resp.ok) {
      const errBody = await resp.text();
      return { success: false, error: `Google Vision erro ${resp.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await resp.json() as {
      responses?: {
        fullTextAnnotation?: { text?: string; pages?: unknown[] };
        error?: { message?: string };
      }[];
    };

    const annotation = data.responses?.[0]?.fullTextAnnotation;
    if (data.responses?.[0]?.error) {
      return { success: false, error: data.responses[0].error.message };
    }

    if (!annotation?.text) {
      return { success: true, text: "", pages: 0 };
    }

    return {
      success: true,
      text: annotation.text,
      pages: annotation.pages?.length ?? 1,
      confidence: 0.9, // Google Vision doesn't return overall confidence
    };
  } catch (err) {
    return { success: false, error: `Erro: ${(err as Error).message}` };
  }
}

// Extract text from a file stored in Supabase Storage.
// Downloads the file, converts to base64, and sends to OCR provider.
export async function extractTextFromFile(
  tenantId: string,
  bucket: string,
  filePath: string,
): Promise<OCRResult> {
  const config = await getOCRConfig(tenantId);

  if (config.provider === "none") {
    return {
      success: false,
      error: "OCR nao configurado. Configure a integracao OCR ou use Tesseract.js no cliente.",
    };
  }

  // Download file from Supabase Storage.
  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from(bucket)
    .download(filePath);

  if (downloadError || !fileData) {
    return { success: false, error: `Erro ao baixar arquivo: ${downloadError?.message ?? "arquivo nao encontrado"}` };
  }

  // Convert to base64.
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");

  // For PDFs, we'd need to convert pages to images first.
  // This is a simplified version that works with images directly.
  // For PDFs, a pdf-to-image converter would be needed.
  const mimeType = fileData.type;
  if (mimeType === "application/pdf") {
    // PDFs need special handling — convert pages to images first.
    // For now, return a message indicating PDF OCR needs additional setup.
    log.warn("PDF OCR requires pdf-to-image conversion", { tenantId, filePath, mimeType });
    return {
      success: false,
      error: "OCR de PDFs requer conversao para imagem. Configure um servico de OCR que suporte PDFs (Google Vision, AWS Textract).",
    };
  }

  // Use Google Vision for images.
  if (config.provider === "google_vision" && config.apiKey) {
    return extractWithGoogleVision(base64, config.apiKey);
  }

  return { success: false, error: `Provider OCR "${config.provider}" nao suportado` };
}

// Update the extracted_text field of a document after OCR.
export async function updateDocumentText(
  tenantId: string,
  documentId: string,
  text: string,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ extracted_text: text })
    .eq("tenant_id", tenantId)
    .eq("id", documentId);

  if (error) {
    log.error("Failed to update document extracted_text", {
      tenantId,
      documentId,
      error: error.message,
    });
  }
}

// Process a document: extract text and update the database.
export async function processDocumentOCR(
  tenantId: string,
  documentId: string,
  bucket: string,
  filePath: string,
): Promise<OCRResult> {
  log.info("Processing document OCR", { tenantId, documentId, filePath });

  const result = await extractTextFromFile(tenantId, bucket, filePath);

  if (result.success && result.text) {
    await updateDocumentText(tenantId, documentId, result.text);
    log.info("Document OCR completed", {
      tenantId,
      documentId,
      textLength: result.text.length,
      pages: result.pages,
    });
  }

  return result;
}

// Batch process: run OCR on all documents without extracted_text.
export async function batchProcessDocuments(
  tenantId: string,
  limit: number = 10,
): Promise<{ processed: number; success: number; failed: number }> {
  const { data: documents } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("tenant_id", tenantId)
    .is("extracted_text", null)
    .limit(limit);

  if (!documents || documents.length === 0) {
    return { processed: 0, success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const doc of documents) {
    const result = await processDocumentOCR(tenantId, doc.id, "documents", doc.storage_path);
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  log.info("Batch OCR completed", { tenantId, total: documents.length, success, failed });

  return { processed: documents.length, success, failed };
}
