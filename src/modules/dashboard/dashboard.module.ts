import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MembersService } from '../members/members.service';
import { Member } from '../members/member.entity';
import { Church } from '../churches/church.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Member, Church])],
  controllers: [DashboardController],
  providers: [DashboardService, MembersService],
})
export class DashboardModule {}
