/**
 * Policy Engine for AGI Operations Layer
 * Implements governance, autonomy levels, and compliance controls
 */

export enum AutonomyLevel {
  MANUAL = 0,        // All actions require human approval
  ASSISTED = 1,      // AI suggests, human approves
  SUPERVISED = 2,    // AI acts, human can intervene
  DELEGATED = 3,     // AI acts independently, reports results
  AUTONOMOUS = 4,    // Full autonomy within boundaries
}

export interface PolicyRule {
  id: string
  name: string
  description: string
  condition: {
    field: string
    operator: 'equals' | 'contains' | 'greater' | 'less' | 'regex' | 'in'
    value: any
  }
  action: 'allow' | 'deny' | 'review' | 'escalate'
  priority: number
  metadata: {
    createdAt: number
    updatedAt: number
    author: string
    tags: string[]
  }
}

export interface PolicyDecision {
  id: string
  timestamp: number
  action: 'allow' | 'deny' | 'review' | 'escalate'
  reasons: string[]
  appliedRules: PolicyRule[]
  autonomyLevel: AutonomyLevel
  requiresApproval: boolean
  riskScore: number
  compliance: {
    passed: boolean
    violations: string[]
    warnings: string[]
  }
  metadata: {
    sessionId: string
    tenantId: string
    evaluationTime: number
  }
}

export interface TenantPolicy {
  tenantId: string
  name: string
  autonomyLevel: AutonomyLevel
  rules: PolicyRule[]
  compliance: {
    frameworks: string[] // ['GDPR', 'HIPAA', 'SOC2', etc.]
    dataResidency: string[]
    retentionDays: number
  }
  limits: {
    maxCostPerDay: number
    maxRequestsPerMinute: number
    maxDataProcessingGB: number
    allowedServices: string[]
    blockedServices: string[]
  }
  approval: {
    required: boolean
    approvers: string[]
    timeout: number
    escalationPath: string[]
  }
}

export interface ActionRequest {
  id: string
  sessionId: string
  tenantId: string
  action: string
  target: string
  parameters: Record<string, any>
  context: {
    intent: string
    confidence: number
    risk: 'low' | 'medium' | 'high' | 'critical'
    cost: number
    impact: string[]
  }
  requester: {
    id: string
    type: 'user' | 'system' | 'ai'
    role: string
  }
}

export class PolicyEngine {
  private policies: Map<string, TenantPolicy> = new Map()
  private globalRules: PolicyRule[] = []
  private decisionCache: Map<string, PolicyDecision> = new Map()

  constructor() {
    this.initializeGlobalRules()
  }

  /**
   * Initialize global security and compliance rules
   */
  private initializeGlobalRules(): void {
    this.globalRules = [
      {
        id: 'global-001',
        name: 'Block Destructive Actions',
        description: 'Prevent any destructive operations without explicit approval',
        condition: {
          field: 'action',
          operator: 'in',
          value: ['delete', 'destroy', 'purge', 'terminate', 'shutdown'],
        },
        action: 'review',
        priority: 100,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          author: 'system',
          tags: ['security', 'critical'],
        },
      },
      {
        id: 'global-002',
        name: 'High Cost Protection',
        description: 'Review actions exceeding cost threshold',
        condition: {
          field: 'context.cost',
          operator: 'greater',
          value: 100,
        },
        action: 'review',
        priority: 90,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          author: 'system',
          tags: ['cost', 'governance'],
        },
      },
      {
        id: 'global-003',
        name: 'PII Data Protection',
        description: 'Ensure PII handling compliance',
        condition: {
          field: 'parameters',
          operator: 'contains',
          value: ['ssn', 'credit_card', 'passport', 'driver_license'],
        },
        action: 'escalate',
        priority: 95,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          author: 'system',
          tags: ['privacy', 'compliance'],
        },
      },
      {
        id: 'global-004',
        name: 'Rate Limiting',
        description: 'Prevent request flooding',
        condition: {
          field: 'metadata.requestRate',
          operator: 'greater',
          value: 100,
        },
        action: 'deny',
        priority: 85,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          author: 'system',
          tags: ['security', 'performance'],
        },
      },
    ]
  }

  /**
   * Register tenant-specific policy
   */
  registerTenantPolicy(policy: TenantPolicy): void {
    this.policies.set(policy.tenantId, policy)
    console.log(`Registered policy for tenant: ${policy.tenantId}`)
  }

  /**
   * Evaluate action request against policies
   */
  async evaluateAction(request: ActionRequest): Promise<PolicyDecision> {
    const startTime = Date.now()
    const cacheKey = this.getCacheKey(request)

    // Check cache
    const cached = this.decisionCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp < 30000)) { // 30 second cache
      return cached
    }

    // Get tenant policy
    const tenantPolicy = this.policies.get(request.tenantId) || this.getDefaultPolicy(request.tenantId)

    // Evaluate rules
    const applicableRules = this.getApplicableRules(request, tenantPolicy)
    const ruleDecisions = this.evaluateRules(request, applicableRules)

    // Calculate risk score
    const riskScore = this.calculateRiskScore(request, ruleDecisions)

    // Check compliance
    const compliance = this.checkCompliance(request, tenantPolicy)

    // Determine final action
    const finalAction = this.determineFinalAction(ruleDecisions, riskScore, tenantPolicy.autonomyLevel)

    // Build decision
    const decision: PolicyDecision = {
      id: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      action: finalAction,
      reasons: this.buildReasons(ruleDecisions, riskScore, compliance),
      appliedRules: applicableRules,
      autonomyLevel: tenantPolicy.autonomyLevel,
      requiresApproval: this.requiresApproval(finalAction, tenantPolicy.autonomyLevel, riskScore),
      riskScore,
      compliance,
      metadata: {
        sessionId: request.sessionId,
        tenantId: request.tenantId,
        evaluationTime: Date.now() - startTime,
      },
    }

    // Cache decision
    this.decisionCache.set(cacheKey, decision)

    // Clean old cache entries
    this.cleanCache()

    return decision
  }

  /**
   * Get applicable rules for request
   */
  private getApplicableRules(request: ActionRequest, policy: TenantPolicy): PolicyRule[] {
    const rules = [...this.globalRules, ...policy.rules]

    return rules
      .filter(rule => this.ruleApplies(rule, request))
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * Check if rule applies to request
   */
  private ruleApplies(rule: PolicyRule, request: ActionRequest): boolean {
    const fieldValue = this.getFieldValue(request, rule.condition.field)

    switch (rule.condition.operator) {
      case 'equals':
        return fieldValue === rule.condition.value

      case 'contains':
        if (Array.isArray(fieldValue)) {
          return rule.condition.value.some((v: any) => fieldValue.includes(v))
        }
        return String(fieldValue).includes(rule.condition.value)

      case 'greater':
        return Number(fieldValue) > Number(rule.condition.value)

      case 'less':
        return Number(fieldValue) < Number(rule.condition.value)

      case 'regex':
        return new RegExp(rule.condition.value).test(String(fieldValue))

      case 'in':
        return rule.condition.value.includes(fieldValue)

      default:
        return false
    }
  }

  /**
   * Get field value from request
   */
  private getFieldValue(request: ActionRequest, field: string): any {
    const parts = field.split('.')
    let value: any = request

    for (const part of parts) {
      value = value?.[part]
    }

    return value
  }

  /**
   * Evaluate all applicable rules
   */
  private evaluateRules(_request: ActionRequest, rules: PolicyRule[]): Map<PolicyRule, 'allow' | 'deny' | 'review' | 'escalate'> {
    const decisions = new Map<PolicyRule, 'allow' | 'deny' | 'review' | 'escalate'>()

    for (const rule of rules) {
      decisions.set(rule, rule.action)
    }

    return decisions
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(request: ActionRequest, ruleDecisions: Map<PolicyRule, string>): number {
    let score = 0

    // Base risk from context
    switch (request.context.risk) {
      case 'critical': score += 40; break
      case 'high': score += 30; break
      case 'medium': score += 20; break
      case 'low': score += 10; break
    }

    // Risk from rule decisions
    for (const [_rule, decision] of ruleDecisions) {
      if (decision === 'deny') score += 20
      if (decision === 'escalate') score += 15
      if (decision === 'review') score += 10
    }

    // Risk from action type
    const riskyActions = ['delete', 'modify', 'execute', 'deploy']
    if (riskyActions.some(action => request.action.toLowerCase().includes(action))) {
      score += 15
    }

    // Risk from confidence
    if (request.context.confidence < 0.7) {
      score += 10
    }

    // Risk from cost
    if (request.context.cost > 50) {
      score += Math.min(20, request.context.cost / 10)
    }

    return Math.min(100, score)
  }

  /**
   * Check compliance requirements
   */
  private checkCompliance(request: ActionRequest, policy: TenantPolicy): {
    passed: boolean
    violations: string[]
    warnings: string[]
  } {
    const violations: string[] = []
    const warnings: string[] = []

    // Check service allowlist/blocklist
    if (policy.limits.blockedServices.includes(request.target)) {
      violations.push(`Service '${request.target}' is blocked by policy`)
    }

    if (policy.limits.allowedServices.length > 0 && !policy.limits.allowedServices.includes(request.target)) {
      violations.push(`Service '${request.target}' is not in allowed list`)
    }

    // Check cost limits
    if (request.context.cost > policy.limits.maxCostPerDay) {
      violations.push(`Cost ${request.context.cost} exceeds daily limit ${policy.limits.maxCostPerDay}`)
    }

    // Check data residency
    if (policy.compliance.dataResidency.length > 0) {
      // This would check actual data location
      warnings.push('Data residency requirements apply')
    }

    // Check framework compliance
    for (const framework of policy.compliance.frameworks) {
      if (framework === 'GDPR' && this.containsPII(request)) {
        warnings.push('GDPR compliance required for PII processing')
      }
      if (framework === 'HIPAA' && this.containsPHI(request)) {
        violations.push('HIPAA compliance required for PHI')
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      warnings,
    }
  }

  /**
   * Determine final action based on all factors
   */
  private determineFinalAction(
    ruleDecisions: Map<PolicyRule, string>,
    riskScore: number,
    autonomyLevel: AutonomyLevel
  ): 'allow' | 'deny' | 'review' | 'escalate' {
    // Check for any deny decisions
    for (const decision of ruleDecisions.values()) {
      if (decision === 'deny') return 'deny'
    }

    // Check for escalation
    for (const decision of ruleDecisions.values()) {
      if (decision === 'escalate') return 'escalate'
    }

    // Check risk threshold
    if (riskScore > 70) return 'escalate'
    if (riskScore > 50) return 'review'

    // Check autonomy level
    if (autonomyLevel === AutonomyLevel.MANUAL) return 'review'
    if (autonomyLevel === AutonomyLevel.ASSISTED && riskScore > 30) return 'review'

    // Check for review requirements
    for (const decision of ruleDecisions.values()) {
      if (decision === 'review') return 'review'
    }

    return 'allow'
  }

  /**
   * Check if approval is required
   */
  private requiresApproval(action: string, autonomyLevel: AutonomyLevel, riskScore: number): boolean {
    if (action === 'deny') return false
    if (action === 'escalate' || action === 'review') return true

    if (autonomyLevel <= AutonomyLevel.ASSISTED) return true
    if (autonomyLevel === AutonomyLevel.SUPERVISED && riskScore > 40) return true

    return false
  }

  /**
   * Build decision reasons
   */
  private buildReasons(
    ruleDecisions: Map<PolicyRule, string>,
    riskScore: number,
    compliance: { passed: boolean; violations: string[]; warnings: string[] }
  ): string[] {
    const reasons: string[] = []

    // Add rule reasons
    for (const [rule, decision] of ruleDecisions) {
      if (decision !== 'allow') {
        reasons.push(`${rule.name}: ${decision}`)
      }
    }

    // Add risk reason
    if (riskScore > 50) {
      reasons.push(`High risk score: ${riskScore}/100`)
    }

    // Add compliance reasons
    for (const violation of compliance.violations) {
      reasons.push(`Compliance violation: ${violation}`)
    }

    for (const warning of compliance.warnings) {
      reasons.push(`Compliance warning: ${warning}`)
    }

    return reasons.length > 0 ? reasons : ['Action allowed by policy']
  }

  /**
   * Check if request contains PII
   */
  private containsPII(request: ActionRequest): boolean {
    const piiPatterns = ['email', 'phone', 'ssn', 'address', 'name', 'dob']
    const requestStr = JSON.stringify(request.parameters).toLowerCase()

    return piiPatterns.some(pattern => requestStr.includes(pattern))
  }

  /**
   * Check if request contains PHI
   */
  private containsPHI(request: ActionRequest): boolean {
    const phiPatterns = ['diagnosis', 'treatment', 'medication', 'medical', 'health']
    const requestStr = JSON.stringify(request.parameters).toLowerCase()

    return phiPatterns.some(pattern => requestStr.includes(pattern))
  }

  /**
   * Get default policy for tenant
   */
  private getDefaultPolicy(tenantId: string): TenantPolicy {
    return {
      tenantId,
      name: 'Default Policy',
      autonomyLevel: AutonomyLevel.ASSISTED,
      rules: [],
      compliance: {
        frameworks: ['SOC2'],
        dataResidency: [],
        retentionDays: 30,
      },
      limits: {
        maxCostPerDay: 100,
        maxRequestsPerMinute: 60,
        maxDataProcessingGB: 10,
        allowedServices: [],
        blockedServices: [],
      },
      approval: {
        required: true,
        approvers: [],
        timeout: 3600,
        escalationPath: ['admin'],
      },
    }
  }

  /**
   * Get cache key for request
   */
  private getCacheKey(request: ActionRequest): string {
    return `${request.tenantId}-${request.action}-${request.target}-${JSON.stringify(request.context)}`
  }

  /**
   * Clean old cache entries
   */
  private cleanCache(): void {
    const now = Date.now()
    const maxAge = 60000 // 1 minute

    for (const [key, decision] of this.decisionCache.entries()) {
      if (now - decision.timestamp > maxAge) {
        this.decisionCache.delete(key)
      }
    }
  }
}