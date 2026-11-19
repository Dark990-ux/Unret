import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Real-time channel for messages, notifications and job updates.
 * Each authenticated socket joins `user:<id>`. For horizontal scaling,
 * attach the socket.io Redis adapter so rooms span instances.
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(private jwt: JwtService, private config: ConfigService) {}

  async handleConnection(socket: Socket) {
    try {
      const token = (socket.handshake.auth?.token as string) || (socket.handshake.headers.authorization ?? '').replace('Bearer ', '');
      const payload = await this.jwt.verifyAsync(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
      socket.data.userId = payload.sub;
      await socket.join(`user:${payload.sub}`);
    } catch {
      this.logger.debug('Rejected unauthenticated socket');
      socket.disconnect(true);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
