import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber,
  IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PricingType, ProfessionalAccountType } from '@prisma/client';
import { PageQuery } from '../../common/pagination';

export class OnboardDto {
  @ApiProperty({ enum: ProfessionalAccountType }) @IsEnum(ProfessionalAccountType) accountType: ProfessionalAccountType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(2, 160) businessName?: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) categoryIds: string[];
  @ApiProperty({ required: false, description: 'A service not in the list, described by the professional ("Other")' })
  @IsOptional() @IsString() @Length(3, 80) otherService?: string;
  @ApiProperty() @IsString() @Length(2, 120) city: string;
  @ApiProperty() @IsLatitude() lat: number;
  @ApiProperty() @IsLongitude() lng: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) @Max(500) serviceRadiusKm?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() remoteAvailable?: boolean;
  @ApiProperty({ required: false, description: 'Company registration number (company accounts)' })
  @IsOptional() @IsString() @Length(2, 40) registrationNumber?: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(2, 160) businessName?: string;
  @IsOptional() @IsString() @MaxLength(160) headline?: string;
  @IsOptional() @IsString() @MaxLength(5000) biography?: string;
  @IsOptional() @IsInt() @Min(0) @Max(70) experienceYears?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(10) languages?: string[];
  @IsOptional() @IsString() @Length(2, 120) city?: string;
  @IsOptional() @IsLatitude() baseLat?: number;
  @IsOptional() @IsLongitude() baseLng?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) serviceRadiusKm?: number;
  @IsOptional() @IsBoolean() remoteAvailable?: boolean;
}

export class ServiceItemDto {
  @IsString() categoryId: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsEnum(PricingType) pricingType: PricingType;
  @IsOptional() @IsInt() @Min(0) indicativePriceMinor?: number;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() @Length(3, 80) customName?: string;
}
export class ServicesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => ServiceItemDto) services: ServiceItemDto[];
}

export class PortfolioDto {
  @IsString() @Length(1, 120) title: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsString() fileKey: string;
  @IsOptional() @IsString() categoryId?: string;
}

export class SearchQuery extends PageQuery {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) minRating?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPriceMinor?: number;
  @IsOptional() @IsIn(['identity', 'business', 'qualification']) verified?: 'identity' | 'business' | 'qualification';
  @IsOptional() @IsIn(['true', 'false']) remote?: string;
  @IsOptional() @IsString() availableOn?: string; // YYYY-MM-DD
  @IsOptional() @IsIn(['relevance', 'rating', 'distance', 'price']) sort?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() locale?: string;
}
