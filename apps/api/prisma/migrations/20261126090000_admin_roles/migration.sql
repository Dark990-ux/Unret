-- Administrator roles (Owner, Support, Moderator, Finance); existing administrators become Owners
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'SUPPORT', 'MODERATOR', 'FINANCE');
ALTER TABLE "User" ADD COLUMN "adminRole" "AdminRole";
UPDATE "User" SET "adminRole" = 'OWNER' WHERE "role" = 'ADMIN';
