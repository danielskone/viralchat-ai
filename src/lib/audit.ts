import "server-only";
import { db } from "@/db";
import { auditLogs, activities } from "@/db/schema";

export async function audit(workspaceId: string | null, userId: string | null, action: string, target?: string, meta?: Record<string, unknown>) {
  try {
    await db.insert(auditLogs).values({ workspaceId, userId, action, target, meta });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

export async function logActivity(workspaceId: string, contactId: string | null, type: string, description: string) {
  await db.insert(activities).values({ workspaceId, contactId, type, description });
}
