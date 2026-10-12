import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { SessionService } from './auth/session.service';
import { ErrorFilter } from './common/correlation';
import { EPI_CONFIG, EpiConfig } from './config';
import { DATA_SOURCE } from './db/data-source';
import { HealthController } from './health/health.controller';
import { KpiController } from './kpi/kpi.controller';
import { KpiService } from './kpi/kpi.service';
import { OrgController } from './org/org.controller';
import { OrgService } from './org/org.service';
import { ScopeService } from './org/scope.service';
import { ReviewsController } from './reviews/reviews.controller';
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
      ],
      providers: [
        { provide: EPI_CONFIG, useValue: config },
        { provide: DATA_SOURCE, useValue: dataSource },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
        AuditService,
        SessionService,
        ScopeService,
        OrgService,
        KpiService,
        ReviewsService,
      ],
    };
  }
}
