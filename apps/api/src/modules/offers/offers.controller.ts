import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { AcceptOfferDto, CreateOfferDto, ModificationDto, ReasonDto, ReviseOfferDto } from './offers.dto';
import { OffersService } from './offers.service';

@ApiTags('offers')
@ApiBearerAuth()
@Controller('offers')
export class OffersController {
  constructor(private offers: OffersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    requirePro(user);
    return this.offers.create(user, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    requirePro(user);
    return this.offers.mine(user, status);
  }

  @Get('request/:requestId')
  forRequest(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string) {
    return this.offers.forRequest(user, requestId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offers.get(user, id);
  }

  @Post(':id/revise')
  revise(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviseOfferDto) {
    requirePro(user);
    return this.offers.revise(user, id, dto);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    requirePro(user);
    return this.offers.withdraw(user, id);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AcceptOfferDto) {
    return this.offers.accept(user, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.offers.reject(user, id, dto.reason);
  }

  @Post(':id/request-modification')
  modification(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ModificationDto) {
    return this.offers.requestModification(user, id, dto.message);
  }
}
