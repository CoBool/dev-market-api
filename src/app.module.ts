import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ArticlesModule } from './articles/articles.module.js';

@Module({
  imports: [ArticlesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
