import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Visit } from './visit.entity';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Visit])],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
