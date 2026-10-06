import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { MailModule } from './modules/mail/mail.module';
import { ServiceEventsModule } from './modules/service-events/service-events.module';
import { FamiliesModule } from './modules/families/families.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { VisitsModule } from './modules/visits/visits.module';
import { MinistryGroupsModule } from './modules/ministry-groups/ministry-groups.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig, { parseRedisUrl } from './config/redis.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig],
      // Tests must be hermetic: never read a developer's real .env (it holds live SMS/email keys).
      envFilePath: process.env.NODE_ENV === 'test' ? [] : ['.env.local', '.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('NODE_ENV');
        // Schema sync is opt-in. For backwards compatibility it still defaults on
        // in NODE_ENV=development when DB_SYNCHRONIZE is unset. Production should
        // set DB_SYNCHRONIZE=false and DB_RUN_MIGRATIONS=true.
        const syncFlag = config.get<string>('DB_SYNCHRONIZE');
        const synchronize = syncFlag !== undefined ? syncFlag === 'true' : env === 'development';
        const url = config.get<string>('database.url');
        return {
          type: 'postgres' as const,
          url,
          autoLoadEntities: true,
          synchronize,
          logging: config.get('DB_LOGGING') === 'true',
          migrations: [join(__dirname, 'database/migrations/*.{js,ts}')],
          migrationsRun: config.get('DB_RUN_MIGRATIONS') === 'true',
          ssl: url && /neon\.tech|sslmode=require/.test(url) ? { rejectUnauthorized: false } : false,
        };
      },
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        prefix: 'church-portal',
        connection: parseRedisUrl(config.get<string>('redis.url')!),
      }),
    }),

    // Per-IP limits (main.ts sets `trust proxy` so this is the real client IP).
    // Auth routes tighten these further with @Throttle on the controller.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 10000, limit: 100 },
      { name: 'long', ttl: 60000, limit: 300 },
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
    MaintenanceModule,
    VisitsModule,
    MinistryGroupsModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: throttle first, then authenticate, then authorize by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
