import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { OnboardDto, PortfolioDto, SearchQuery, ServicesDto, UpdateProfileDto } from './professionals.dto';
import { ProfessionalsService } from './professionals.service';

@ApiTags('professionals')
@Controller('professionals')
export class ProfessionalsController {
  constructor(private pros: ProfessionalsService) {}

  /** Public search. Ranking: relevance, location, availability, reliability, rating — never subscription tier. */
  @Public()
  @Get()
  search(@Query() q: SearchQuery) {
    return this.pros.search(q);
  }

  @ApiBearerAuth()
  @Post('onboard')
  onboard(@CurrentUser() user: AuthUser, @Body() dto: OnboardDto) {
    return this.pros.onboard(user.id, dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.pros.getMine(requirePro(user));
  }

  @ApiBearerAuth()
  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.pros.update(requirePro(user), dto);
  }

  @ApiBearerAuth()
  @Put('me/services')
  services(@CurrentUser() user: AuthUser, @Body() dto: ServicesDto) {
    return this.pros.setServices(requirePro(user), dto.services);
  }

  @ApiBearerAuth()
  @Post('me/portfolio')
  addPortfolio(@CurrentUser() user: AuthUser, @Body() dto: PortfolioDto) {
    return this.pros.addPortfolio(user.id, requirePro(user), dto);
  }

  @ApiBearerAuth()
  @Delete('me/portfolio/:id')
  removePortfolio(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pros.removePortfolio(requirePro(user), id);
  }

  @Public()
  @Get(':id')
  profile(@Param('id') id: string, @Query('locale') locale = 'ro', @Req() req: any) {
    return this.pros.publicProfile(id, locale, req.user);
  }
}
