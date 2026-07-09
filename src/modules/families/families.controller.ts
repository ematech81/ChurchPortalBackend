import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FamiliesService } from './families.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';

@ApiTags('Families')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Get()
  findAll(@ChurchId() churchId: string) {
    return this.familiesService.findAll(churchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @ChurchId() churchId: string) {
    return this.familiesService.findByIdOrFail(id, churchId);
  }

  @Post()
  create(@ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.familiesService.create(churchId, body as any);
  }

  @Patch(':id')
  update(@Param('id') id: string, @ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.familiesService.update(id, churchId, body as any);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @ChurchId() churchId: string) {
    return this.familiesService.remove(id, churchId);
  }
}
