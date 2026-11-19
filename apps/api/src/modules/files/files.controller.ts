import { BadRequestException, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { FilePurpose, StorageService } from './storage.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private storage: StorageService) {}

  @Post()
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File, @Body('purpose') purpose: FilePurpose) {
    if (!file) throw new BadRequestException('No file uploaded');
    const stored = await this.storage.put(user.id, purpose, file);
    return { ...stored, url: this.storage.signedUrl(stored.key) };
  }

  @Public()
  @Get('*')
  async download(@Param('0') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const file = await this.storage.read(decodeURIComponent(key), Number(exp), sig);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=600');
    if (file.mime === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.send(file.data);
  }
}
