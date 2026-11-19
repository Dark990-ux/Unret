import { Global, Module } from '@nestjs/common';
import { AdminCategoriesController, CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Global()
@Module({ controllers: [CategoriesController, AdminCategoriesController], providers: [CategoriesService], exports: [CategoriesService] })
export class CategoriesModule {}
