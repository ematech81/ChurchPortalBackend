import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CellsService } from './cells.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';

@ApiTags('Cells')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cells')
export class CellsController {
  constructor(private readonly cellsService: CellsService) {}

  @Get()
  findAll(@ChurchId() churchId: string) {
    return this.cellsService.findAll(churchId);
  }

  @Post()
  create(@ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.cellsService.create(churchId, body as never);
  }
}
