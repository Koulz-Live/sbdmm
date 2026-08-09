import { getAdminClient } from '../lib/supabaseAdmin';
import { AppError } from '../middleware/errorHandler';
import { generateDraftBom } from './bomGenerator';
import { rankAndCreateOffers } from './jobMatching';

export async function startProductionWorkflow(input: {
  tenantId: string; orderId: string; designSessionId: string; buyerId: string;
  design: Record<string, unknown>; currency: string; specialties: string[];
  deliveryLatitude?: number; deliveryLongitude?: number;
}) {
  const db = getAdminClient();
  const { data: existing } = await db.from('production_jobs').select('*').eq('order_id', input.orderId).maybeSingle();
  if (existing) return existing;
  const { data: job, error } = await db.from('production_jobs').insert({
    tenant_id:input.tenantId, order_id:input.orderId, design_session_id:input.designSessionId,
    buyer_id:input.buyerId, approved_design:input.design, currency:input.currency, status:'matching',
    delivery_latitude:input.deliveryLatitude??null,delivery_longitude:input.deliveryLongitude??null,
  }).select().single();
  if (error || !job) throw new AppError('Unable to create production job.',500);
  try {
    const bom=await generateDraftBom(input.design);
    const subtotal=bom.items.reduce((sum,item)=>sum+(item.estimated_total_cost??0),0);
    const { data:version,error:versionError }=await db.from('bom_versions').insert({
      job_id:job.id,version:1,status:'ai_draft',source:'openai',model_used:bom.model,prompt_version:'furniture-bom-v1',
      confidence:bom.confidence,assumptions:bom.assumptions,unresolved_questions:bom.unresolved_questions,
      estimated_labour_hours:bom.estimated_labour_hours,estimated_machine_hours:bom.estimated_machine_hours,
      estimated_production_days:bom.estimated_production_days,subtotal_materials:subtotal,currency:bom.currency,created_by:input.buyerId,
    }).select().single();
    if(versionError||!version) throw new AppError('Unable to save generated BOM.',500);
    const { error:itemError }=await db.from('bom_items').insert(bom.items.map(item=>({...item,bom_version_id:version.id})));
    if(itemError) throw new AppError('Unable to save generated BOM items.',500);
    await rankAndCreateOffers(job.id,input.tenantId,input.specialties,input.deliveryLatitude,input.deliveryLongitude);
    return {...job,bom_version_id:version.id};
  } catch(error) {
    await db.from('production_jobs').delete().eq('id',job.id);
    throw error;
  }
}
