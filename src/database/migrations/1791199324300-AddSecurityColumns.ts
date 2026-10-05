import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Columns added during the security hardening pass. Idempotent (IF NOT EXISTS) so it is
 * safe on databases created by schema sync, and a harmless no-op after the baseline on new ones.
 */
export class AddSecurityColumns1791199324300 implements MigrationInterface {
    name = 'AddSecurityColumns1791199324300'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "otpAttempts" integer NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "otpAttempts"`);
    }
}
