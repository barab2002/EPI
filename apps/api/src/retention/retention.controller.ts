import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentScope } from '../auth/current-scope.decorator';
import type { Scope } from '../org/scope.service';
import { RetentionService } from './retention.service';

/** Data retention status (ADR-032). Read-only: deletion runs daily or via the CLI. */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('api/v1/admin/retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get()
  @ApiOperation({ summary: 'Retention window, cutoff, what is due for deletion, last run' })
  describe(@CurrentScope() scope: Scope) {
    if (!scope.isAdmin) throw new ForbiddenException('Administrator role required');
    return this.retention.describe();
  }
}
