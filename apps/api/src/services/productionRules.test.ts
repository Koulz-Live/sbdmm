import {describe,expect,it} from 'vitest';
import {calculateArtisanRank,offerExpiry,paymentGate} from './productionRules';

describe('production rules',()=>{
  it('creates an exact fifteen-minute offer window',()=>{
    const start=new Date('2026-08-09T10:00:00.000Z');
    expect(offerExpiry(start).toISOString()).toBe('2026-08-09T10:15:00.000Z');
  });
  it('ranks reliability, rating and relevant specialty deterministically',()=>{
    expect(calculateArtisanRank({rating:4.5,reliabilityScore:90,specialtyOverlap:2})).toBe(95.5);
  });
  it('blocks payment until every prerequisite passes',()=>{
    expect(paymentGate({jobConfirmed:true,bomConfirmed:true,sourcingSelected:true,quotationApproved:false})).toBe('blocked');
    expect(paymentGate({jobConfirmed:true,bomConfirmed:true,sourcingSelected:true,quotationApproved:true})).toBe('authorized');
  });
});
