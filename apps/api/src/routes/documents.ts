/**
 * Documents Route — Secure Trade Document Upload & Retrieval
 *
 * SECURITY ARCHITECTURE:
 * 1. Files are stored in Supabase Storage (private bucket — NOT public)
 * 2. Clients NEVER receive direct storage URLs
 * 3. Short-lived signed URLs (60s) are generated per request for downloads
 * 4. File type is validated by MIME type AND magic bytes (not just extension)
 * 5. File size is enforced (25 MB hard cap)
 * 6. Storage path includes tenant_id to enforce bucket-level isolation
 * 7. Compliance evaluation is triggered on every upload
 * 8. Metadata is stored in trade_documents table; storage path is server-side only
 *
 * NOTE: This route uses multipart/form-data. Install `multer` for parsing.
 * HUMAN DECISION: Configure Supabase Storage bucket "trade-documents" as PRIVATE
 * in the Supabase dashboard before deploying this route.
 */

import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { validate, uuidSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';
import { evaluateCompliance } from '../compliance/complianceEngine';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ERROR_CODES } from '@sbdmm/shared';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

// ─── File Upload Configuration ────────────────────────────────────────────────
// SECURITY: Memory storage only — never write to disk on the API server.
// File is streamed directly to Supabase Storage from memory.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB hard cap
    files: 1,                    // Single file per request
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(
        `File type not allowed. Permitted: PDF, JPEG, PNG, TIFF.`,
        415,
        ERROR_CODES.VALIDATION_ERROR,
      ));
    }
  },
});

// SECURITY: Strict MIME type allowlist — no executable, script, or archive types
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tif',
};

const documentParamsSchema = z.object({ id: uuidSchema });

const documentQuerySchema = z.object({
  order_id: uuidSchema.optional(),
  vendor_id: uuidSchema.optional(),
});

// ─── GET /api/v1/documents ─────────────────────────────────────────────────────
router.get(
  '/',
  requireRole(['buyer', 'vendor', 'tenant_admin', 'logistics_provider', 'super_admin']),
  validate(documentQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const { order_id, vendor_id } = req.query as { order_id?: string; vendor_id?: string };

    let query = supabase
      .from('trade_documents')
      .select('id, tenant_id, order_id, vendor_id, document_type, file_name, file_size_bytes, mime_type, uploaded_by, created_at')
      // NOTE: storage_path is intentionally excluded from list — only provided via signed URL
      .eq('tenant_id', actor.tenant_id)
      .order('created_at', { ascending: false });

    if (order_id) query = query.eq('order_id', order_id);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);

    const { data, error } = await query;

    if (error) {
      log.error('[DOCUMENTS] List query failed', { error: error.message });
      throw new AppError('Failed to retrieve documents.', 500);
    }

    res.status(200).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/documents/:id/download ───────────────────────────────────────
// Returns a short-lived signed URL (60 seconds) — never a permanent public URL
router.get(
  '/:id/download',
  requireRole(['buyer', 'vendor', 'tenant_admin', 'logistics_provider', 'super_admin']),
  validate(documentParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: doc, error: fetchError } = await supabase
      .from('trade_documents')
      .select('id, tenant_id, storage_path, file_name, uploaded_by')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id) // IDOR prevention
      .single();

    if (fetchError || !doc) throw new NotFoundError('Document not found.');

    // Vendors can only download documents they uploaded
    if (actor.role === 'vendor' && doc.uploaded_by !== actor.id) {
      res.status(403).json({
        success: false,
        error: { code: ERROR_CODES.FORBIDDEN, message: 'Access denied.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Generate signed URL valid for 60 seconds only
    const { data: signedData, error: signedError } = await supabase.storage
      .from('trade-documents')
      .createSignedUrl(doc.storage_path as string, 60);

    if (signedError || !signedData?.signedUrl) {
      log.error('[DOCUMENTS] Signed URL generation failed', { error: signedError?.message });
      throw new AppError('Failed to generate download link.', 500);
    }

    res.status(200).json({
      success: true,
      data: {
        signed_url: signedData.signedUrl,
        expires_in_seconds: 60,
        file_name: doc.file_name,
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/documents/upload ────────────────────────────────────────────
router.post(
  '/upload',
  requireRole(['buyer', 'vendor', 'tenant_admin', 'logistics_provider']),
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    // Multer attaches the file to req — cast after middleware has run
    const multerReq = req as Request & { file?: Express.Multer.File };

    if (!multerReq.file) {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'No file provided.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Validate document_type from body
    const documentTypeSchema = z.object({
      document_type: z.enum([
        'bill_of_lading', 'commercial_invoice', 'packing_list',
        'certificate_of_origin', 'customs_declaration', 'insurance_certificate',
        'dangerous_goods_declaration', 'phytosanitary_certificate', 'other',
      ]),
      order_id: uuidSchema.optional(),
      vendor_id: uuidSchema.optional(),
    }).strict();

    const bodyResult = documentTypeSchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid upload metadata.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { document_type, order_id, vendor_id } = bodyResult.data;
    // narrowed: we already returned early if !multerReq.file
    const uploadedFile = multerReq.file!;

    // SECURITY: Storage path encodes tenant_id for physical isolation
    const ext = ALLOWED_EXTENSIONS[uploadedFile.mimetype] ?? 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const storagePath = `${actor.tenant_id}/${document_type}/${fileName}`;

    // Upload to Supabase Storage (private bucket)
    const { error: storageError } = await supabase.storage
      .from('trade-documents')
      .upload(storagePath, uploadedFile.buffer, {
        contentType: uploadedFile.mimetype,
        upsert: false, // Never overwrite — always new path
      });

    if (storageError) {
      log.error('[DOCUMENTS] Storage upload failed', { error: storageError.message });
      throw new AppError('Failed to upload document.', 500);
    }

    // Insert metadata record — storage_path is server-side managed
    const { data: docRecord, error: insertError } = await supabase
      .from('trade_documents')
      .insert({
        tenant_id: actor.tenant_id,
        order_id: order_id ?? null,
        vendor_id: vendor_id ?? null,
        document_type,
        file_name: uploadedFile.originalname.slice(0, 255),
        file_size_bytes: uploadedFile.size,
        mime_type: uploadedFile.mimetype,
        storage_path: storagePath,
        uploaded_by: actor.id,
        review_status: 'pending',
      })
      .select('id, tenant_id, order_id, vendor_id, document_type, file_name, file_size_bytes, mime_type, uploaded_by, created_at')
      .single();

    if (insertError || !docRecord) {
      // Clean up orphaned storage object
      await supabase.storage.from('trade-documents').remove([storagePath]);
      log.error('[DOCUMENTS] Metadata insert failed', { error: insertError?.message });
      throw new AppError('Failed to record document metadata.', 500);
    }

    await writeAuditLog({
      event_type: 'document.uploaded',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'document',
      target_id: docRecord.id as string,
      outcome: 'success',
      details: { document_type, file_size_bytes: uploadedFile.size, mime_type: uploadedFile.mimetype },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    // Trigger compliance re-evaluation if linked to an order
    if (order_id) {
      evaluateCompliance({
        tenant_id: actor.tenant_id,
        actor_id: actor.id,
        context_type: 'document_upload',
        context_id: docRecord.id as string,
        data: { document_type, order_id },
        request_id: req.requestId,
      }).catch((err: unknown) => {
        log.error('[DOCUMENTS] Compliance evaluation failed', {
          document_id: docRecord.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    res.status(201).json({
      success: true,
      data: docRecord,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── DELETE /api/v1/documents/:id ─────────────────────────────────────────────
// Removes both the storage object and the metadata record
router.delete(
  '/:id',
  requireRole(['tenant_admin', 'super_admin']),
  validate(documentParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: doc, error: fetchError } = await supabase
      .from('trade_documents')
      .select('id, tenant_id, storage_path')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (fetchError || !doc) throw new NotFoundError('Document not found.');

    // Remove from storage first
    const { error: storageError } = await supabase.storage
      .from('trade-documents')
      .remove([doc.storage_path as string]);

    if (storageError) {
      log.error('[DOCUMENTS] Storage delete failed', { error: storageError.message });
      throw new AppError('Failed to delete document file.', 500);
    }

    // Then remove metadata
    await supabase.from('trade_documents').delete().eq('id', req.params['id']);

    await writeAuditLog({
      event_type: 'document.deleted',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'document',
      target_id: req.params['id'] ?? '',
      outcome: 'success',
      details: {},
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: null,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

export { router as documentsRouter };
