import { BunPostgresAdapter } from "../src/index.js";

async function debugBatch() {
  console.log("Testing batch insert...");
  
  const adapter = new BunPostgresAdapter(process.env.DATABASE_URL);
  
  try {
    const driverAdapter = await adapter.connect();
    console.log("Connected successfully");
    
    // Test a simple batch insert
    console.log("Testing simple batch insert...");
    const result = await driverAdapter.executeRaw({
      sql: "INSERT INTO users (email, name, \"createdAt\", \"updatedAt\") VALUES ($1, $2, NOW(), NOW()), ($3, $4, NOW(), NOW())",
      args: ["test1@example.com", "Test User 1", "test2@example.com", "Test User 2"]
    });
    
    console.log("Batch insert result:", result);
    
    // Clean up
    await driverAdapter.executeRaw({
      sql: "DELETE FROM users WHERE email IN ($1, $2)",
      args: ["test1@example.com", "test2@example.com"]
    });
    
    await driverAdapter.dispose();
    console.log("Test completed successfully");
    
  } catch (error) {
    console.error("Test failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

debugBatch();