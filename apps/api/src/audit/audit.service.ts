import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DATA_SOURCE } from '../db/data-source';

/** Append-only audit trail. Metadata must never contain secrets or review text. */
@Injectable()
export class AuditService {
  constructor(@Inject(DATA_SOURCE) private readonly ds: DataSource) {}

  async record(
    actorUserId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata: Record<string, unknown> = {},
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.ds).query(
      `INSERT INTO audit_events(actor_user_id,action,resource_type,resource_id,metadata_json)
       VALUES ($1,$2,$3,$4,$5)`,
      [actorUserId, action, resourceType, resourceId, JSON.stringify(metadata)],
    );
  }
}
