import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class RegisterDto {
  @ApiProperty() @IsString() @Length(2, 120) name: string;
  @ApiProperty({ required: false }) @ValidateIf((o) => !o.phone) @IsEmail() email?: string;
  @ApiProperty({ required: false, description: 'E.164 format, e.g. +40712345678' })
  @ValidateIf((o) => !o.email) @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be in international format, e.g. +40712345678' })
  phone?: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(128) password: string;
  @ApiProperty({ example: 'RO' }) @IsString() @Length(2, 2) countryCode: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(2, 5) preferredLanguage?: string;
  @ApiProperty({ description: 'Must be true: acceptance of terms and privacy policy' }) @IsBoolean() @Equals(true) acceptTerms: boolean;
}

export class LoginDto {
  @ApiProperty({ description: 'Email or phone number' }) @IsString() identifier: string;
  @ApiProperty() @IsString() password: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(6, 6) mfaCode?: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken: string;
}

export class MfaCodeDto {
  @ApiProperty() @IsString() @Length(6, 6) code: string;
}

export class ForgotPasswordDto {
  @IsString() @MaxLength(200) email: string;
}
export class ResetPasswordDto {
  @IsString() @MaxLength(200) token: string;
  @IsString() @MinLength(10) @MaxLength(128) password: string;
}
export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}
