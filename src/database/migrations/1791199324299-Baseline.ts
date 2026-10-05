import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1791199324299 implements MigrationInterface {
    name = 'Baseline1791199324299'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Databases that were created earlier through schema sync (e.g. the live one) already have
        // these tables; the baseline must be a no-op there. Later migrations carry the changes.
        if (await queryRunner.hasTable('users')) return;

        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."visits_status_enum" AS ENUM('scheduled', 'completed', 'missed')`);
        await queryRunner.query(`CREATE TABLE "visits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "workerId" uuid NOT NULL, "memberId" uuid, "title" character varying NOT NULL, "scheduledAt" TIMESTAMP NOT NULL, "address" character varying, "latitude" numeric(10,7), "longitude" numeric(10,7), "context" character varying, "status" "public"."visits_status_enum" NOT NULL DEFAULT 'scheduled', CONSTRAINT "PK_0b0b322289a41015c6ea4e8bf30" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('super_admin', 'senior_pastor', 'branch_pastor', 'admin_pastor', 'department_head', 'cell_leader', 'follow_up_worker', 'usher', 'finance_officer', 'member')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying, "passwordHash" character varying NOT NULL, "refreshTokenHash" character varying, "churchId" uuid, "role" "public"."users_role_enum" NOT NULL DEFAULT 'member', "isEmailVerified" boolean NOT NULL DEFAULT false, "otpCode" character varying, "otpExpiresAt" TIMESTAMP, "otpAttempts" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "avatarUrl" character varying, "hasPin" boolean NOT NULL DEFAULT false, "pinHash" character varying, "pinFailedAttempts" integer NOT NULL DEFAULT '0', "pinLockedUntil" TIMESTAMP, "loginCodeHash" character varying, "loginCodeUpdatedAt" TIMESTAMP, "loginCodeFailedAttempts" integer NOT NULL DEFAULT '0', "loginCodeLockedUntil" TIMESTAMP, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d09ea690026188d7bc7e5f67b1" ON "users" ("loginCodeHash") `);
        await queryRunner.query(`CREATE TABLE "service_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "name" character varying NOT NULL, "day" character varying, "time" character varying NOT NULL, "endTime" character varying, "location" character varying, "format" character varying NOT NULL DEFAULT 'in-person', "kind" character varying NOT NULL DEFAULT 'regular', "eventType" character varying, "eventDate" character varying, CONSTRAINT "PK_64aec60a9993270f6921b8f524d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."ministry_groups_status_enum" AS ENUM('active', 'recruiting', 'core', 'inactive', 'draft')`);
        await queryRunner.query(`CREATE TABLE "ministry_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "categoryId" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying, "leaderId" uuid, "leaderRoleTitle" character varying, "branchId" uuid, "cadence" character varying, "meetingDay" character varying, "meetingTime" character varying, "status" "public"."ministry_groups_status_enum" NOT NULL DEFAULT 'active', "coverImageUrl" character varying, "isDraft" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_0f23b716ec87d28eace4720ba53" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ministry_group_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "groupId" uuid NOT NULL, "memberId" uuid NOT NULL, "roleTitle" character varying NOT NULL DEFAULT 'Member', "joinedAt" TIMESTAMP NOT NULL DEFAULT now(), "leftAt" TIMESTAMP, CONSTRAINT "PK_f5c9182c24571877ae50a4d233d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ministry_group_attendance" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "groupId" uuid NOT NULL, "date" date NOT NULL, "presentCount" integer NOT NULL DEFAULT '0', "totalCount" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_fe6680e3a9783c08b7820579705" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "group_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid, "name" character varying NOT NULL, "description" character varying, "iconKey" character varying, "defaultLeaderTitle" character varying NOT NULL DEFAULT 'Leader', "defaultMemberTitle" character varying NOT NULL DEFAULT 'Member', "sortOrder" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_dad00acfe1331e999cc7bee4f47" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."message_logs_channel_enum" AS ENUM('whatsapp', 'sms', 'email', 'push')`);
        await queryRunner.query(`CREATE TYPE "public"."message_logs_status_enum" AS ENUM('queued', 'sent', 'delivered', 'failed')`);
        await queryRunner.query(`CREATE TABLE "message_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "memberId" uuid, "recipientPhone" character varying NOT NULL, "channel" "public"."message_logs_channel_enum" NOT NULL, "body" text NOT NULL, "status" "public"."message_logs_status_enum" NOT NULL DEFAULT 'queued', "providerMessageId" character varying, "sentAt" TIMESTAMP, "error" character varying, CONSTRAINT "PK_f0aae0d876a96fa1da0a1b97444" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."members_gender_enum" AS ENUM('male', 'female', 'other')`);
        await queryRunner.query(`CREATE TYPE "public"."members_maritalstatus_enum" AS ENUM('single', 'married', 'divorced', 'widowed')`);
        await queryRunner.query(`CREATE TYPE "public"."members_status_enum" AS ENUM('visitor', 'first_timer', 'new_convert', 'member', 'worker', 'minister', 'pastor', 'backslidden', 'transferred', 'deceased')`);
        await queryRunner.query(`CREATE TYPE "public"."members_baptismstatus_enum" AS ENUM('none', 'water', 'holy_spirit', 'both')`);
        await queryRunner.query(`CREATE TYPE "public"."members_membershipcategory_enum" AS ENUM('new_member', 'existing_member', 'pastor_registration', 'youth_member', 'children_member', 'family_registration')`);
        await queryRunner.query(`CREATE TYPE "public"."members_churchrole_enum" AS ENUM('branch_pastor', 'pastor', 'departmental_leader', 'worker', 'member', 'deacon', 'elder', 'other')`);
        await queryRunner.query(`CREATE TYPE "public"."members_pastoralposition_enum" AS ENUM('youth_pastor', 'associate_pastor', 'assistant_pastor', 'prayer_pastor', 'evangelism_pastor')`);
        await queryRunner.query(`CREATE TYPE "public"."members_agerange_enum" AS ENUM('0-5', '6-12', '13-17')`);
        await queryRunner.query(`CREATE TABLE "members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "memberId" character varying, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "middleName" character varying, "gender" "public"."members_gender_enum", "dateOfBirth" TIMESTAMP, "maritalStatus" "public"."members_maritalstatus_enum", "occupation" character varying, "photoUrl" character varying, "phone" character varying NOT NULL, "alternatePhone" character varying, "email" character varying, "address" character varying, "city" character varying, "state" character varying, "preferredLanguage" character varying, "emergencyContactName" character varying, "emergencyContactPhone" character varying, "status" "public"."members_status_enum" NOT NULL DEFAULT 'first_timer', "baptismStatus" "public"."members_baptismstatus_enum" NOT NULL DEFAULT 'none', "baptismDate" TIMESTAMP, "holyGhostBaptism" boolean NOT NULL DEFAULT false, "salvationDate" TIMESTAMP, "membershipDate" TIMESTAMP, "membershipCategory" "public"."members_membershipcategory_enum", "churchRole" "public"."members_churchrole_enum", "pastoralPosition" "public"."members_pastoralposition_enum", "customRole" character varying, "departmentName" character varying, "departmentRole" character varying, "departmentJoinedDate" TIMESTAMP, "parentGuardianName" character varying, "parentGuardianPhone" character varying, "ageRange" "public"."members_agerange_enum", "pickupAuthorization" character varying, "familyId" uuid, "householdId" uuid, "householdRole" character varying, "cellGroupId" uuid, "tags" text array NOT NULL DEFAULT '{}', "whatsappOptIn" boolean NOT NULL DEFAULT true, "smsOptIn" boolean NOT NULL DEFAULT true, "decisionType" character varying, "invitedBy" uuid, "createdById" uuid, "updatedById" uuid, "latitude" numeric(10,7), "longitude" numeric(10,7), "customFields" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_28b53062261b996d9c99fa12404" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f312929afc0db445981f3b3010" ON "members" ("churchId", "memberId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1458a3f3d6a788b85ab2fb5ced" ON "members" ("churchId", "email") `);
        await queryRunner.query(`CREATE INDEX "IDX_12b91a362ca5802e9c5236a112" ON "members" ("churchId", "phone") `);
        await queryRunner.query(`CREATE TYPE "public"."giving_records_fund_enum" AS ENUM('tithe', 'offering', 'building', 'missions', 'welfare', 'seed', 'pledge', 'other')`);
        await queryRunner.query(`CREATE TABLE "giving_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "memberId" uuid, "fund" "public"."giving_records_fund_enum" NOT NULL, "amount" numeric(12,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'NGN', "date" TIMESTAMP NOT NULL, "reference" character varying, "notes" character varying, "isAnonymous" boolean NOT NULL DEFAULT false, "recordedBy" character varying, CONSTRAINT "PK_8207a29e50ee6af324e5f6dcf56" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3b31051ce796d512b50a79de43" ON "giving_records" ("churchId", "memberId") `);
        await queryRunner.query(`CREATE TABLE "worker_code_dispatch_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "workerId" uuid NOT NULL, "workerName" character varying NOT NULL, "workerPhone" character varying, "code" character varying, "assignedBy" uuid, "channel" character varying NOT NULL DEFAULT 'pending_manual', "churchId" uuid, "expiresAt" TIMESTAMP, CONSTRAINT "PK_79e5190c0368cba600388373ab5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."follow_up_tasks_type_enum" AS ENUM('send_message', 'notify_worker', 'worker_action', 'check_status', 'escalate')`);
        await queryRunner.query(`CREATE TYPE "public"."follow_up_tasks_status_enum" AS ENUM('pending', 'processing', 'done', 'failed', 'skipped')`);
        await queryRunner.query(`CREATE TABLE "follow_up_tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "journeyId" uuid NOT NULL, "type" "public"."follow_up_tasks_type_enum" NOT NULL, "status" "public"."follow_up_tasks_status_enum" NOT NULL DEFAULT 'pending', "triggerAt" TIMESTAMP NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "processedAt" TIMESTAMP, "error" character varying, CONSTRAINT "PK_59b8a8794c3c8b1c1f3a5bccd46" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."follow_up_journeys_status_enum" AS ENUM('active', 'completed', 'paused', 'abandoned')`);
        await queryRunner.query(`CREATE TABLE "follow_up_journeys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "memberId" uuid NOT NULL, "assignedWorkerId" uuid, "status" "public"."follow_up_journeys_status_enum" NOT NULL DEFAULT 'active', "decisionType" character varying, "meta" jsonb NOT NULL DEFAULT '{}', "completedAt" TIMESTAMP, "journeyStage" character varying, "journeyProgress" integer NOT NULL DEFAULT '0', "urgent" boolean NOT NULL DEFAULT false, "dueDate" TIMESTAMP, "notes" character varying, CONSTRAINT "PK_a407ade6c957faf8d00dc10c51c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "families" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "familyName" character varying NOT NULL, "address" character varying, "headName" character varying, "headPhone" character varying, "headOccupation" character varying, "spouseName" character varying, "spousePhone" character varying, "spouseOccupation" character varying, "children" jsonb NOT NULL DEFAULT '[]', "numberOfChildren" integer NOT NULL DEFAULT '0', "createdById" uuid, CONSTRAINT "PK_70414ac0c8f45664cf71324b9bb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "churches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "name" character varying NOT NULL, "slug" character varying NOT NULL, "logoUrl" character varying, "address" character varying, "city" character varying, "state" character varying, "country" character varying, "denomination" character varying, "phone" character varying, "email" character varying, "website" character varying, "settings" jsonb NOT NULL DEFAULT '{}', "subscriptionPlan" character varying, "subscriptionStatus" character varying, "trialEndsAt" TIMESTAMP, "parentChurchId" uuid, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_6048a6f37c897751d61cbb0347a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7cf9653e300cedb022d70a7c1a" ON "churches" ("slug") `);
        await queryRunner.query(`CREATE TABLE "cell_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "name" character varying NOT NULL, "leaderId" uuid, "meetingDay" character varying, "meetingTime" character varying, "location" character varying, "parentCellId" uuid, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_bdb399c74ded099a1a5c38d1f99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."service_events_type_enum" AS ENUM('sunday', 'midweek', 'cell', 'special', 'crusade')`);
        await queryRunner.query(`CREATE TABLE "service_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "title" character varying NOT NULL, "type" "public"."service_events_type_enum" NOT NULL, "date" TIMESTAMP NOT NULL, "notes" character varying, CONSTRAINT "PK_1608e9859ce1f28c77cc896fdbc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "attendance_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "serviceEventId" uuid NOT NULL, "memberId" uuid, "visitorName" character varying, "checkedInAt" TIMESTAMP, "checkedInBy" character varying, CONSTRAINT "PK_946920332f5bc9efad3f3023b96" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dc66d4ee8b4673f88221fa6511" ON "attendance_records" ("churchId", "serviceEventId", "memberId") `);
        await queryRunner.query(`CREATE TABLE "households" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "name" character varying NOT NULL, "headMemberId" uuid, "address" character varying, CONSTRAINT "PK_2b1aef2640717132e9231aac756" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "households"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc66d4ee8b4673f88221fa6511"`);
        await queryRunner.query(`DROP TABLE "attendance_records"`);
        await queryRunner.query(`DROP TABLE "service_events"`);
        await queryRunner.query(`DROP TYPE "public"."service_events_type_enum"`);
        await queryRunner.query(`DROP TABLE "cell_groups"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7cf9653e300cedb022d70a7c1a"`);
        await queryRunner.query(`DROP TABLE "churches"`);
        await queryRunner.query(`DROP TABLE "families"`);
        await queryRunner.query(`DROP TABLE "follow_up_journeys"`);
        await queryRunner.query(`DROP TYPE "public"."follow_up_journeys_status_enum"`);
        await queryRunner.query(`DROP TABLE "follow_up_tasks"`);
        await queryRunner.query(`DROP TYPE "public"."follow_up_tasks_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."follow_up_tasks_type_enum"`);
        await queryRunner.query(`DROP TABLE "worker_code_dispatch_log"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3b31051ce796d512b50a79de43"`);
        await queryRunner.query(`DROP TABLE "giving_records"`);
        await queryRunner.query(`DROP TYPE "public"."giving_records_fund_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_12b91a362ca5802e9c5236a112"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1458a3f3d6a788b85ab2fb5ced"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f312929afc0db445981f3b3010"`);
        await queryRunner.query(`DROP TABLE "members"`);
        await queryRunner.query(`DROP TYPE "public"."members_agerange_enum"`);
        await queryRunner.query(`DROP TYPE "public"."members_pastoralposition_enum"`);
        await queryRunner.query(`DROP TYPE "public"."members_churchrole_enum"`);
        await queryRunner.query(`DROP TYPE "public"."members_membershipcategory_enum"`);
        await queryRunner.query(`DROP TYPE "public"."members_baptismstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."members_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."members_maritalstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."members_gender_enum"`);
        await queryRunner.query(`DROP TABLE "message_logs"`);
        await queryRunner.query(`DROP TYPE "public"."message_logs_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."message_logs_channel_enum"`);
        await queryRunner.query(`DROP TABLE "group_categories"`);
        await queryRunner.query(`DROP TABLE "ministry_group_attendance"`);
        await queryRunner.query(`DROP TABLE "ministry_group_members"`);
        await queryRunner.query(`DROP TABLE "ministry_groups"`);
        await queryRunner.query(`DROP TYPE "public"."ministry_groups_status_enum"`);
        await queryRunner.query(`DROP TABLE "service_schedules"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d09ea690026188d7bc7e5f67b1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "visits"`);
        await queryRunner.query(`DROP TYPE "public"."visits_status_enum"`);
    }

}
