/**
 * Quick test: verify PlaySpace API credentials work
 * Run: npx tsx scripts/test-playspace.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const CLIENT_ID = process.env.PLAYSPACE_CLIENT_ID?.trim().replace(/^"|"$/g, "") ?? "";
const CLIENT_SECRET = process.env.PLAYSPACE_CLIENT_SECRET?.trim().replace(/^"|"$/g, "") ?? "";
const AUTH0_DOMAIN = process.env.PLAYSPACE_AUTH0_DOMAIN?.trim().replace(/^"|"$/g, "") ?? "";
const AUDIENCE = process.env.PLAYSPACE_AUDIENCE?.trim().replace(/^"|"$/g, "") ?? "";
const BASE_URL = process.env.PLAYSPACE_BASE_URL?.trim().replace(/^"|"$/g, "") ?? "";

async function main() {
  console.log("🔑 Testing PlaySpace API connection\n");
  console.log(`Auth0 Domain: ${AUTH0_DOMAIN}`);
  console.log(`Client ID:    ${CLIENT_ID}`);
  console.log(`Audience:     ${AUDIENCE}`);
  console.log(`Base URL:     ${BASE_URL}\n`);

  // Step 1: Get OAuth token
  console.log("1️⃣  Requesting OAuth token...");
  const tokenUrl = `https://${AUTH0_DOMAIN}/oauth/token`;
  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      audience: AUDIENCE,
    }),
  });

  if (!tokenRes.ok) {
    const error = await tokenRes.text();
    console.error(`❌ Token request failed (${tokenRes.status}): ${error}`);
    return;
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  console.log(`✅ Got token (expires in ${tokenData.expires_in}s)\n`);

  // Step 2: Fetch practitioners
  console.log("2️⃣  Fetching practitioners...");
  const apiBase = `${BASE_URL}/api/v1/partner`;
  const practRes = await fetch(`${apiBase}/practitioners?limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!practRes.ok) {
    const error = await practRes.text();
    console.error(`❌ Practitioners request failed (${practRes.status}): ${error}`);
    return;
  }

  const practData = await practRes.json();
  const practitioners = practData.data || [];
  console.log(`✅ Found ${practitioners.length} practitioner(s)`);
  for (const p of practitioners) {
    console.log(`   - ${p.firstName} ${p.lastName} (id: ${p.id})`);
  }

  if (practitioners.length === 0) {
    console.log("\n⚠️  No practitioners found — cannot fetch clients without a practitioner ID");
    return;
  }

  // Step 3: Fetch clients for first practitioner
  const practId = practitioners[0].id;
  console.log(`\n3️⃣  Fetching clients for practitioner ${practId}...`);
  const clientsRes = await fetch(`${apiBase}/clients?practitionerId=${practId}&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!clientsRes.ok) {
    const error = await clientsRes.text();
    console.error(`❌ Clients request failed (${clientsRes.status}): ${error}`);
    return;
  }

  const clientsData = await clientsRes.json();
  const clients = clientsData.data || [];
  console.log(`✅ Found ${clients.length} client(s)`);
  for (const c of clients) {
    console.log(`   - ${c.firstName} ${c.lastName} (id: ${c.id}, email: ${c.email || "none"})`);
  }

  console.log("\n🎉 PlaySpace API connection is working!");
}

main().catch((err) => {
  console.error("❌ Error:", err.message || err);
});
