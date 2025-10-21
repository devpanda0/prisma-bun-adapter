import { prisma } from "./lib/db";

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

class AdapterTester {
  private results: TestResult[] = [];

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const start = performance.now();
    try {
      await testFn();
      const duration = performance.now() - start;
      this.results.push({ name, success: true, duration });
      console.log(`✅ ${name} (${duration.toFixed(2)}ms)`);
    } catch (error) {
      const duration = performance.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, success: false, duration, error: errorMessage });
      console.log(`❌ ${name} (${duration.toFixed(2)}ms): ${errorMessage}`);
    }
  }

  async testBasicQueries() {
    console.log("\n📋 Testing Basic Queries");
    console.log("=" .repeat(40));

    await this.runTest("Find all users", async () => {
      const users = await prisma.user.findMany();
      if (users.length === 0) throw new Error("No users found");
    });

    await this.runTest("Find user by email", async () => {
      const user = await prisma.user.findUnique({
        where: { email: "alice@example.com" }
      });
      if (!user) throw new Error("User not found");
    });

    await this.runTest("Count records", async () => {
      const count = await prisma.user.count();
      if (count === 0) throw new Error("No users to count");
    });

    await this.runTest("Find with relations", async () => {
      const users = await prisma.user.findMany({
        include: {
          profile: true,
          posts: {
            include: {
              tags: true
            }
          }
        }
      });
      if (users.length === 0) throw new Error("No users with relations found");
    });
  }

  async testCrudOperations() {
    console.log("\n🔄 Testing CRUD Operations");
    console.log("=" .repeat(40));

    let testUserId: number;

    await this.runTest("Create user", async () => {
      const user = await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User"
        }
      });
      testUserId = user.id;
    });

    await this.runTest("Update user", async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: { name: "Updated Test User" }
      });
    });

    await this.runTest("Create nested relations", async () => {
      await prisma.user.update({
        where: { id: testUserId },
        data: {
          profile: {
            create: {
              bio: "Test user profile"
            }
          },
          posts: {
            create: {
              title: "Test Post",
              content: "This is a test post"
            }
          }
        }
      });
    });

    await this.runTest("Delete user (cascade)", async () => {
      await prisma.user.delete({
        where: { id: testUserId }
      });
    });
  }

  async testRawQueries() {
    console.log("\n🔍 Testing Raw Queries");
    console.log("=" .repeat(40));

    await this.runTest("Raw SELECT query", async () => {
      const result = await prisma.$queryRaw`
        SELECT COUNT(*) as user_count FROM users
      `;
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error("Raw query returned no results");
      }
    });

    await this.runTest("Raw query with parameters", async () => {
      const email = "alice@example.com";
      const result = await prisma.$queryRaw`
        SELECT * FROM users WHERE email = ${email}
      `;
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error("Parameterized query returned no results");
      }
    });

    await this.runTest("Execute raw SQL", async () => {
      const result = await prisma.$executeRaw`
        UPDATE users SET "updatedAt" = NOW() WHERE email = 'alice@example.com'
      `;
      if (result === 0) {
        throw new Error("Execute raw affected 0 rows");
      }
    });
  }

  async testTransactions() {
    console.log("\n💳 Testing Transactions");
    console.log("=" .repeat(40));

    await this.runTest("Simple transaction", async () => {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: "tx-test@example.com",
            name: "Transaction Test"
          }
        });

        await tx.profile.create({
          data: {
            bio: "Created in transaction",
            userId: user.id
          }
        });

        // Clean up
        await tx.user.delete({ where: { id: user.id } });
      });
    });

    await this.runTest("Transaction rollback", async () => {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              email: "rollback-test@example.com",
              name: "Rollback Test"
            }
          });

          // This should cause a rollback
          throw new Error("Intentional error for rollback test");
        });
      } catch (error) {
        // Verify the user was not created
        const user = await prisma.user.findUnique({
          where: { email: "rollback-test@example.com" }
        });
        if (user) {
          throw new Error("Transaction did not rollback properly");
        }
      }
    });

    await this.runTest("Interactive transaction", async () => {
      await prisma.$transaction(async (tx) => {
        const userCount = await tx.user.count();
        
        const newUser = await tx.user.create({
          data: {
            email: "interactive-tx@example.com",
            name: "Interactive TX"
          }
        });

        const newCount = await tx.user.count();
        if (newCount !== userCount + 1) {
          throw new Error("Interactive transaction count mismatch");
        }

        // Clean up
        await tx.user.delete({ where: { id: newUser.id } });
      });
    });
  }

  async testPerformance() {
    console.log("\n⚡ Testing Performance");
    console.log("=" .repeat(40));

    await this.runTest("Concurrent queries (10x)", async () => {
      const promises = Array.from({ length: 10 }, () =>
        prisma.user.findMany({
          include: {
            posts: {
              include: {
                tags: true
              }
            }
          }
        })
      );

      const results = await Promise.all(promises);
      if (results.some(result => result.length === 0)) {
        throw new Error("Some concurrent queries returned no results");
      }
    });

    await this.runTest("Large batch operation", async () => {
      const batchSize = 100;
      const users = Array.from({ length: batchSize }, (_, i) => ({
        email: `batch-${i}@example.com`,
        name: `Batch User ${i}`
      }));

      // Create in batches
      await prisma.user.createMany({
        data: users
      });

      // Verify count
      const count = await prisma.user.count({
        where: {
          email: {
            startsWith: "batch-"
          }
        }
      });

      if (count !== batchSize) {
        throw new Error(`Expected ${batchSize} users, got ${count}`);
      }

      // Clean up
      await prisma.user.deleteMany({
        where: {
          email: {
            startsWith: "batch-"
          }
        }
      });
    });

    await this.runTest("Complex aggregation", async () => {
      const result = await prisma.user.aggregate({
        _count: {
          id: true
        },
        _max: {
          createdAt: true
        },
        _min: {
          createdAt: true
        }
      });

      if (!result._count.id || result._count.id === 0) {
        throw new Error("Aggregation returned no results");
      }
    });
  }

  async testEdgeCases() {
    console.log("\n🎯 Testing Edge Cases");
    console.log("=" .repeat(40));

    await this.runTest("Empty result handling", async () => {
      const result = await prisma.user.findMany({
        where: {
          email: "nonexistent@example.com"
        }
      });

      if (result.length !== 0) {
        throw new Error("Expected empty result");
      }
    });

    await this.runTest("Large text field", async () => {
      const largeText = "A".repeat(10000);
      
      const user = await prisma.user.create({
        data: {
          email: "large-text@example.com",
          name: "Large Text User",
          profile: {
            create: {
              bio: largeText
            }
          }
        }
      });

      const retrieved = await prisma.profile.findUnique({
        where: { userId: user.id }
      });

      if (retrieved?.bio !== largeText) {
        throw new Error("Large text field not handled correctly");
      }

      // Clean up
      await prisma.user.delete({ where: { id: user.id } });
    });

    await this.runTest("Unicode handling", async () => {
      const unicodeText = "Hello 世界 🌍 Здравствуй мир";
      
      const user = await prisma.user.create({
        data: {
          email: "unicode@example.com",
          name: unicodeText
        }
      });

      const retrieved = await prisma.user.findUnique({
        where: { id: user.id }
      });

      if (retrieved?.name !== unicodeText) {
        throw new Error("Unicode text not handled correctly");
      }

      // Clean up
      await prisma.user.delete({ where: { id: user.id } });
    });
  }

  printSummary() {
    console.log("\n📊 Test Summary");
    console.log("=" .repeat(50));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : '✅'}`);
    console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`Average Duration: ${(totalDuration / totalTests).toFixed(2)}ms`);

    if (failedTests > 0) {
      console.log("\n❌ Failed Tests:");
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
    }

    console.log(`\n${failedTests === 0 ? '🎉' : '⚠️'} Test Suite ${failedTests === 0 ? 'PASSED' : 'FAILED'}`);
  }

  async runAllTests() {
    console.log("🧪 Comprehensive Prisma Bun PostgreSQL Adapter Test Suite");
    console.log("=" .repeat(60));

    await this.testBasicQueries();
    await this.testCrudOperations();
    await this.testRawQueries();
    await this.testTransactions();
    await this.testPerformance();
    await this.testEdgeCases();

    this.printSummary();

    return this.results.every(r => r.success);
  }
}

async function main() {
  const tester = new AdapterTester();
  
  try {
    const success = await tester.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();