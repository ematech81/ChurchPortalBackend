import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Church } from './church.entity';
import { ChurchesService } from './churches.service';
import { ChurchesController } from './churches.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Church, Member, User]),
    UsersModule,
    AuthModule,
  ],
  controllers: [ChurchesController],
  providers: [ChurchesService],
  exports: [ChurchesService],
})
export class ChurchesModule {}
