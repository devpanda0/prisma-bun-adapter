import { BunPostgresAdapter } from "../src/index.js";

async function debugLargeBatch() {
  console.log("Testing large batch insert parameter handling...");
  
  const adapter = new BunPostgresAdapter(process.env.DATABASE_URL);
  
  try {
    const driverAdapter = await adapter.connect();
    console.log("Connected successfully");
    
    // Test with increasing parameter counts to find the issue
    const testCases = [2, 4, 10, 20, 50];
    
    for (const paramCount of testCases) {
      console.log(`\nTesting with ${paramCount} parameters...`);
      
      // Generate SQL with many parameters
      const values = [];
      const params = [];
      
      for (let i = 0; i < paramCount / 2; i++) {
        values.push(`($${i * 2 + 1}, $${i * 2 + 2}, NOW(), NOW())`);
        params.push(`test-${i}@example.com`, `Test User ${i}`);
      }
      
      const sql = `INSERT INTO users (email, name, "createdAt", "updatedAt") VALUES ${values.join(', ')}`;
      
      console.log(`SQL: ${sql.substring(0, 100)}...`);
      console.log(`Params: [${params.slice(0, 4).join(', ')}...]`);
      
      try {
        const result = await driverAdapter.executeRaw({
          sql: sql,
          args: params
        });
        
        console.log(`✅ Success: Inserted ${result} rows`);
        
        // Clean up
        const emails = params.filter((_, i) => i % 2 === 0);
        const placeholders = emails.map((_, i) => `$${i + 1}`).join(', ');
        await driverAdapter.executeRaw({
          sql: `DELETE FROM users WHERE email IN (${placeholders})`,
          args: emails
        });
        
      } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
        break;
      }
    }
    
    await driverAdapter.dispose();
    console.log("\nTest completed");
    
  } catch (error) {
    console.error("Test failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

debugLargeBatch();