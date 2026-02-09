import { runInteractiveSync } from "./interactive";
import { fetchPlaySpaceData, detectAllChanges, runSync } from "@/sync";
import { getEnv } from "@/sync/config/env";
import { closeDatabase } from "@/sync/ledger/db";

const args = process.argv.slice(2);
const isAuto = args.includes("--auto") || args.includes("--once");
const dryRun = process.env.SYNC_DRY_RUN === "true";

async function main() {
  if (isAuto) {
    // Headless mode — sync everything, no prompts
    const env = getEnv();
    if (!env.PLAYSPACE_CLIENT_ID || !env.PLAYSPACE_CLIENT_SECRET || !env.PLAYSPACE_AUTH0_DOMAIN || !env.PLAYSPACE_AUDIENCE) {
      throw new Error("PLAYSPACE_CLIENT_ID, PLAYSPACE_CLIENT_SECRET, PLAYSPACE_AUTH0_DOMAIN, and PLAYSPACE_AUDIENCE must be set for auto mode.");
    }
    if (!env.OWL_PRACTICE_URL || !env.OWL_PRACTICE_EMAIL || !env.OWL_PRACTICE_PASSWORD) {
      throw new Error("OWL_PRACTICE_URL, OWL_PRACTICE_EMAIL, and OWL_PRACTICE_PASSWORD must be set for auto mode.");
    }

    const playspaceCreds = {
      clientId: env.PLAYSPACE_CLIENT_ID,
      clientSecret: env.PLAYSPACE_CLIENT_SECRET,
      auth0Domain: env.PLAYSPACE_AUTH0_DOMAIN,
      audience: env.PLAYSPACE_AUDIENCE,
      baseUrl: env.PLAYSPACE_BASE_URL,
    };
    const owlCreds = { url: env.OWL_PRACTICE_URL, email: env.OWL_PRACTICE_EMAIL, password: env.OWL_PRACTICE_PASSWORD };

    const data = await fetchPlaySpaceData(playspaceCreds);
    const changes = detectAllChanges(data);
    const summary = await runSync(changes, owlCreds, { dryRun, mode: "automated", useLedger: true });
    console.log(JSON.stringify(summary, null, 2));
    closeDatabase();
  } else {
    // Interactive mode — friendly prompts
    await runInteractiveSync(dryRun);
  }
}

main().catch((err) => {
  console.error("Sync failed:", err.message ?? err);
  closeDatabase();
  process.exit(1);
});
