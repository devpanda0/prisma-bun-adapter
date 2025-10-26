// Test what format Bun.sql returns for Postgres arrays
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/test";

async function testArrayFormat() {
  console.log("Testing Bun.sql array return format...\n");

  const sql = new (Bun as any).sql(DATABASE_URL);

  try {
    // Create test table
    await sql`DROP TABLE IF EXISTS test_array_format`;
    await sql`CREATE TABLE test_array_format (id SERIAL PRIMARY KEY, perms TEXT[])`;

    // Insert array using Postgres literal
    await sql`INSERT INTO test_array_format (perms) VALUES (${'{"READ","WRITE","DELETE"}'})`;

    // Read back
    const result = await sql`SELECT * FROM test_array_format`;

    console.log("Raw result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.length > 0) {
      const row = result[0];
      console.log("\nFirst row perms field:");
      console.log("  Value:", row.perms);
      console.log("  Type:", typeof row.perms);
      console.log("  Is Array?", Array.isArray(row.perms));

      if (typeof row.perms === 'string') {
        console.log("  ❌ PROBLEM: Bun returns array as STRING, not Array!");
        console.log("  We need to parse it!");
      } else if (Array.isArray(row.perms)) {
        console.log("  ✅ Good: Bun returns array as Array");
      }
    }

    await sql`DROP TABLE test_array_format`;
    await sql.close();
  } catch (error) {
    console.error("Error:", error);
  }
}

testArrayFormat();
