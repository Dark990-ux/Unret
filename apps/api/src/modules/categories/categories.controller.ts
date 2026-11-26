import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { VerificationType } from '@prisma/client';
import { AuthUser, CurrentUser, Public, Permission, Roles } from '../../common/decorators';
import { CategoriesService } from './categories.service';

class TranslationDto {
  @IsString() @Length(2, 5) locale: string;
  @IsString() @Length(1, 120) name: string;
  @IsOptional() @IsString() description?: string;
}
class CountryRuleDto {
  @IsString() @Length(2, 2) countryCode: string;
  @IsBoolean() isActive: boolean;
  @IsOptional() @IsBoolean() overrideRequirements?: boolean;
  @IsOptional() @IsArray() @IsEnum(VerificationType, { each: true }) requiredVerifications?: VerificationType[];
}
export class CategoryDto {
  @IsString() @Matches(/^[a-z0-9-]{2,60}$/) slug: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() remoteAllowed?: boolean;
  @IsOptional() @IsArray() @IsEnum(VerificationType, { each: true }) requiredVerifications?: VerificationType[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TranslationDto) translations?: TranslationDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CountryRuleDto) countries?: CountryRuleDto[];
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Public()
  @Get()
  tree(@Query('country') country = 'RO', @Query('locale') locale = 'ro') {
    return this.categories.tree(country.toUpperCase(), locale);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Permission('catalog.manage')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.adminList();
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CategoryDto) {
    return this.categories.upsert(u.id, null, dto);
  }

  @Put(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CategoryDto) {
    return this.categories.upsert(u.id, id, dto);
  }

  @Patch(':id/active')
  setActive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.categories.setActive(u.id, id, !!isActive);
  }
}
