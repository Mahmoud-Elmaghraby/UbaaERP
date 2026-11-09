export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface RecordAuditLogInput {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilters {
  userId?: string;
  entityType?: string;
  /** Any of these entity types (a module's documents). */
  entityTypes?: string[];
  /** One record's history (with entityType). */
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}
