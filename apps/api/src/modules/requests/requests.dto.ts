import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { ServiceMode, Urgency } from '@prisma/client';
import { PageQuery } from '../../common/pagination';

export class CreateRequestDto {
  @ApiProperty() @IsString() categoryId: string;
  @ApiProperty() @IsString() @Length(5, 140) title: string;
  @ApiProperty() @IsString() @Length(20, 5000) description: string;
  @ApiProperty({ enum: ServiceMode }) @IsEnum(ServiceMode) serviceMode: ServiceMode;
  @ApiProperty({ required: false, description: 'Exact address — only shared with the hired professional' })
  @IsOptional() @IsString() @MaxLength(300) addressText?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsLatitude() lat?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsLongitude() lng?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() preferredDate?: string;
  @ApiProperty({ required: false, description: 'End of the preferred period (inclusive), for date ranges' }) @IsOptional() @IsDateString() preferredDateTo?: string;
  @ApiProperty({ required: false, description: 'Send the request directly to this professional only' }) @IsOptional() @IsString() professionalId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(60) preferredTimeWindow?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) budgetMinMinor?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) budgetMaxMinor?: number;
  @ApiProperty({ enum: Urgency }) @IsOptional() @IsEnum(Urgency) urgency?: Urgency;
  @ApiProperty({ required: false, type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) attachmentKeys?: string[];
  @ApiProperty({ required: false, description: 'Publish immediately (otherwise saved as draft)' }) @IsOptional() @IsBoolean() publish?: boolean;
}

export class UpdateRequestDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @Length(5, 140) title?: string;
  @IsOptional() @IsString() @Length(20, 5000) description?: string;
  @IsOptional() @IsEnum(ServiceMode) serviceMode?: ServiceMode;
  @IsOptional() @IsString() @MaxLength(300) addressText?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
  @IsOptional() @IsDateString() preferredDate?: string;
  @IsOptional() @IsDateString() preferredDateTo?: string;
  @IsOptional() @IsString() @MaxLength(60) preferredTimeWindow?: string;
  @IsOptional() @IsInt() @Min(0) budgetMinMinor?: number;
  @IsOptional() @IsInt() @Min(0) budgetMaxMinor?: number;
  @IsOptional() @IsEnum(Urgency) urgency?: Urgency;
}

export class ListRequestsQuery extends PageQuery {
  @IsOptional() @IsIn(['active', 'draft', 'closed', 'all']) filter?: string;
}

export class InboxQuery extends PageQuery {
  @IsOptional() @IsIn(['new', 'offered', 'declined', 'all']) filter?: string;
}
