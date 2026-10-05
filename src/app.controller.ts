import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

import type { PingResponse } from './interfaces/ping-response.interface.js';
import { Public } from './auth/decorators/public.decorator.js';

@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/ping')
  getPing(): PingResponse {
    return this.appService.getPing();
  }
}
