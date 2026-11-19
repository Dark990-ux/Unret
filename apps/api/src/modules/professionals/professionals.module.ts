import { Global, Module } from '@nestjs/common';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';

@Global()
@Module({ controllers: [ProfessionalsController], providers: [ProfessionalsService], exports: [ProfessionalsService] })
export class ProfessionalsModule {}
