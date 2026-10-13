import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { CurrentScope } from '../auth/current-scope.decorator';
import type { Scope } from '../org/scope.service';
import { ReviewsService } from './reviews.service';

export class CreateAssessmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subjectUserId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Independence rubric (KPI-07)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  independence!: number;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Growth rubric (KPI-08)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  growth!: number;

  @ApiProperty({ minLength: 20, maxLength: 4000, description: 'Concrete evidence for the ratings' })
  @IsString()
  @Length(20, 4000)
  evidence!: string;

  @ApiPropertyOptional({ default: false, description: 'true = submit (locks the assessment)' })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class ListAssessmentsQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subject_user_id?: string;
}

@ApiTags('reviews')
@ApiCookieAuth()
@Controller('api/v1/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Assessments the caller may read' })
  list(@CurrentScope() scope: Scope, @Query() q: ListAssessmentsQuery) {
    return this.reviews.list(scope, q.subject_user_id);
  }

  @Get('due')
  @ApiOperation({
    summary: 'People the caller may assess with no submitted assessment in the open monthly cycle',
  })
  due(@CurrentScope() scope: Scope) {
    return this.reviews.due(scope);
  }

  @Post()
  @ApiOperation({
    summary: 'Create or update (draft) / submit a monthly assessment for a managed member',
  })
  upsert(@CurrentScope() scope: Scope, @Body() dto: CreateAssessmentDto) {
    return this.reviews.upsert(scope, { ...dto, submit: dto.submit ?? false });
  }
}
