import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiCookieAuth, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentScope } from '../auth/current-scope.decorator';
import { OrgService } from './org.service';
import type { Scope } from './scope.service';

@ApiTags('organization')
@ApiCookieAuth()
@Controller('api/v1')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('organization/tree')
  @ApiOperation({ summary: 'Organization → group → team tree, pruned to the caller’s scope' })
  tree(@CurrentScope() scope: Scope) {
    return this.org.tree(scope);
  }

  @Get('groups/:id')
  @ApiNotFoundResponse({ description: 'Unknown or out of scope (indistinguishable by design)' })
  group(@CurrentScope() scope: Scope, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.group(scope, id);
  }

  @Get('teams/:id')
  @ApiNotFoundResponse({ description: 'Unknown or out of scope (indistinguishable by design)' })
  team(@CurrentScope() scope: Scope, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.team(scope, id);
  }

  @Get('developers/:id')
  @ApiNotFoundResponse({ description: 'Unknown or out of scope (indistinguishable by design)' })
  developer(@CurrentScope() scope: Scope, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.developer(scope, id);
  }
}
