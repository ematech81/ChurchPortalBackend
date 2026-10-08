import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportLog } from './export-log.entity';
import { ExportLogService } from './export-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExportLog])],
  providers: [ExportLogService],
  exports: [ExportLogService],
})
export class ExportsModule {}
