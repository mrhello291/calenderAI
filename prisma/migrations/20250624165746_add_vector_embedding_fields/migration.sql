-- AlterTable
ALTER TABLE "event_instances" ADD COLUMN     "vector_embedding" vector;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "vector_embedding" vector;
