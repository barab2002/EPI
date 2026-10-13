import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AdminController } from './admin/admin.controller';
import { IdentityController } from './admin/identity.controller';
import { IdentityService } from './admin/identity.service';
import { OrgAdminController } from './admin/org-admin.controller';
import { OrgAdminService } from './admin/org-admin.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { OidcService } from './auth/oidc.service';
import { SessionService } from './auth/session.service';
import { ErrorFilter } from './common/correlation';
import { EPI_CONFIG, EpiConfig } from './config';
import { DATA_SOURCE } from './db/data-source';
import { DirectoryClient } from './directory/directory.client';
import { DirectoryController } from './directory/directory.controller';
import { DIRECTORY_READER, DirectoryService } from './directory/directory.service';
import { GitLabSync } from './ingestion/gitlab/gitlab.sync';
import { JiraSync } from './ingestion/jira/jira.sync';
import { SyncScheduler } from './ingestion/sync-scheduler';
import { HealthController } from './health/health.controller';
import { KpiController } from './kpi/kpi.controller';
import { KpiService } from './kpi/kpi.service';
import { OrgController } from './org/org.controller';
import { OrgService } from './org/org.service';
import { ScopeService } from './org/scope.service';
import { RetentionController } from './retention/retention.controller';
import { RetentionService } from './retention/retention.service';
import { ReviewsController } from './reviews/reviews.controller';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { ReviewsService } from './reviews/reviews.service';

/** Single application module: the slice is small enough that feature modules would be ceremony. */
@Global()
@Module({})
export class AppModule {
  static forRoot(config: EpiConfig, dataSource: DataSource): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        OrgController,
        KpiController,
        ReviewsController,
        AdminController,
        IdentityController,
        OrgAdminController,
        AuditController,
        DirectoryController,
        RetentionController,
        SettingsController,
      ],
      providers: [
        { provide: EPI_CONFIG, useValue: config },
        { provide: DATA_SOURCE, useValue: dataSource },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
        AuditService,
        SessionService,
        OidcService,
        ScopeService,
        OrgService,
        KpiService,
        ReviewsService,
        IdentityService,
        OrgAdminService,
        DirectoryService,
        RetentionService,
        SettingsService,
        {
          provide: DIRECTORY_READER,
          useValue: config.directory ? new DirectoryClient(config.directory) : null,
        },
        SyncScheduler,
        {
          provide: JiraSync,
          useFactory: (ds: DataSource) => new JiraSync(ds),
          inject: [DATA_SOURCE],
        },
        {
          provide: GitLabSync,
          useFactory: (ds: DataSource) => new GitLabSync(ds),
          inject: [DATA_SOURCE],
        },
      ],
    };
  }
}
