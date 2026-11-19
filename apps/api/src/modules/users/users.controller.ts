import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { UsersService } from './users.service';

export class UpdateMeDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(2, 5) preferredLanguage?: string;
  @IsOptional() @IsString() @MaxLength(300) addressText?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() avatarKey?: string | null;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.update(user.id, dto);
  }

  /** GDPR Art. 15/20 — machine-readable export of the user's personal data. */
  @Get('me/export')
  export(@CurrentUser() user: AuthUser) {
    return this.users.exportData(user.id);
  }

  /** GDPR Art. 17 — account deletion (anonymization preserving legal/transaction records). */
  @Delete('me')
  @HttpCode(200)
  remove(@CurrentUser() user: AuthUser) {
    return this.users.deleteAccount(user.id);
  }

  @Get('me/saved')
  saved(@CurrentUser() user: AuthUser) {
    return this.users.saved(user.id);
  }

  @Post('me/saved/:professionalId')
  save(@CurrentUser() user: AuthUser, @Param('professionalId') professionalId: string) {
    return this.users.save(user.id, professionalId);
  }

  @Delete('me/saved/:professionalId')
  unsave(@CurrentUser() user: AuthUser, @Param('professionalId') professionalId: string) {
    return this.users.unsave(user.id, professionalId);
  }
}
