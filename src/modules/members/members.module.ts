import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member } from './member.entity';
import { Church } from '../churches/church.entity';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { MembersExportService } from './members-export.service';
import { ExportsModule } from '../exports/exports.module';

@Module({
  imports: [TypeOrmModule.forFeature([Member, Church]), ExportsModule],
  controllers: [MembersController],
  providers: [MembersService, MembersExportService],
  exports: [MembersService],
})
export class MembersModule {}
