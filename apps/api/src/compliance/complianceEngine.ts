/**
 * Compliance Rule Evaluation Service
 *
 * COMPLIANCE ARCHITECTURE:
 * This module implements a configurable rules engine for trade compliance checks.
 * Rules are loaded from the database (tenant-specific + global platform rules).
 * Evaluation results feed into order workflows and audit logs.
 *
 * DESIGN PRINCIPLES:
 * - Compliance decisions are NEVER delegated to the AI model
 * - Deterministic rules engine runs first; AI may provide supplementary analysis only
 * - All evaluations are logged for audit trail
 * - Blocking compliance checks halt business operations until resolved
 * - Rules are configurable per tenant (for region-specific requirements)
 *
 * HUMAN DECISION: Define your initial compliance rule set carefully with
 * your legal and compliance team. This scaffold provides the engine;
 * the rules themselves are a policy decision.
 *
 * ASSUMPTION: public.compliance_rules table exists with rule_type, config, is_active columns
 */

import { getAdminClient } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';
import { writeAuditLog } from '../services/auditLog';
import { ComplianceStatus, ComplianceRuleType } from '@sbdmm/shared';

export interface ComplianceCheckInput {
  tenant_id: string;
  actor_id: string;
  context_type: 'order' | 'vendor_onboarding' | 'document_upload' | 'quote';
  context_id: string;
  data: Record<string, unknown>; // The subject data to evaluate
  request_id?: string;
}

export interface ComplianceCheckResult {
  overall_status: ComplianceStatus;
  checks: ComplianceRuleResult[];
  blocked: boolean;
  requires_manual_review: boolean;
}

export interface ComplianceRuleResult {
  rule_id: string;
  rule_type: ComplianceRuleType;
  rule_name: string;
  status: ComplianceStatus;
  reason?: string;
  requires_manual_review: boolean;
}

/**
 * evaluateCompliance — Runs all active compliance rules against the provided context.
 *
 * SECURITY: This function is called server-side only and writes a compliance record
 * before returning. It NEVER trusts client-supplied compliance status.
 */
export async function evaluateCompliance(
  input: ComplianceCheckInput,
): Promise<ComplianceCheckResult> {
  const log = logger.child({
    request_id: input.request_id,
    tenant_id: input.tenant_id,
    context_type: input.context_type,
    context_id: input.context_id,
  });

  log.info('[COMPLIANCE] Starting evaluation', { context_type: input.context_type });

  try {
    // Load active rules for this tenant (tenant-specific + global)
    const { data: rules, error: rulesError } = await getAdminClient()
      .from('compliance_rules')
      .select('id, rule_type, name, config, applies_to_countries')
      .eq('is_active', true)
      .or(`tenant_id.eq.${input.tenant_id},tenant_id.is.null`); // null = global rule

    if (rulesError) {
      log.error('[COMPLIANCE] Failed to load rules', { error: rulesError.message });
      // HUMAN DECISION: Choose fail-open or fail-closed on rules load failure
      // Fail-closed (block) is the more secure default for trade compliance
      return {
        overall_status: 'failed',
        checks: [],
        blocked: true,
        requires_manual_review: true,
      };
    }

    if (!rules || rules.length === 0) {
      log.warn('[COMPLIANCE] No compliance rules found — passing by default', {
        tenant_id: input.tenant_id,
      });
      return {
        overall_status: 'passed',
        checks: [],
        blocked: false,
        requires_manual_review: false,
      };
    }

    // Evaluate each rule
    const checkResults: ComplianceRuleResult[] = [];
    for (const rule of rules) {
      const result = await evaluateSingleRule(rule as ComplianceRule, input);
      checkResults.push(result);
    }

    // Determine overall status
    const hasFailure = checkResults.some((r) => r.status === 'failed');
    const hasManualReview = checkResults.some((r) => r.requires_manual_review);
    const hasPending = checkResults.some((r) => r.status === 'pending');

    const overallStatus: ComplianceStatus = hasFailure
      ? 'failed'
      : hasManualReview
      ? 'manual_review'
      : hasPending
      ? 'pending'
      : 'passed';

    const result: ComplianceCheckResult = {
      overall_status: overallStatus,
      checks: checkResults,
      blocked: hasFailure,
      requires_manual_review: hasManualReview,
    };

    // Persist compliance evaluation result
    await getAdminClient().from('compliance_results').insert({
      tenant_id: input.tenant_id,
      context_type: input.context_type,
      context_id: input.context_id,
      overall_status: overallStatus,
      check_results: checkResults,
      evaluated_at: new Date().toISOString(),
    });

    // Audit log
    await writeAuditLog({
      event_type: overallStatus === 'passed' ? 'compliance.check_passed' : 'compliance.check_failed',
      actor_id: input.actor_id,
      tenant_id: input.tenant_id,
      target_type: input.context_type,
      target_id: input.context_id,
      outcome: hasFailure ? 'blocked' : 'success',
      details: {
        overall_status: overallStatus,
        rules_evaluated: checkResults.length,
        failures: checkResults.filter((r) => r.status === 'failed').map((r) => r.rule_name),
      },
      request_id: input.request_id,
    });

    log.info('[COMPLIANCE] Evaluation complete', {
      overall_status: overallStatus,
      rules_evaluated: checkResults.length,
    });

    return result;
  } catch (err) {
    log.error('[COMPLIANCE] Unexpected error during evaluation', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    // Fail-closed on unexpected errors
    return {
      overall_status: 'failed',
      checks: [],
      blocked: true,
      requires_manual_review: true,
    };
  }
}

// ─── Internal Rule Types ──────────────────────────────────────────────────────
interface ComplianceRule {
  id: string;
  rule_type: string;
  name: string;
  config: Record<string, unknown>;
  applies_to_countries?: string[];
}

/**
 * evaluateSingleRule — Dispatches to the appropriate rule evaluator.
 *
 * HUMAN DECISION: Implement real evaluation logic per rule type.
 * This scaffold provides the routing structure and safe defaults.
 * Real implementations will call sanctions APIs, customs APIs, etc.
 */
async function evaluateSingleRule(
  rule: ComplianceRule,
  input: ComplianceCheckInput,
): Promise<ComplianceRuleResult> {
  const baseResult: Omit<ComplianceRuleResult, 'status' | 'reason' | 'requires_manual_review'> = {
    rule_id: rule.id,
    rule_type: rule.rule_type as ComplianceRuleType,
    rule_name: rule.name,
  };

  try {
    switch (rule.rule_type as ComplianceRuleType) {
      case 'sanctions_check':
        return await evaluateSanctionsCheck(baseResult, rule, input);

      case 'document_required':
        return evaluateDocumentRequired(baseResult, rule, input);

      case 'regional_restriction':
        return evaluateRegionalRestriction(baseResult, rule, input);

      case 'esg_threshold':
        return evaluateEsgThreshold(baseResult, rule, input);

      case 'kyc':
        // HUMAN DECISION: Integrate with your KYC provider (e.g., Onfido, Sumsub)
        return {
          ...baseResult,
          status: 'manual_review',
          reason: 'KYC requires manual verification — integration not yet configured.',
          requires_manual_review: true,
        };

      case 'customs_classification':
        // HUMAN DECISION: Integrate with customs classification API
        return {
          ...baseResult,
          status: 'pending',
          reason: 'Customs classification pending external API integration.',
          requires_manual_review: false,
        };

      default:
        return {
          ...baseResult,
          status: 'pending',
          reason: `Rule type '${rule.rule_type}' has no evaluator configured.`,
          requires_manual_review: true,
        };
    }
  } catch (err) {
    logger.error('[COMPLIANCE] Rule evaluation error', {
      rule_id: rule.id,
      rule_type: rule.rule_type,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    // Fail-closed on individual rule errors
    return {
      ...baseResult,
      status: 'failed',
      reason: 'Rule evaluation encountered an error — treated as failure.',
      requires_manual_review: true,
    };
  }
}

// ─── Rule Evaluators ──────────────────────────────────────────────────────────

async function evaluateSanctionsCheck(
  base: Omit<ComplianceRuleResult, 'status' | 'reason' | 'requires_manual_review'>,
  _rule: ComplianceRule,
  _input: ComplianceCheckInput,
): Promise<ComplianceRuleResult> {
  // HUMAN DECISION: Integrate with OFAC, UN, EU sanctions APIs
  // This stub passes with a manual review flag until integrated.
  return {
    ...base,
    status: 'manual_review',
    reason: 'Sanctions screening requires integration with sanctions list provider.',
    requires_manual_review: true,
  };
}

function evaluateDocumentRequired(
  base: Omit<ComplianceRuleResult, 'status' | 'reason' | 'requires_manual_review'>,
  rule: ComplianceRule,
  input: ComplianceCheckInput,
): ComplianceRuleResult {
  const requiredDocType = rule.config['document_type'] as string | undefined;
  if (!requiredDocType) {
    return { ...base, status: 'passed', requires_manual_review: false };
  }

  // Check if the required document type exists in the context data
  const uploadedDocs = input.data['uploaded_documents'] as string[] | undefined;
  const hasDoc = uploadedDocs?.includes(requiredDocType) ?? false;

  return {
    ...base,
    status: hasDoc ? 'passed' : 'failed',
    ...(hasDoc ? {} : { reason: `Required document '${requiredDocType}' not uploaded.` }),
    requires_manual_review: false,
  };
}

function evaluateRegionalRestriction(
  base: Omit<ComplianceRuleResult, 'status' | 'reason' | 'requires_manual_review'>,
  rule: ComplianceRule,
  input: ComplianceCheckInput,
): ComplianceRuleResult {
  const restrictedCountries = rule.config['restricted_countries'] as string[] | undefined;
  const destinationCountry = input.data['destination_country'] as string | undefined;
  const originCountry = input.data['origin_country'] as string | undefined;

  if (!restrictedCountries || restrictedCountries.length === 0) {
    return { ...base, status: 'passed', requires_manual_review: false };
  }

  const isRestricted =
    (destinationCountry && restrictedCountries.includes(destinationCountry)) ||
    (originCountry && restrictedCountries.includes(originCountry));

  return {
    ...base,
    status: isRestricted ? 'failed' : 'passed',
    ...(isRestricted
      ? { reason: `Trade with ${destinationCountry ?? originCountry} is restricted under current compliance rules.` }
      : {}),
    requires_manual_review: false,
  };
}

function evaluateEsgThreshold(
  base: Omit<ComplianceRuleResult, 'status' | 'reason' | 'requires_manual_review'>,
  rule: ComplianceRule,
  input: ComplianceCheckInput,
): ComplianceRuleResult {
  const minScore = rule.config['minimum_esg_score'] as number | undefined;
  const vendorEsgScore = input.data['vendor_esg_score'] as number | undefined;

  if (minScore === undefined || vendorEsgScore === undefined) {
    return { ...base, status: 'pending', reason: 'ESG score data not available.', requires_manual_review: true };
  }

  return {
    ...base,
    status: vendorEsgScore >= minScore ? 'passed' : 'failed',
    ...(vendorEsgScore >= minScore
      ? {}
      : { reason: `Vendor ESG score (${vendorEsgScore}) is below minimum threshold (${minScore}).` }),
    requires_manual_review: false,
  };
}
