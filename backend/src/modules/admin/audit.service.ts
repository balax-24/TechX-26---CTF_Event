import { eq, and, desc, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { auditLogs } from '../../db/schema.js';
import { logger } from '../../utils/logger.js';

export interface AuditLogEntry {
  actorId?: string | null;
  actorRole?: string | null;
  actorIp: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousState?: any;
  newState?: any;
  reason?: string | null;
  requestId?: string | null;
  detailsJson?: any;
}

export interface AuditQueryFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}

/**
 * Strips sensitive credentials, flags, and cryptographic secrets from audit payloads.
 */
export function sanitizeAuditData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeAuditData);

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('flag') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('hmac') ||
      lowerKey.includes('hash') ||
      lowerKey.includes('invite')
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class AuditService {
  /**
   * Appends an immutable audit log record. Accepts either a transaction context or base DB.
   */
  async record(entry: AuditLogEntry, txContext?: any): Promise<void> {
    const targetDb = txContext || db;
    try {
      await targetDb.insert(auditLogs).values({
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        actorIp: entry.actorIp,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        previousState: sanitizeAuditData(entry.previousState),
        newState: sanitizeAuditData(entry.newState),
        reason: entry.reason ?? null,
        requestId: entry.requestId ?? null,
        detailsJson: sanitizeAuditData(entry.detailsJson),
      });
    } catch (err: any) {
      logger.error({ err: err.message, action: entry.action }, 'Failed to record audit log');
      // Do not silently suppress audit failures during active transactions
      if (txContext) {
        throw err;
      }
    }
  }

  /**
   * Queries audit logs with pagination and filtering.
   */
  async getAuditLogs(filters: AuditQueryFilters): Promise<{
    total: number;
    page: number;
    limit: number;
    logs: any[];
  }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
    if (filters.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));
    if (filters.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ total: count() })
      .from(auditLogs)
      .where(whereClause);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      total: countResult?.total || 0,
      page,
      limit,
      logs,
    };
  }
}

export const auditService = new AuditService();
