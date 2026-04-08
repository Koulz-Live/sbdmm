/**
 * Design Sessions Route — AI-Assisted Carpentry Furniture Design
 *
 * Flow:
 *   1. POST /sessions               → create session (room type)
 *   2. POST /sessions/:id/photo     → upload room photo → Supabase Storage
 *   3. POST /sessions/:id/generate  → GPT-4o Vision/Text → 3 design concepts
 *   4. POST /sessions/:id/refine    → iterative concept refinement
 *   5. POST /sessions/:id/convert   → convert chosen concept to carpentry order
 *   6. GET  /sessions               → list user's sessions
 *   7. GET  /sessions/:id           → fetch a single session with fresh signed URL
 *
 * SECURITY:
 * - Auth required on all routes
 * - Tenant isolation enforced on every DB query (server-side — never from client)
 * - Storage paths include tenant_id for bucket-level isolation
 * - Signed URLs are short-lived (1 hour) — never store permanently
 * - Photo upload validated: image MIME types only, 10 MB cap, memory-only (no disk write)
 * - AI prompts are server-controlled; client supplies structured preferences only
 * - OpenAI calls go through the server — browser never touches OpenAI directly
 */

import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { requireAuth } from '../middleware/auth';
import { writeAuditLog } from '../services/auditLog';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { config } from '../lib/config';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ERROR_CODES } from '@sbdmm/shared';
import type {
  RoomType,
  TableType,
  FurnitureStyle,
  SeatingSize,
  MaterialPreference,
  DesignConcept,
} from '@sbdmm/shared';
import OpenAI from 'openai';

const router = Router();
router.use(requireAuth);

// ─── OpenAI client (lazy singleton) ──────────────────────────────────────────
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: config.openai.apiKey,
      organization: config.openai.orgId || undefined,
    });
  }
  return _openai;
}

// ─── File upload configuration ────────────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, WebP, or HEIC images are allowed.', 415, ERROR_CODES.VALIDATION_ERROR));
    }
  },
});

// ─── Label helpers ────────────────────────────────────────────────────────────

const ROOM_LABELS: Record<RoomType, string> = {
  living_room:   'Living Room',
  dining_room:   'Dining Room',
  kitchen_nook:  'Kitchen Nook',
  office_study:  'Office / Study',
};

const TABLE_LABELS: Record<TableType, string> = {
  coffee_table:  'Coffee Table',
  dining_table:  'Dining Table',
  side_table:    'Side Table',
  console_table: 'Console Table',
};

const MATERIAL_LABELS: Record<MaterialPreference, string> = {
  oak:               'Oak',
  pine:              'Pine',
  dark_wood:         'Dark Wood',
  walnut:            'Walnut',
  mixed_wood_steel:  'Mixed Wood & Steel',
};

// ─── AI prompt builder ────────────────────────────────────────────────────────

function buildDesignPrompt(
  roomType: RoomType,
  tableType: TableType,
  style: FurnitureStyle,
  seatingSize: SeatingSize,
  material: MaterialPreference,
  budgetMin: number,
  budgetMax: number,
  currency: string,
  hasPhoto: boolean,
): string {
  const seatingLabel = seatingSize === 'not_applicable' ? 'N/A' : seatingSize.replace('_', '-');
  const tableLabel   = TABLE_LABELS[tableType];
  const roomLabel    = ROOM_LABELS[roomType];

  return `You are an expert furniture designer and interior stylist specialising in bespoke custom carpentry.

${
  hasPhoto
    ? 'A photo of the room has been uploaded. Analyse the space: note the room dimensions visible, existing furniture styles, floor material and colour, wall colour, natural and artificial lighting, and any design constraints.'
    : 'No room photo was provided — use the stated preferences to guide your design recommendations.'
}

CUSTOMER REQUIREMENTS:
• Room type: ${roomLabel}
• Table needed: ${tableLabel}
• Style preference: ${style}
• Seating requirement: ${seatingLabel}
• Material preference: ${MATERIAL_LABELS[material]}
• Budget range: ${currency} ${budgetMin}–${budgetMax}

Generate EXACTLY 3 custom table concepts for a skilled carpenter to build. Return ONLY valid JSON — no markdown, no explanatory text outside the JSON object:

{
  "rationale": "2–3 sentences explaining your recommendations based on the room and requirements.",
  "concepts": [
    {
      "tier": "budget",
      "label": "Option A – Budget-Friendly",
      "shape": "rectangular",
      "dimensions": "e.g. 120cm × 70cm × 45cm",
      "finish": "e.g. natural pine clear lacquer",
      "leg_style": "e.g. straight tapered legs",
      "color_tone": "e.g. warm natural pine",
      "image_prompt": "Photorealistic ${style} ${tableLabel} with [specific finish and legs], placed in a ${roomLabel}, professional interior photography, warm lighting, high detail",
      "price_estimate_min": 0,
      "price_estimate_max": 0,
      "currency": "${currency}",
      "lead_time_days": 21
    },
    {
      "tier": "standard",
      "label": "Option B – Standard",
      "shape": "...",
      "dimensions": "...",
      "finish": "...",
      "leg_style": "...",
      "color_tone": "...",
      "image_prompt": "...",
      "price_estimate_min": 0,
      "price_estimate_max": 0,
      "currency": "${currency}",
      "lead_time_days": 35
    },
    {
      "tier": "premium",
      "label": "Option C – Premium Custom",
      "shape": "...",
      "dimensions": "...",
      "finish": "...",
      "leg_style": "...",
      "color_tone": "...",
      "image_prompt": "...",
      "price_estimate_min": 0,
      "price_estimate_max": 0,
      "currency": "${currency}",
      "lead_time_days": 60
    }
  ]
}

RULES:
- Budget concept price must be within or below the customer's budget range
- Standard concept may exceed budget by up to 30%
- Premium concept may exceed budget by up to 100%
- Lead times must be realistic (14–90 days for custom carpentry)
- Dimensions must be realistic for the table type and seating size
- All price fields must be numbers, not strings`;
}

// ─── POST /api/v1/design/sessions — create session ───────────────────────────

router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const actor = req.user!;
  const { room_type } = req.body as { room_type?: RoomType };

  const VALID_ROOM_TYPES: RoomType[] = ['living_room', 'dining_room', 'kitchen_nook', 'office_study'];
  if (!room_type || !VALID_ROOM_TYPES.includes(room_type)) {
    throw new AppError('room_type must be one of: living_room, dining_room, kitchen_nook, office_study', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('design_sessions')
    .insert({
      tenant_id:  actor.tenant_id,
      created_by: actor.id,
      room_type,
      status:     'draft',
    })
    .select()
    .single();

  if (error) {
    log.error('[DESIGN] Failed to create session', { error: error.message });
    throw new AppError('Failed to create design session.', 500, ERROR_CODES.INTERNAL_ERROR);
  }

  await writeAuditLog({
    tenant_id:   actor.tenant_id,
    actor_id:    actor.id,
    event_type:  'order.created',   // closest audit event — no design event type yet
    target_type: 'design_session',
    target_id:   data.id,
    outcome:     'success',
    details:     { room_type },
    request_id:  req.requestId,
  });

  res.status(201).json({
    success: true,
    data,
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── POST /api/v1/design/sessions/:id/photo — upload room photo ───────────────

router.post(
  '/sessions/:id/photo',
  upload.single('photo'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const actor = req.user!;
    const { id } = req.params as { id: string };

    if (!req.file) {
      throw new AppError('No photo file received.', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const supabase = getAdminClient();

    // Verify ownership + tenant isolation
    const { data: session, error: fetchErr } = await supabase
      .from('design_sessions')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', actor.tenant_id)
      .eq('created_by', actor.id)
      .single();

    if (fetchErr || !session) {
      throw new NotFoundError('Design session not found.');
    }

    // Build a stable storage path: {tenant_id}/design-sessions/{session_id}/room-photo.{ext}
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png':  'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
    };
    const ext = mimeToExt[req.file.mimetype] ?? 'jpg';
    const storagePath = `${actor.tenant_id}/design-sessions/${id}/room-photo.${ext}`;

    // Upload to Supabase Storage (private bucket)
    const { error: uploadErr } = await supabase.storage
      .from('room-photos')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,   // replace if re-uploaded
      });

    if (uploadErr) {
      log.error('[DESIGN] Storage upload failed', { error: uploadErr.message });
      throw new AppError('Photo upload failed. Please try again.', 500, ERROR_CODES.INTERNAL_ERROR);
    }

    // Create a 1-hour signed URL for the AI vision call
    const { data: signedData, error: signErr } = await supabase.storage
      .from('room-photos')
      .createSignedUrl(storagePath, 3600);

    if (signErr || !signedData?.signedUrl) {
      log.error('[DESIGN] Failed to create signed URL', { error: signErr?.message });
      throw new AppError('Could not generate photo URL.', 500, ERROR_CODES.INTERNAL_ERROR);
    }

    // Persist the path + signed URL in the session record
    const { error: updateErr } = await supabase
      .from('design_sessions')
      .update({
        room_photo_path: storagePath,
        room_photo_url:  signedData.signedUrl,
      })
      .eq('id', id);

    if (updateErr) {
      throw new AppError('Failed to save photo reference.', 500, ERROR_CODES.INTERNAL_ERROR);
    }

    res.json({
      success: true,
      data: { path: storagePath, url: signedData.signedUrl },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/design/sessions/:id/generate — AI concept generation ─────────

router.post('/sessions/:id/generate', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const actor = req.user!;
  const { id } = req.params as { id: string };

  const {
    table_type,
    style,
    seating_size,
    material_preference,
    budget_min,
    budget_max,
    budget_currency = 'USD',
  } = req.body as {
    table_type: TableType;
    style: FurnitureStyle;
    seating_size: SeatingSize;
    material_preference: MaterialPreference;
    budget_min: number;
    budget_max: number;
    budget_currency?: string;
  };

  // Validate required preference fields
  if (!table_type || !style || !seating_size || !material_preference || budget_min == null || budget_max == null) {
    throw new AppError('All preference fields are required: table_type, style, seating_size, material_preference, budget_min, budget_max.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  if (Number(budget_min) >= Number(budget_max)) {
    throw new AppError('budget_min must be less than budget_max.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const supabase = getAdminClient();

  // Fetch session — verify ownership
  const { data: session, error: fetchErr } = await supabase
    .from('design_sessions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', actor.tenant_id)
    .eq('created_by', actor.id)
    .single();

  if (fetchErr || !session) {
    throw new NotFoundError('Design session not found.');
  }

  // Save preferences before calling AI (so partial state is persisted)
  await supabase
    .from('design_sessions')
    .update({ table_type, style, seating_size, material_preference, budget_min, budget_max, budget_currency })
    .eq('id', id);

  const prompt = buildDesignPrompt(
    session.room_type as RoomType,
    table_type,
    style,
    seating_size,
    material_preference,
    Number(budget_min),
    Number(budget_max),
    budget_currency,
    !!session.room_photo_url,
  );

  const openai = getOpenAI();
  let aiText = '';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    if (session.room_photo_url) {
      // Vision mode — GPT-4o analyses the room photo
      log.info('[DESIGN] Calling GPT-4o Vision for concept generation', { session_id: id });
      const response = await openai.chat.completions.create({
        model:      'gpt-4o',
        max_tokens: 1800,
        messages: [
          {
            role: 'user',
            content: [
              {
                type:      'image_url',
                image_url: { url: session.room_photo_url as string, detail: 'high' },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
      aiText           = response.choices[0]?.message?.content ?? '';
      promptTokens     = response.usage?.prompt_tokens ?? 0;
      completionTokens = response.usage?.completion_tokens ?? 0;
    } else {
      // Text mode — no photo available
      log.info('[DESIGN] Calling GPT-4o Text for concept generation', { session_id: id });
      const response = await openai.chat.completions.create({
        model:      'gpt-4o',
        max_tokens: 1800,
        messages:   [{ role: 'user', content: prompt }],
      });
      aiText           = response.choices[0]?.message?.content ?? '';
      promptTokens     = response.usage?.prompt_tokens ?? 0;
      completionTokens = response.usage?.completion_tokens ?? 0;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OpenAI API error';
    log.error('[DESIGN] OpenAI generation failed', { error: msg, session_id: id });
    throw new AppError('AI design generation failed. Please try again.', 502, ERROR_CODES.INTERNAL_ERROR);
  }

  // Extract JSON from the AI response
  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    log.error('[DESIGN] AI returned no valid JSON', { raw: aiText.slice(0, 500), session_id: id });
    throw new AppError('AI returned an unexpected response. Please try again.', 502, ERROR_CODES.INTERNAL_ERROR);
  }

  let parsed: { rationale: string; concepts: DesignConcept[] };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { rationale: string; concepts: DesignConcept[] };
  } catch {
    log.error('[DESIGN] Failed to parse AI JSON', { session_id: id });
    throw new AppError('AI response could not be parsed. Please try again.', 502, ERROR_CODES.INTERNAL_ERROR);
  }

  if (!Array.isArray(parsed.concepts) || parsed.concepts.length === 0) {
    throw new AppError('AI did not return any design concepts. Please try again.', 502, ERROR_CODES.INTERNAL_ERROR);
  }

  // Persist AI output and mark session as ready
  const { data: updated, error: updateErr } = await supabase
    .from('design_sessions')
    .update({
      ai_design_rationale:   parsed.rationale,
      ai_concepts:           parsed.concepts,
      ai_model_used:         'gpt-4o',
      ai_prompt_tokens:      promptTokens,
      ai_completion_tokens:  completionTokens,
      status:                'concepts_ready',
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    throw new AppError('Failed to save design concepts.', 500, ERROR_CODES.INTERNAL_ERROR);
  }

  await writeAuditLog({
    tenant_id:   actor.tenant_id,
    actor_id:    actor.id,
    event_type:  'ai.request_made',
    target_type: 'design_session',
    target_id:   id,
    outcome:     'success',
    details:     { prompt_tokens: promptTokens, completion_tokens: completionTokens, model: 'gpt-4o', has_photo: !!session.room_photo_url },
    request_id:  req.requestId,
  });

  res.json({
    success: true,
    data: updated,
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── POST /api/v1/design/sessions/:id/refine — iterative refinement ───────────

router.post('/sessions/:id/refine', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const actor = req.user!;
  const { id } = req.params as { id: string };
  const { instruction, concept_index = 0 } = req.body as { instruction?: string; concept_index?: number };

  if (!instruction?.trim()) {
    throw new AppError('instruction is required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }
  if (instruction.length > 500) {
    throw new AppError('instruction must be 500 characters or fewer.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const supabase = getAdminClient();

  const { data: session, error: fetchErr } = await supabase
    .from('design_sessions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', actor.tenant_id)
    .eq('created_by', actor.id)
    .single();

  if (fetchErr || !session) {
    throw new NotFoundError('Design session not found.');
  }

  const concepts = (session.ai_concepts ?? []) as DesignConcept[];
  const idx = Number(concept_index);
  const currentConcept = concepts[idx];

  if (!currentConcept) {
    throw new AppError(`No concept found at index ${String(idx)}.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const refinePrompt = `You are a custom furniture designer. The customer has chosen this table concept:

${JSON.stringify(currentConcept, null, 2)}

Customer refinement request: "${instruction}"

Apply the customer's change to the concept and return ONLY a JSON object in this exact format — no extra text:
{
  "updated_concept": { ...same fields as the input concept, with only the requested changes applied... },
  "explanation": "One sentence explaining what was changed and why it improves the design."
}`;

  const openai = getOpenAI();
  let aiText = '';

  try {
    const response = await openai.chat.completions.create({
      model:      'gpt-4o',
      max_tokens: 900,
      messages:   [{ role: 'user', content: refinePrompt }],
    });
    aiText = response.choices[0]?.message?.content ?? '';
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OpenAI API error';
    log.error('[DESIGN] OpenAI refinement failed', { error: msg, session_id: id });
    throw new AppError('AI refinement failed. Please try again.', 502, ERROR_CODES.INTERNAL_ERROR);
  }

  const jsonMatch = aiText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new AppError('AI returned an unexpected response. Please try again.', 502, ERROR_CODES.INTERNAL_ERROR);
  }

  let parsed: { updated_concept: DesignConcept; explanation: string };
  try {
    parsed = JSON.parse(jsonMatch[0]) as { updated_concept: DesignConcept; explanation: string };
  } catch {
    throw new AppError('Could not parse AI refinement response.', 502, ERROR_CODES.INTERNAL_ERROR);
  }

  // Merge the update into the concepts array
  const updatedConcepts = [...concepts];
  updatedConcepts[idx] = { ...currentConcept, ...parsed.updated_concept, tier: currentConcept.tier };

  // Append to refinement history
  const history = [
    ...(session.refinement_history as Array<{ instruction: string; response: string; timestamp: string }>),
    {
      instruction: instruction.trim(),
      response:    parsed.explanation,
      timestamp:   new Date().toISOString(),
    },
  ];

  const { data: updated, error: updateErr } = await supabase
    .from('design_sessions')
    .update({
      ai_concepts:          updatedConcepts,
      refinement_history:   history,
      active_concept_index: idx,
      status:               'refining',
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    throw new AppError('Failed to save refined concept.', 500, ERROR_CODES.INTERNAL_ERROR);
  }

  res.json({
    success: true,
    data: updated,
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── POST /api/v1/design/sessions/:id/convert — convert to carpentry order ────

router.post('/sessions/:id/convert', async (req: Request, res: Response): Promise<void> => {
  const log = createChildLogger({ request_id: req.requestId });
  const actor = req.user!;
  const { id } = req.params as { id: string };
  const {
    concept_index = 0,
    delivery_address,
    required_by_date,
  } = req.body as {
    concept_index?: number;
    delivery_address: string;
    required_by_date?: string;
  };

  if (!delivery_address?.trim()) {
    throw new AppError('delivery_address is required.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  const supabase = getAdminClient();

  const { data: session, error: fetchErr } = await supabase
    .from('design_sessions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', actor.tenant_id)
    .eq('created_by', actor.id)
    .single();

  if (fetchErr || !session) {
    throw new NotFoundError('Design session not found.');
  }

  if (session.status === 'converted') {
    throw new AppError('This design session has already been converted to an order.', 409, ERROR_CODES.VALIDATION_ERROR);
  }

  const concepts = (session.ai_concepts ?? []) as DesignConcept[];
  const concept  = concepts[Number(concept_index)];

  if (!concept) {
    throw new AppError('No design concept found at the specified index.', 400, ERROR_CODES.VALIDATION_ERROR);
  }

  // Build a structured artisan brief for the order cargo_description
  const brief = [
    '═══════════════════════════════════════════',
    ' CUSTOM CARPENTRY ORDER — AI DESIGN BRIEF',
    '═══════════════════════════════════════════',
    '',
    `Room Type:    ${ROOM_LABELS[session.room_type as RoomType] ?? session.room_type}`,
    `Table Type:   ${session.table_type ? (TABLE_LABELS[session.table_type as TableType] ?? session.table_type) : 'N/A'}`,
    `Style:        ${session.style ?? 'N/A'}`,
    `Material:     ${session.material_preference ? (MATERIAL_LABELS[session.material_preference as MaterialPreference] ?? session.material_preference) : 'N/A'}`,
    `Seating:      ${session.seating_size?.replace('_', '-') ?? 'N/A'}`,
    `Budget:       ${session.budget_currency} ${String(session.budget_min)}–${String(session.budget_max)}`,
    '',
    `SELECTED DESIGN: ${concept.label}`,
    `  Shape:      ${concept.shape}`,
    `  Dimensions: ${concept.dimensions}`,
    `  Finish:     ${concept.finish}`,
    `  Leg Style:  ${concept.leg_style}`,
    `  Colour:     ${concept.color_tone}`,
    `  Est. Price: ${concept.currency} ${String(concept.price_estimate_min)}–${String(concept.price_estimate_max)}`,
    `  Lead Time:  ${String(concept.lead_time_days)} days`,
    '',
    'AI DESIGN RATIONALE:',
    session.ai_design_rationale ?? 'N/A',
    '',
    `Design Session ID: ${session.id}`,
    `Room photo available: ${session.room_photo_path ? 'Yes' : 'No'}`,
  ].join('\n');

  // Create the order — carpenters will bid on this
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      tenant_id:            actor.tenant_id,
      created_by:           actor.id,
      status:               'draft',
      origin_location:      'Carpenter Workshop (confirmed on quote acceptance)',
      destination_location: delivery_address.trim(),
      cargo_type:           `Custom ${concept.label} — ${session.table_type?.replace('_', ' ') ?? 'Furniture'}`,
      estimated_weight_kg:  50,
      estimated_volume_cbm: 1.2,
      requested_delivery_date: required_by_date ?? null,
      special_requirements: brief,
    })
    .select()
    .single();

  if (orderErr) {
    log.error('[DESIGN] Failed to create order', { error: orderErr.message, session_id: id });
    throw new AppError('Failed to create carpentry order.', 500, ERROR_CODES.INTERNAL_ERROR);
  }

  // Mark session as converted
  await supabase
    .from('design_sessions')
    .update({ status: 'converted', converted_to_order_id: order.id })
    .eq('id', id);

  await writeAuditLog({
    tenant_id:   actor.tenant_id,
    actor_id:    actor.id,
    event_type:  'order.created',
    target_type: 'order',
    target_id:   order.id,
    outcome:     'success',
    details:     { source: 'design_session', design_session_id: id, concept_tier: concept.tier },
    request_id:  req.requestId,
  });

  res.status(201).json({
    success: true,
    data: { order, session_id: id },
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── GET /api/v1/design/sessions — list user's sessions ─────────────────────

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const actor = req.user!;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('design_sessions')
    .select('id, room_type, table_type, style, status, created_at, ai_concepts, converted_to_order_id')
    .eq('tenant_id', actor.tenant_id)
    .eq('created_by', actor.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new AppError('Failed to load design sessions.', 500, ERROR_CODES.INTERNAL_ERROR);
  }

  res.json({
    success: true,
    data: data ?? [],
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

// ─── GET /api/v1/design/sessions/:id — fetch single session ─────────────────

router.get('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  const actor = req.user!;
  const { id } = req.params as { id: string };
  const supabase = getAdminClient();

  const { data: session, error } = await supabase
    .from('design_sessions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', actor.tenant_id)
    .eq('created_by', actor.id)
    .single();

  if (error || !session) {
    throw new NotFoundError('Design session not found.');
  }

  // Refresh the signed URL if a photo exists
  if (session.room_photo_path) {
    const { data: signed } = await supabase.storage
      .from('room-photos')
      .createSignedUrl(session.room_photo_path as string, 3600);

    if (signed?.signedUrl) {
      session.room_photo_url = signed.signedUrl;
    }
  }

  res.json({
    success: true,
    data: session,
    meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
  });
});

export { router as designRouter };
