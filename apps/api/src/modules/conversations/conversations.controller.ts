import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { ConversationsService } from './conversations.service';

class StartDto {
  @IsOptional() @IsString() professionalId?: string;
  @IsOptional() @IsString() requestId?: string;
}
class SendDto {
  @IsOptional() @IsString() @MaxLength(5000) body: string;
  @IsOptional() @IsString() attachmentKey?: string;
}

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.list(user);
  }

  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartDto) {
    return this.conversations.start(user, dto);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.read(id, user);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('before') before?: string) {
    return this.conversations.messages(id, user, before);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendDto) {
    return this.conversations.send(id, user, dto.body, dto.attachmentKey);
  }
}
