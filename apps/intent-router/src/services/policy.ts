export interface PolicyDecision {
  action: 'AUTO_APPROVE' | 'REQUIRE_REVIEW' | 'AUTO_REJECT';
  reasons: string[];
  riskScore: number;
  metadata?: Record<string, any>;
}

export async function evaluatePolicy(
  intent: any,
  context?: Record<string, any>
): Promise<PolicyDecision> {
  const reasons: string[] = [];
  let riskScore = 0;

  // Check confidence
  if (intent.confidence < 0.7) {
    riskScore += 30;
    reasons.push('Low confidence score');
  }

  // Check for sensitive intents
  const sensitiveIntents = ['delete', 'modify_permissions', 'access_secrets'];
  if (sensitiveIntents.includes(intent.label)) {
    riskScore += 50;
    reasons.push('Sensitive intent detected');
  }

  // Check tenant policy
  if (context?.tenantId) {
    // In production, fetch tenant policy from Firestore
    // For now, use default policy
    if (context.tenantId === 'high-security') {
      riskScore += 20;
      reasons.push('High security tenant');
    }
  }

  // Determine action based on risk score
  let action: PolicyDecision['action'];
  if (riskScore >= 70) {
    action = 'AUTO_REJECT';
    reasons.push('Risk score too high');
  } else if (riskScore >= 40) {
    action = 'REQUIRE_REVIEW';
    reasons.push('Manual review required');
  } else {
    action = 'AUTO_APPROVE';
    reasons.push('Within acceptable risk threshold');
  }

  return {
    action,
    reasons,
    riskScore,
    metadata: {
      intentLabel: intent.label,
      confidence: intent.confidence,
      tenantId: context?.tenantId
    }
  };
}