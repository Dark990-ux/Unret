import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { OfferPriceType, PaymentMethod } from '@prisma/client';

export class OfferTermsDto {
  @ApiProperty({ description: 'Price in minor units (e.g. bani for RON)' }) @IsInt() @Min(0) priceMinor: number;
  @ApiProperty({ enum: OfferPriceType }) @IsEnum(OfferPriceType) priceType: OfferPriceType;
  @ApiProperty({ description: 'What the price includes' }) @IsString() @Length(10, 5000) description: string;
  @ApiProperty() @IsBoolean() materialsIncluded: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) materialsNote?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) additionalExpenses?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() proposedStartAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() proposedEndAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @ApiProperty({ required: false, description: 'Deposit to pay before the work starts, as % of the price (10–50)' })
  @IsOptional() @IsInt() @Min(10) @Max(50) depositPercent?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) depositNote?: string;
}

export class CreateOfferDto extends OfferTermsDto {
  @ApiProperty() @IsString() requestId: string;
  @ApiProperty({ description: 'Offer expiration date' }) @IsOptional() @IsDateString() expiresAt?: string;
}

export class ReviseOfferDto extends OfferTermsDto {
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class AcceptOfferDto {
  @ApiProperty({ description: 'Revision number the customer is accepting (guards against accepting a stale version)' })
  @IsInt() @Min(1) revision: number;
  @ApiProperty({ enum: ['TRANSFER', 'CASH', 'PLATFORM'] }) @IsOptional() @IsIn(['TRANSFER', 'CASH', 'PLATFORM']) paymentMethod?: PaymentMethod;
}

export class ReasonDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class ModificationDto {
  @IsString() @Length(5, 2000) message: string;
}
