import { initializeAuthDatabase } from "../src/server/auth";

await initializeAuthDatabase();
process.stdout.write("Better Auth schema is current.\n");
