import { BunSQLiteAdapter } from "../src/index.js";

/**
 * Quick Comparison Demo
 * Shows Bun SQLite adapter performance vs simulated traditional approach
 * This works without any database setup and demonstrates the comparison concept
 */

interface ComparisonResult {
  name: string;
  type: "bun" | "traditional";
  operations: number;
  totalTime: number;
  avgTime: number;
  opsPerSecond: number;
}

// Simulate a traditional SQLite adapter for comparison
class TraditionalSQLiteSimulator {
  private queryCount = 0;
  
  async query(sql: string, params: any[] = []): Promise<any[]> {
    // Simulate traditional driver overhead
    this.queryCount++;
    
    // Add some realistic delay to simulate traditional driver overhead
    await new Promise(resolve => setTimeout(resolve, 0.05 + Math.random() * 0.1));
    
    if (sql.includes("SELECT 1")) {
      return [{ "1": 1 }];
    }
    
    if (sql.includes("SELECT ? as test")) {
      return [{ test: params[0] }];
    }
    
    return [];
  }
  
  close() {
    this.queryCount = 0;
  }
}

async function benchmarkBunAdapter(operations: number): Promise<ComparisonResult> {
  const adapter = new BunSQLiteAdapter(":memory:");
  const driverAdapter = await adapter.connect();
  
  const startTime = performance.now();
  
  // Run operations
  const promises = [];
  for (let i = 0; i < operations; i++) {
    promises.push(driverAdapter.queryRaw({ sql: "SELECT ? as test", args: [i] }));
  }
  
  await Promise.all(promises);
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;
  
  await driverAdapter.dispose();
  
  return {
    name: "Bun SQLite Adapter",
    type: "bun",
    operations,
    totalTime,
    avgTime: totalTime / operations,
    opsPerSecond: (operations / totalTime) * 1000
  };
}

async function benchmarkTraditionalAdapter(operations: number): Promise<ComparisonResult> {
  const adapter = new TraditionalSQLiteSimulator();
  
  const startTime = performance.now();
  
  // Run operations
  const promises = [];
  for (let i = 0; i < operations; i++) {
    promises.push(adapter.query("SELECT ? as test", [i]));
  }
  
  await Promise.all(promises);
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;
  
  adapter.close();
  
  return {
    name: "Traditional SQLite (Simulated)",
    type: "traditional",
    operations,
    totalTime,
    avgTime: totalTime / operations,
    opsPerSecond: (operations / totalTime) * 1000
  };
}

async function main(): Promise<void> {
  console.log("🚀 Quick Adapter Comparison Demo");
  console.log("================================\n");
  
  console.log("This demo shows the performance difference between:");
  console.log("🚀 Bun's native SQLite adapter");
  console.log("🔧 Traditional Node.js SQLite drivers (simulated)\n");
  
  const operations = 500;
  console.log(`📊 Running ${operations} operations with each adapter...\n`);
  
  // Run benchmarks
  console.log("⏳ Testing Bun adapter...");
  const bunResult = await benchmarkBunAdapter(operations);
  
  console.log("⏳ Testing traditional adapter...");
  const traditionalResult = await benchmarkTraditionalAdapter(operations);
  
  // Display results
  console.log("\n📈 Results:");
  console.log("===========");
  
  [bunResult, traditionalResult].forEach(result => {
    const icon = result.type === "bun" ? "🚀" : "🔧";
    console.log(`\n${icon} ${result.name}:`);
    console.log(`   Total time: ${result.totalTime.toFixed(2)}ms`);
    console.log(`   Avg per op: ${result.avgTime.toFixed(3)}ms`);
    console.log(`   Ops/second: ${result.opsPerSecond.toFixed(0)}`);
  });
  
  // Comparison
  const speedup = bunResult.opsPerSecond / traditionalResult.opsPerSecond;
  const timeImprovement = traditionalResult.avgTime / bunResult.avgTime;
  
  console.log("\n⚡ Performance Comparison:");
  console.log("=========================");
  
  if (speedup > 1) {
    console.log(`📈 Bun is ${speedup.toFixed(2)}x faster (${timeImprovement.toFixed(2)}x time improvement)`);
  } else {
    console.log(`📉 Traditional is ${(1/speedup).toFixed(2)}x faster`);
  }
  
  console.log(`\n🚀 Bun: ${bunResult.opsPerSecond.toFixed(0)} ops/sec`);
  console.log(`🔧 Traditional: ${traditionalResult.opsPerSecond.toFixed(0)} ops/sec`);
  
  console.log("\n🎯 Why Bun Adapters Are Faster:");
  console.log("==============================");
  console.log("✨ Native runtime integration");
  console.log("⚡ Optimized memory management");
  console.log("🔄 Template string caching");
  console.log("📦 Zero external dependencies");
  console.log("🛡️  Type-safe Prisma integration");
  
  console.log("\n💡 For real database comparisons:");
  console.log("   bun run setup:dbs     # Setup PostgreSQL & MySQL");
  console.log("   bun run test:performance  # Full performance test");
}

if (import.meta.main) {
  main().catch(console.error);
}

export { main as runQuickDemo };