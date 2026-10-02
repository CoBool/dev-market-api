import { Injectable } from '@nestjs/common';
import type { PingResponse } from './interfaces/ping-response.interface.js';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
  getPing(): PingResponse {
    return { message: 'Pong!' };
  }
}
