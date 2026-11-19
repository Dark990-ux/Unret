import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  list() {
    return this.prisma.country.findMany({
      where: { isActive: true },
      select: { code: true, name: true, currency: true, defaultLanguage: true, defaultTimezone: true, phonePrefix: true },
      orderBy: { name: 'asc' },
    });
  }
}
