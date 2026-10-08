import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMemberIsYouth1791600000000 implements MigrationInterface {
    name = 'AddMemberIsYouth1791600000000'

    // Idempotent: safe on databases that were ever auto-synced from the entities.
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "isYouth" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_members_church_isYouth" ON "members" ("churchId", "isYouth")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_members_church_isYouth"`);
        await queryRunner.query(`ALTER TABLE "members" DROP COLUMN IF EXISTS "isYouth"`);
    }
}
