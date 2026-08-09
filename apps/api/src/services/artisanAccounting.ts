import { getAdminClient } from '../lib/supabaseAdmin';
import { AppError } from '../middleware/errorHandler';

const accounts=[
  ['1000','Cash','asset'],['1100','Raw materials inventory','asset'],['1200','Work in progress','asset'],
  ['1300','Finished goods','asset'],['1400','Trade receivables','asset'],['2000','Trade payables','liability'],
  ['2100','Payroll payable','liability'],['4000','Furniture revenue','revenue'],['5000','Cost of sales','expense'],
] as const;
type EventType='material_purchase'|'materials_issued'|'direct_labour'|'production_completed'|'control_transferred'|'customer_payment'|'vendor_payable';
const mappings:Record<EventType,{debit:string;credit:string;description:string}>={
  material_purchase:{debit:'1100',credit:'1000',description:'Materials purchased for production'},
  materials_issued:{debit:'1200',credit:'1100',description:'Materials issued to work in progress'},
  direct_labour:{debit:'1200',credit:'2100',description:'Direct labour allocated to work in progress'},
  production_completed:{debit:'1300',credit:'1200',description:'Completed furniture transferred from WIP'},
  control_transferred:{debit:'1400',credit:'4000',description:'Revenue recognised on transfer of control'},
  customer_payment:{debit:'1000',credit:'1400',description:'Customer payment received'},
  vendor_payable:{debit:'1100',credit:'2000',description:'Vendor materials received on account'},
};

export async function recordFinancialEvent(input:{artisanId:string;jobId:string;eventType:EventType;amount:number;currency:string;description?:string;evidenceReference?:string}){
  const db=getAdminClient();
  await db.from('financial_accounts').upsert(accounts.map(([code,name,account_type])=>({artisan_id:input.artisanId,code,name,account_type})),{onConflict:'artisan_id,code'});
  const {data:accountRows}=await db.from('financial_accounts').select('id,code').eq('artisan_id',input.artisanId);
  const byCode=new Map((accountRows??[]).map(a=>[a.code as string,a.id as string]));const mapping=mappings[input.eventType];
  const {data:event,error:eventError}=await db.from('job_financial_events').insert({artisan_id:input.artisanId,job_id:input.jobId,event_type:input.eventType,amount:input.amount,currency:input.currency,description:input.description??mapping.description,evidence_reference:input.evidenceReference??null}).select().single();
  if(eventError||!event)throw new AppError('Unable to record financial event.',500);
  const {data:entry,error:entryError}=await db.from('journal_entries').insert({artisan_id:input.artisanId,job_id:input.jobId,description:input.description??mapping.description,source_event:input.eventType,source_id:event.id,status:'posted',posted_at:new Date().toISOString()}).select().single();
  if(entryError||!entry)throw new AppError('Unable to create journal entry.',500);
  const debitAccount=byCode.get(mapping.debit),creditAccount=byCode.get(mapping.credit);if(!debitAccount||!creditAccount)throw new AppError('Artisan chart of accounts is incomplete.',500);
  const {error:lineError}=await db.from('journal_lines').insert([{journal_entry_id:entry.id,account_id:debitAccount,debit:input.amount,credit:0,currency:input.currency},{journal_entry_id:entry.id,account_id:creditAccount,debit:0,credit:input.amount,currency:input.currency}]);
  if(lineError)throw new AppError('Unable to post balanced journal.',500);return {event,entry};
}
