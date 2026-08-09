export interface ArtisanRankInput { rating:number; reliabilityScore:number; specialtyOverlap:number; }
export function calculateArtisanRank(input:ArtisanRankInput):number {
  return input.rating*12+input.reliabilityScore*0.35+input.specialtyOverlap*5;
}
export function offerExpiry(offeredAt:Date):Date { return new Date(offeredAt.getTime()+15*60_000); }
export function paymentGate(input:{jobConfirmed:boolean;bomConfirmed:boolean;sourcingSelected:boolean;quotationApproved:boolean}):'blocked'|'authorized' {
  return input.jobConfirmed&&input.bomConfirmed&&input.sourcingSelected&&input.quotationApproved?'authorized':'blocked';
}
