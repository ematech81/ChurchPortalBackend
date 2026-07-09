import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChurchesModule } from './modules/churches/churches.module';
import { MembersModule } from './modules/members/members.module';
import { HouseholdsModule } from './modules/households/households.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { FollowUpModule } from './modules/follow-up/follow-up.module';
import { GivingModule } from './modules/giving/giving.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { CellsModule } from './modules/cells/cells.module';
import { BillingModule } from './modules/billing/billing.module';
import { MailModule } from './modules/mail/mail.module';
import { ServiceEventsModule } from './modules/service-events/service-events.module';
import { FamiliesModule } from './modules/families/families.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { VisitsModule } from './modules/visits/visits.module';
import { MinistryGroupsModule } from './modules/ministry-groups/ministry-groups.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('database.url'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') === 'development',
        logging: config.get('NODE_ENV') === 'development',
        migrations: ['dist/database/migrations/*.js'],
        ssl: config.get('database.url')?.includes('neon.tech')
          ? { rejectUnauthorized: false }
          : false,
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        prefix: 'church-portal',
        connection: {
          url: config.get('redis.url'),
          tls: {},
        },
      }),
    }),

    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 50 },
      { name: 'long', ttl: 60000, limit: 200 },
    ]),

    MailModule,
    AuthModule,
    DashboardModule,
    UsersModule,
    ChurchesModule,
    ServiceEventsModule,
    FamiliesModule,
    MembersModule,
    HouseholdsModule,
    AttendanceModule,
    FollowUpModule,
    GivingModule,
    MessagingModule,
    CellsModule,
    BillingModule,
    MaintenanceModule,
    VisitsModule,
    MinistryGroupsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
