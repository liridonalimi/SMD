export type AuditLogDto = {
  id: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
};

export type AuditActionsResponse = string[];
