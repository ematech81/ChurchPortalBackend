import { MigrationInterface, QueryRunner } from "typeorm";

export class EventRegistrationAndExports1791407454028 implements MigrationInterface {
    name = 'EventRegistrationAndExports1791407454028'

    // Idempotent on purpose: a database that was ever auto-synced from the entities already has these
    // tables, and the migration must not crash the server on startup in that case.
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "export_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "userId" uuid NOT NULL, "kind" character varying NOT NULL, "format" character varying NOT NULL, "rowCount" integer NOT NULL DEFAULT '0', "details" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_cba8d8105ac48685076eb2c81e3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_011eed9283cb00e35e89aef28e" ON "export_logs" ("churchId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "event_registrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "eventId" uuid NOT NULL, "fullName" character varying NOT NULL, "phone" character varying NOT NULL, "dedupeKey" character varying, "ticketCode" character varying NOT NULL, "answers" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_953d3b862c2487289a92b2356e9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_18f5178dc0f8100d9c6ae68cdc" ON "event_registrations" ("eventId", "ticketCode") `);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_83a91506859f65d53235a6db65" ON "event_registrations" ("eventId", "dedupeKey") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_8286555921bfb0325d8856c989" ON "event_registrations" ("eventId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "event_forms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "churchId" uuid NOT NULL, "slug" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "startsAt" TIMESTAMP, "venue" character varying, "registrationClosesAt" TIMESTAMP, "capacity" integer, "isOpen" boolean NOT NULL DEFAULT true, "uniquePhone" boolean NOT NULL DEFAULT true, "confirmationMessage" text, "fields" jsonb NOT NULL DEFAULT '[]', "createdById" uuid, CONSTRAINT "PK_fd190df040aeed6ecfdd12ee979" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_d73c35e0a68960d4d3a97e8af2" ON "event_forms" ("slug") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d73c35e0a68960d4d3a97e8af2"`);
        await queryRunner.query(`DROP TABLE "event_forms"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8286555921bfb0325d8856c989"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_83a91506859f65d53235a6db65"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_18f5178dc0f8100d9c6ae68cdc"`);
        await queryRunner.query(`DROP TABLE "event_registrations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_011eed9283cb00e35e89aef28e"`);
        await queryRunner.query(`DROP TABLE "export_logs"`);
    }

}
