import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { PrismaService } from '../../common/prisma.service';
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

  constructor(private jwt: JwtService, private config: ConfigService, private prisma: PrismaService) {}

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

  /** "X is typing…": relayed to the other participant of the conversation only. */
  @SubscribeMessage('typing')
  async typing(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId?: string; typing?: boolean }) {
    const userId = socket.data.userId as string | undefined;
    if (!userId || typeof body?.conversationId !== 'string') return;
    const c = await this.prisma.conversation.findUnique({ where: { id: body.conversationId }, select: { customerId: true, professional: { select: { userId: true } } } }).catch(() => null);
    if (!c) return;
    const other = c.customerId === userId ? c.professional.userId : c.professional.userId === userId ? c.customerId : null;
    if (other) this.emitToUser(other, 'typing', { conversationId: body.conversationId, typing: body.typing !== false });
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
