import { getAdminClient } from '../lib/supabaseAdmin';
import { AppError } from '../middleware/errorHandler';
import { calculateArtisanRank, offerExpiry } from './productionRules';

function distanceKm(lat1:number,lon1:number,lat2:number,lon2:number):number{const rad=(v:number)=>v*Math.PI/180;const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
export async function rankAndCreateOffers(jobId: string, tenantId: string, specialties: string[], deliveryLatitude?:number, deliveryLongitude?:number): Promise<void> {
  const db = getAdminClient();
  const { data: artisans, error } = await db.from('artisan_profiles').select('*')
    .eq('tenant_id', tenantId).eq('capacity_available', true).eq('verification_status', 'verified');
  if (error) throw new AppError('Unable to rank artisans.', 500);
  const ranked = (artisans ?? []).filter(a=>deliveryLatitude===undefined||deliveryLongitude===undefined||a.latitude===null||a.longitude===null||distanceKm(deliveryLatitude,deliveryLongitude,Number(a.latitude),Number(a.longitude))<=Number(a.service_radius_km)).map((a) => {
    const overlap = ((a.specialties ?? []) as string[]).filter(s => specialties.includes(s)).length;
    const score = calculateArtisanRank({rating:Number(a.rating??0),reliabilityScore:Number(a.reliability_score??0),specialtyOverlap:overlap});
    const distance=deliveryLatitude!==undefined&&deliveryLongitude!==undefined&&a.latitude!==null&&a.longitude!==null?distanceKm(deliveryLatitude,deliveryLongitude,Number(a.latitude),Number(a.longitude)):null;
    return { artisan: a, score:score-(distance??0)*0.05, overlap, distance };
  }).sort((a,b) => b.score-a.score);
  if (ranked.length === 0) { await db.from('production_jobs').update({ status:'matching_failed' }).eq('id',jobId); return; }
  const now = new Date();
  const rows = ranked.map((r,index) => ({ job_id:jobId, artisan_id:r.artisan.user_id, ranking_position:index+1, ranking_score:r.score, ranking_factors:{rating:r.artisan.rating,reliability:r.artisan.reliability_score,specialty_overlap:r.overlap,distance_km:r.distance}, status:index===0?'offered':'scheduled', offered_at:index===0?now.toISOString():null, expires_at:index===0?offerExpiry(now).toISOString():null }));
  const { error: insertError } = await db.from('job_offers').insert(rows);
  if (insertError) throw new AppError('Unable to create artisan offers.', 500);
}

export async function advanceOffer(jobId: string): Promise<void> {
  const db=getAdminClient(); const now=new Date().toISOString();
  await db.from('job_offers').update({status:'expired'}).eq('job_id',jobId).in('status',['offered','viewed']).lte('expires_at',now);
  const { data: live }=await db.from('job_offers').select('id').eq('job_id',jobId).in('status',['offered','viewed','accepted']).limit(1);
  if ((live??[]).length) return;
  const { data: next }=await db.from('job_offers').select('id').eq('job_id',jobId).eq('status','scheduled').order('ranking_position').limit(1).maybeSingle();
  if (!next) { await db.from('production_jobs').update({status:'matching_failed'}).eq('id',jobId).eq('status','matching'); return; }
  const offeredAt=new Date(); await db.from('job_offers').update({status:'offered',offered_at:offeredAt.toISOString(),expires_at:offerExpiry(offeredAt).toISOString()}).eq('id',next.id);
}
