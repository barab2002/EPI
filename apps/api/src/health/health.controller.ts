import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../auth/auth.guard';
import { DATA_SOURCE } from '../db/data-source';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DATA_SOURCE) private readonly ds: DataSource) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    // Reasons are fixed strings: never echo driver errors (may contain hosts/credentials).
    let pending: boolean;
    try {
      await this.ds.query('SELECT 1');
      pending = await this.ds.showMigrations();
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        reason: 'database unreachable',
      });
    }
    if (pending) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        reason: 'pending migrations',
      });
    }
    return { status: 'ok', database: 'ok', migrations: 'up-to-date' };
  }
}
