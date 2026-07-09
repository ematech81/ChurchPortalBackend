import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupCategory } from './group-category.entity';
import { MinistryGroup } from './ministry-group.entity';
import { MinistryGroupMember } from './ministry-group-member.entity';
import { MinistryGroupAttendance } from './ministry-group-attendance.entity';
import { Member } from '../members/member.entity';
import { MinistryGroupsService } from './ministry-groups.service';
import { MinistryGroupsController } from './ministry-groups.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupCategory,
      MinistryGroup,
      MinistryGroupMember,
      MinistryGroupAttendance,
      Member,
    ]),
  ],
  controllers: [MinistryGroupsController],
  providers: [MinistryGroupsService],
  exports: [MinistryGroupsService],
})
export class MinistryGroupsModule {}
