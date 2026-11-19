import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class JobsQuery extends PageQuery {
  @IsOptional() @IsIn(['customer', 'professional', 'company']) as?: string;
  @IsOptional() @IsIn(['upcoming', 'active', 'completed', 'cancelled', 'disputed', 'all']) filter?: string;
}

export class ProposeChangeDto {
  @IsOptional() @IsInt() @Min(0) priceMinor?: number;
  @IsOptional() @IsString() @Length(10, 5000) scope?: string;
  @IsOptional() @IsDateString() scheduledStartAt?: string;
  @IsOptional() @IsDateString() scheduledEndAt?: string;
  @IsString() @Length(5, 2000) reason: string;
}

export class RespondChangeDto {
  @IsIn(['accept', 'reject']) decision: 'accept' | 'reject';
}

export class CancelJobDto {
  @IsString() @Length(5, 2000) reason: string;
}

export class DisputeDto {
  @IsString() @Length(5, 200) reason: string;
  @IsOptional() @IsString() @MaxLength(5000) details?: string;
}

export class AssignDto {
  @IsString() userId: string;
}
