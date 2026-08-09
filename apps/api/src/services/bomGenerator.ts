import axios from 'axios';
import { z } from 'zod';
import { config } from '../lib/config';
import { AppError } from '../middleware/errorHandler';

const bomItemSchema = z.object({
  assembly_name: z.string().min(1), sequence: z.number().int().nonnegative(),
  category: z.string().min(1), description: z.string().min(1), specification: z.string(),
  dimensions: z.string().nullable(), quantity: z.number().positive(), unit: z.string().min(1),
  waste_percentage: z.number().min(0).max(100), suggested_material: z.string().nullable(),
  acceptable_substitutes: z.array(z.string()), estimated_unit_cost: z.number().nonnegative().nullable(),
  estimated_total_cost: z.number().nonnegative().nullable(), confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string()), procurement_class: z.enum(['artisan_stock','buyer_supplied','vendor_eligible']),
});

const generatedBomSchema = z.object({
  confidence: z.number().min(0).max(1), assumptions: z.array(z.string()),
  unresolved_questions: z.array(z.string()), estimated_labour_hours: z.number().nonnegative(),
  estimated_machine_hours: z.number().nonnegative(), estimated_production_days: z.number().int().positive(),
  currency: z.string().length(3), items: z.array(bomItemSchema).min(1).max(250),
});
export type GeneratedBom = z.infer<typeof generatedBomSchema>;

const jsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['confidence','assumptions','unresolved_questions','estimated_labour_hours','estimated_machine_hours','estimated_production_days','currency','items'],
  properties: {
    confidence: { type: 'number', minimum: 0, maximum: 1 }, assumptions: { type: 'array', items: { type: 'string' } },
    unresolved_questions: { type: 'array', items: { type: 'string' } }, estimated_labour_hours: { type: 'number', minimum: 0 },
    estimated_machine_hours: { type: 'number', minimum: 0 }, estimated_production_days: { type: 'integer', minimum: 1 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    items: { type: 'array', minItems: 1, maxItems: 250, items: { type: 'object', additionalProperties: false,
      required: ['assembly_name','sequence','category','description','specification','dimensions','quantity','unit','waste_percentage','suggested_material','acceptable_substitutes','estimated_unit_cost','estimated_total_cost','confidence','assumptions','procurement_class'],
      properties: {
        assembly_name:{type:'string'}, sequence:{type:'integer',minimum:0}, category:{type:'string'}, description:{type:'string'}, specification:{type:'string'},
        dimensions:{type:['string','null']}, quantity:{type:'number',exclusiveMinimum:0}, unit:{type:'string'}, waste_percentage:{type:'number',minimum:0,maximum:100},
        suggested_material:{type:['string','null']}, acceptable_substitutes:{type:'array',items:{type:'string'}}, estimated_unit_cost:{type:['number','null'],minimum:0},
        estimated_total_cost:{type:['number','null'],minimum:0}, confidence:{type:'number',minimum:0,maximum:1}, assumptions:{type:'array',items:{type:'string'}},
        procurement_class:{type:'string',enum:['artisan_stock','buyer_supplied','vendor_eligible']},
      } } },
  },
} as const;

function outputText(payload: Record<string, unknown>): string {
  if (typeof payload['output_text'] === 'string') return payload['output_text'];
  const output = payload['output'];
  if (!Array.isArray(output)) return '';
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>)['content'];
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && typeof block === 'object' && typeof (block as Record<string, unknown>)['text'] === 'string') return (block as Record<string, unknown>)['text'] as string;
    }
  }
  return '';
}

export async function generateDraftBom(design: Record<string, unknown>): Promise<GeneratedBom & { model: string }> {
  if (!config.openai.apiKey) throw new AppError('AI BOM generation is not configured.', 503);
  const model = config.openai.bomModel;
  const response = await axios.post<Record<string, unknown>>('https://api.openai.com/v1/responses', {
    model,
    instructions: 'You are a furniture manufacturing estimator. Produce a conservative DRAFT bill of materials. Never invent missing dimensions: list them in unresolved_questions. Include materials, hardware, finishing consumables, packaging, waste, labour and machine estimates. The output requires artisan validation before procurement.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(design) }] }],
    text: { format: { type: 'json_schema', name: 'furniture_bom', strict: true, schema: jsonSchema } },
  }, { headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json', ...(config.openai.orgId ? { 'OpenAI-Organization': config.openai.orgId } : {}) }, timeout: 60_000 });
  const raw = outputText(response.data);
  if (!raw) throw new AppError('AI BOM generation returned no structured output.', 502);
  return { ...generatedBomSchema.parse(JSON.parse(raw) as unknown), model };
}
