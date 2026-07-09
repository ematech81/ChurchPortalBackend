import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CellGroup } from './cell-group.entity';
import { CellsService } from './cells.service';
import { CellsController } from './cells.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CellGroup])],
  controllers: [CellsController],
  providers: [CellsService],
  exports: [CellsService],
})
export class CellsModule {}
