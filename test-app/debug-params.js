import { BunPostgresAdapter } from "../src/index.js";

async function debugParams() {
  console.log("Testing parameter handling...");
  
  const adapter = new BunPostgresAdapter(process.env.DATABASE_URL);
  
  try {
    const driverAdapter = await adapter.connect();
    console.log("Connected successfully");
    
    // Test parameterized query
    console.log("Testing parameterized query...");
    const result = await driverAdapter.queryRaw({
      sql: "SELECT * FROM users WHERE email = $1",
      args: ["alice@example.com"]
    });
    
    console.log("Parameterized query result:", result);
    
    await driverAdapter.dispose();
    console.log("Test completed successfully");
    
  } catch (error) {
    console.error("Test failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

debugParams();