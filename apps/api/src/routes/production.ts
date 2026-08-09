import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getAdminClient, getUserScopedClient } from '../lib/supabaseAdmin';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { advanceOffer } from '../services/jobMatching';
import { writeAuditLog } from '../services/auditLog';
import { recordFinancialEvent } from '../services/artisanAccounting';

const router=Router(); router.use(requireAuth);
const uuid=z.string().uuid();
const item=z.object({assembly_name:z.string().min(1),sequence:z.number().int().nonnegative(),category:z.string().min(1),description:z.string().min(1),specification:z.string(),dimensions:z.string().nullable(),quantity:z.number().positive(),unit:z.string().min(1),waste_percentage:z.number().min(0).max(100),suggested_material:z.string().nullable(),acceptable_substitutes:z.array(z.string()),estimated_unit_cost:z.number().nonnegative().nullable(),estimated_total_cost:z.number().nonnegative().nullable(),confidence:z.number().min(0).max(1).nullable(),assumptions:z.array(z.string()),procurement_class:z.enum(['artisan_stock','buyer_supplied','vendor_eligible'])});
const bomUpdate=z.object({assumptions:z.array(z.string()).default([]),unresolved_questions:z.array(z.string()).default([]),estimated_labour_hours:z.number().nonnegative(),estimated_machine_hours:z.number().nonnegative(),estimated_production_days:z.number().int().positive(),currency:z.string().length(3),items:z.array(item).min(1).max(250)});

router.get('/offers/me',async(req,res)=>{
  if(req.user!.role!=='artisan') throw new AppError('Artisan access required.',403);
  const db=getAdminClient();
  const {data,error}=await db.from('job_offers').select('*, production_jobs(id,status,approved_design,currency,estimated_completion_date)').eq('artisan_id',req.user!.id).in('status',['offered','viewed']).order('expires_at');
  if(error) throw new AppError('Unable to load job offers.',500);
  for(const offer of data??[]) if(offer.expires_at && new Date(offer.expires_at)<=new Date()) await advanceOffer(offer.job_id);
  const {data:fresh}=await db.from('job_offers').select('*, production_jobs(id,status,approved_design,currency,estimated_completion_date)').eq('artisan_id',req.user!.id).in('status',['offered','viewed']).gt('expires_at',new Date().toISOString()).order('expires_at');
  res.json({success:true,data:fresh??[],meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/offers/:offerId/view',async(req,res)=>{
  const offerId=uuid.parse(req.params['offerId']); const db=getAdminClient();
  const {data,error}=await db.from('job_offers').update({status:'viewed',viewed_at:new Date().toISOString()}).eq('id',offerId).eq('artisan_id',req.user!.id).eq('status','offered').select().single();
  if(error||!data) throw new NotFoundError('Job offer'); res.json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/offers/:offerId/accept',async(req,res)=>{
  if(req.user!.role!=='artisan') throw new AppError('Artisan access required.',403);
  const offerId=uuid.parse(req.params['offerId']); const token=req.headers.authorization!.slice(7);
  const {data,error}=await getUserScopedClient(token).rpc('accept_job_offer',{p_offer_id:offerId});
  if(error) throw new AppError(error.message.includes('expired')?'This offer has expired.':'This job is no longer available.',409);
  await writeAuditLog({event_type:'order.status_changed',actor_id:req.user!.id,tenant_id:req.user!.tenant_id,target_type:'job_offer',target_id:offerId,outcome:'success',details:{action:'accepted'},request_id:req.requestId});
  res.json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/offers/:offerId/decline',async(req,res)=>{
  if(req.user!.role!=='artisan') throw new AppError('Artisan access required.',403);
  const offerId=uuid.parse(req.params['offerId']); const reason=z.object({reason:z.string().min(2).max(500)}).parse(req.body); const db=getAdminClient();
  const {data,error}=await db.from('job_offers').update({status:'declined',decline_reason:reason.reason}).eq('id',offerId).eq('artisan_id',req.user!.id).in('status',['offered','viewed']).select('job_id').single();
  if(error||!data) throw new NotFoundError('Job offer'); await advanceOffer(data.job_id); res.json({success:true,data:{declined:true},meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.get('/jobs',async(req,res)=>{
  const db=getAdminClient(); let query=db.from('production_jobs').select('*, bom_versions(id,version,status,subtotal_materials,currency,created_at)').eq('tenant_id',req.user!.tenant_id).order('created_at',{ascending:false});
  if(req.user!.role==='artisan') query=query.eq('artisan_id',req.user!.id); else if(req.user!.role==='buyer') query=query.eq('buyer_id',req.user!.id); else if(req.user!.role==='vendor') throw new AppError('Vendor access uses supply requests.',403);
  const {data,error}=await query;if(error)throw new AppError('Unable to load production jobs.',500);res.json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.get('/jobs/:jobId',async(req,res)=>{
  const jobId=uuid.parse(req.params['jobId']);const db=getAdminClient();const {data,error}=await db.from('production_jobs').select('*, bom_versions(*, bom_items(*)), sourcing_decisions(*), payment_authorizations(*)').eq('id',jobId).single();
  if(error||!data)throw new NotFoundError('Production job');if(data.buyer_id!==req.user!.id&&data.artisan_id!==req.user!.id&&req.user!.role!=='admin')throw new NotFoundError('Production job');res.json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/jobs/:jobId/bom',async(req,res)=>{
  if(req.user!.role!=='artisan')throw new AppError('Artisan access required.',403);const jobId=uuid.parse(req.params['jobId']);const body=bomUpdate.parse(req.body);const db=getAdminClient();
  const {data:job}=await db.from('production_jobs').select('id,artisan_id').eq('id',jobId).single();if(!job||job.artisan_id!==req.user!.id)throw new NotFoundError('Production job');
  const {data:latest}=await db.from('bom_versions').select('version').eq('job_id',jobId).order('version',{ascending:false}).limit(1).single();const subtotal=body.items.reduce((s,i)=>s+(i.estimated_total_cost??0),0);
  const {items,...versionBody}=body;
  const {data:version,error}=await db.from('bom_versions').insert({job_id:jobId,version:Number(latest?.version??0)+1,status:'draft',source:'artisan',created_by:req.user!.id,...versionBody,subtotal_materials:subtotal}).select().single();if(error||!version)throw new AppError('Unable to save BOM version.',500);
  const {error:itemError}=await db.from('bom_items').insert(items.map(i=>({...i,bom_version_id:version.id})));if(itemError)throw new AppError('Unable to save BOM items.',500);await db.from('production_jobs').update({status:'bom_review'}).eq('id',jobId);res.status(201).json({success:true,data:version,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/jobs/:jobId/confirm',async(req,res)=>{
  if(req.user!.role!=='artisan')throw new AppError('Artisan access required.',403);const jobId=uuid.parse(req.params['jobId']);const body=z.object({bom_version_id:uuid,final_job_price:z.number().positive(),estimated_completion_date:z.string().date()}).parse(req.body);const db=getAdminClient();
  const {data:job}=await db.from('production_jobs').select('artisan_id').eq('id',jobId).single();if(!job||job.artisan_id!==req.user!.id)throw new NotFoundError('Production job');
  await db.from('bom_versions').update({status:'superseded'}).eq('job_id',jobId).neq('id',body.bom_version_id);const {data:bom}=await db.from('bom_versions').update({status:'confirmed',confirmed_by:req.user!.id,confirmed_at:new Date().toISOString()}).eq('id',body.bom_version_id).eq('job_id',jobId).select().single();if(!bom)throw new AppError('BOM version not found.',400);
  const {data,error}=await db.from('production_jobs').update({status:'confirmed',final_job_price:body.final_job_price,estimated_completion_date:body.estimated_completion_date,confirmed_at:new Date().toISOString()}).eq('id',jobId).select().single();if(error)throw new AppError('Unable to confirm job.',500);
  await db.from('payment_authorizations').upsert({job_id:jobId,status:'blocked',amount:body.final_job_price,currency:bom.currency,requirements:{job_confirmed:true,bom_confirmed:true,sourcing_selected:false,quotation_approved:false}},{onConflict:'job_id'});
  res.json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/jobs/:jobId/sourcing',async(req,res)=>{
  if(req.user!.role!=='artisan')throw new AppError('Artisan access required.',403);const jobId=uuid.parse(req.params['jobId']);const body=z.object({bom_version_id:uuid,method:z.enum(['artisan_self_procure','vendor_procurement']),material_budget:z.number().nonnegative(),funding_method:z.enum(['artisan_funded','buyer_advance','platform_advance','included_in_job_price']).optional()}).parse(req.body);const db=getAdminClient();
  const {data:job}=await db.from('production_jobs').select('artisan_id,status').eq('id',jobId).single();if(!job||job.artisan_id!==req.user!.id)throw new NotFoundError('Production job');if(job.status!=='confirmed')throw new AppError('Confirm the final job before choosing material sourcing.',409);
  const status=body.method==='vendor_procurement'?'quotation_pending':'approved';const {data,error}=await db.from('sourcing_decisions').upsert({job_id:jobId,...body,status,decided_by:req.user!.id,decided_at:new Date().toISOString()},{onConflict:'job_id'}).select().single();if(error)throw new AppError('Unable to save sourcing decision.',500);
  if(body.method==='vendor_procurement')await db.from('supply_requests').upsert({tenant_id:req.user!.tenant_id,job_id:jobId,bom_version_id:body.bom_version_id,status:'open'},{onConflict:'job_id,bom_version_id'});
  await db.from('payment_authorizations').update({status:body.method==='artisan_self_procure'?'authorized':'blocked',requirements:{job_confirmed:true,bom_confirmed:true,sourcing_selected:true,quotation_approved:body.method==='artisan_self_procure'},...(body.method==='artisan_self_procure'?{authorized_at:new Date().toISOString(),authorized_by:req.user!.id}:{})}).eq('job_id',jobId);
  await db.from('production_jobs').update({status:body.method==='vendor_procurement'?'materials_sourcing':'production_ready'}).eq('id',jobId);res.json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.get('/supply-requests',async(req,res)=>{
  if(req.user!.role!=='vendor')throw new AppError('Vendor access required.',403);const db=getAdminClient();
  const {data,error}=await db.from('supply_requests').select('*, bom_versions(id,version,currency,bom_items(assembly_name,category,description,specification,dimensions,quantity,unit,waste_percentage,suggested_material,acceptable_substitutes))').eq('tenant_id',req.user!.tenant_id).in('status',['open','quoted']).gt('response_deadline',new Date().toISOString()).order('response_deadline');
  if(error)throw new AppError('Unable to load supply requests.',500);res.json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/supply-requests/:requestId/quotes',async(req,res)=>{
  if(req.user!.role!=='vendor')throw new AppError('Vendor access required.',403);const requestId=uuid.parse(req.params['requestId']);const body=z.object({currency:z.string().length(3),subtotal:z.number().nonnegative(),tax:z.number().nonnegative().default(0),delivery_fee:z.number().nonnegative().default(0),lead_time_days:z.number().int().positive(),valid_until:z.string().datetime(),payment_terms:z.string().max(1000).default(''),line_items:z.array(z.object({bom_item_id:z.string().uuid().optional(),description:z.string(),quantity:z.number().positive(),unit_price:z.number().nonnegative(),substitute:z.string().optional()})).min(1),notes:z.string().max(2000).optional()}).parse(req.body);const total=body.subtotal+body.tax+body.delivery_fee;const db=getAdminClient();
  const {data:request}=await db.from('supply_requests').select('id,tenant_id,status,response_deadline').eq('id',requestId).eq('tenant_id',req.user!.tenant_id).single();if(!request||request.status!=='open'||new Date(request.response_deadline)<=new Date())throw new AppError('Supply request is closed.',409);
  const {data,error}=await db.from('vendor_supply_quotes').upsert({supply_request_id:requestId,vendor_user_id:req.user!.id,status:'submitted',...body,total,submitted_at:new Date().toISOString()},{onConflict:'supply_request_id,vendor_user_id'}).select().single();if(error)throw new AppError('Unable to submit quotation.',500);await db.from('supply_requests').update({status:'quoted'}).eq('id',requestId);res.status(201).json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.get('/financials/summary',async(req:Request,res:Response)=>{
  if(req.user!.role!=='artisan')throw new AppError('Artisan access required.',403);const db=getAdminClient();const {data:entries,error}=await db.from('journal_entries').select('id,status,entry_date,job_id,journal_lines(debit,credit,financial_accounts(code,name,account_type))').eq('artisan_id',req.user!.id).eq('status','posted');if(error)throw new AppError('Unable to load financial summary.',500);
  const totals={assets:0,liabilities:0,equity:0,revenue:0,expenses:0};for(const entry of entries??[])for(const line of (entry.journal_lines??[]) as Array<Record<string,unknown>>){const accounts=line['financial_accounts'];const account=Array.isArray(accounts)?accounts[0]:accounts;const type=String((account as Record<string,unknown>|null)?.['account_type']??'');const net=Number(line['debit'])-Number(line['credit']);if(type==='asset')totals.assets+=net;if(type==='liability')totals.liabilities-=net;if(type==='equity')totals.equity-=net;if(type==='revenue')totals.revenue-=net;if(type==='expense')totals.expenses+=net;}res.json({success:true,data:{...totals,profit:totals.revenue-totals.expenses,label:'Draft management report — accountant review required'},meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

router.post('/jobs/:jobId/financial-events',async(req,res)=>{
  if(req.user!.role!=='artisan')throw new AppError('Artisan access required.',403);const jobId=uuid.parse(req.params['jobId']);const body=z.object({event_type:z.enum(['material_purchase','materials_issued','direct_labour','production_completed','control_transferred','customer_payment','vendor_payable']),amount:z.number().positive(),currency:z.string().length(3).default('ZAR'),description:z.string().min(2).max(1000).optional(),evidence_reference:z.string().max(1000).optional()}).parse(req.body);const db=getAdminClient();const {data:job}=await db.from('production_jobs').select('artisan_id').eq('id',jobId).single();if(!job||job.artisan_id!==req.user!.id)throw new NotFoundError('Production job');const data=await recordFinancialEvent({artisanId:req.user!.id,jobId,eventType:body.event_type,amount:body.amount,currency:body.currency,...(body.description?{description:body.description}:{}),...(body.evidence_reference?{evidenceReference:body.evidence_reference}:{})});res.status(201).json({success:true,data,meta:{request_id:req.requestId,timestamp:new Date().toISOString()}});
});

export {router as productionRouter};
