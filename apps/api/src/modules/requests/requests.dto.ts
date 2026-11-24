import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaymentMethod, ServiceMode, Urgency } from '@prisma/client';
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
  @ApiProperty({ required: false, enum: ['any', 'weekdays', 'dates'], description: 'When the customer is available: every day, specific weekdays or specific dates' })
  @IsOptional() @IsIn(['any', 'weekdays', 'dates']) availabilityMode?: 'any' | 'weekdays' | 'dates';
  @ApiProperty({ required: false, type: [Number], description: '0 = Sunday … 6 = Saturday' })
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) availableWeekdays?: number[];
  @ApiProperty({ required: false, type: [String], description: 'Specific days, YYYY-MM-DD' })
  @IsOptional() @IsArray() @ArrayMaxSize(60) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true }) availableDates?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) budgetMinMinor?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) budgetMaxMinor?: number;
  @ApiProperty({ enum: Urgency }) @IsOptional() @IsEnum(Urgency) urgency?: Urgency;
  @ApiProperty({ enum: ['TRANSFER', 'CASH', 'PLATFORM'], required: false, description: 'How the customer intends to pay' }) @IsOptional() @IsIn(['TRANSFER', 'CASH', 'PLATFORM']) paymentMethod?: PaymentMethod;
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
  @ApiProperty({ required: false, enum: ['any', 'weekdays', 'dates'], description: 'When the customer is available: every day, specific weekdays or specific dates' })
  @IsOptional() @IsIn(['any', 'weekdays', 'dates']) availabilityMode?: 'any' | 'weekdays' | 'dates';
  @ApiProperty({ required: false, type: [Number], description: '0 = Sunday … 6 = Saturday' })
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) availableWeekdays?: number[];
  @ApiProperty({ required: false, type: [String], description: 'Specific days, YYYY-MM-DD' })
  @IsOptional() @IsArray() @ArrayMaxSize(60) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true }) availableDates?: string[];
  @IsOptional() @IsInt() @Min(0) budgetMinMinor?: number;
  @IsOptional() @IsInt() @Min(0) budgetMaxMinor?: number;
  @IsOptional() @IsEnum(Urgency) urgency?: Urgency;
  @IsOptional() @IsIn(['TRANSFER', 'CASH', 'PLATFORM']) paymentMethod?: PaymentMethod;
}

export class ListRequestsQuery extends PageQuery {
  @IsOptional() @IsIn(['active', 'draft', 'closed', 'all']) filter?: string;
}

export class InboxQuery extends PageQuery {
  @IsOptional() @IsIn(['new', 'offered', 'declined', 'all']) filter?: string;
}
