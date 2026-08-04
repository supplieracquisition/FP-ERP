import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    console.log("Checking sequence names...\n");

    const fabricDetailsSeq = await client`
      SELECT pg_get_serial_sequence('fabric_details', 'id') as seq_name
    `;
    console.log(`fabric_details id sequence: ${fabricDetailsSeq[0].seq_name}`);

    const fabricColorsSeq = await client`
      SELECT pg_get_serial_sequence('fabric_colors', 'id') as seq_name
    `;
    console.log(`fabric_colors id sequence: ${fabricColorsSeq[0].seq_name}`);

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
