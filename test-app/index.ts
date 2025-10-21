import { prisma } from "./lib/db";

async function testBasicOperations() {
  console.log("🧪 Testing basic CRUD operations...\n");

  // Test 1: Count records
  console.log("📊 Record counts:");
  const userCount = await prisma.user.count();
  const postCount = await prisma.post.count();
  const tagCount = await prisma.tag.count();
  console.log(`  Users: ${userCount}`);
  console.log(`  Posts: ${postCount}`);
  console.log(`  Tags: ${tagCount}\n`);

  // Test 2: Find users with profiles
  console.log("👥 Users with profiles:");
  const usersWithProfiles = await prisma.user.findMany({
    include: {
      profile: true,
      _count: {
        select: {
          posts: true,
        },
      },
    },
  });

  usersWithProfiles.forEach((user) => {
    console.log(`  ${user.name} (${user.email})`);
    console.log(`    Bio: ${user.profile?.bio || "No bio"}`);
    console.log(`    Posts: ${user._count.posts}`);
  });
  console.log();

  // Test 3: Find published posts with authors and tags
  console.log("📝 Published posts:");
  const publishedPosts = await prisma.post.findMany({
    where: { published: true },
    include: {
      author: {
        select: {
          name: true,
          email: true,
        },
      },
      tags: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  publishedPosts.forEach((post) => {
    console.log(`  "${post.title}" by ${post.author.name}`);
    console.log(`    Tags: ${post.tags.map((tag) => tag.name).join(", ")}`);
  });
  console.log();

  // Test 4: Raw query
  console.log("🔍 Raw query - Posts per user:");
  const postsPerUser = await prisma.$queryRaw`
    SELECT 
      u.name,
      u.email,
      COUNT(p.id) as post_count
    FROM users u
    LEFT JOIN posts p ON u.id = p."authorId"
    GROUP BY u.id, u.name, u.email
    ORDER BY post_count DESC
  `;
  
  console.log(postsPerUser);
  console.log();
}

async function testTransactions() {
  console.log("💳 Testing transactions...\n");

  try {
    // Test transaction: Create user with profile and post atomically
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: "charlie@example.com",
          name: "Charlie Brown",
        },
      });

      const profile = await tx.profile.create({
        data: {
          bio: "New user created in transaction",
          userId: newUser.id,
        },
      });

      const post = await tx.post.create({
        data: {
          title: "My First Post",
          content: "This post was created in a transaction!",
          authorId: newUser.id,
        },
      });

      return { user: newUser, profile, post };
    });

    console.log("✅ Transaction successful!");
    console.log(`  Created user: ${result.user.name}`);
    console.log(`  Created profile with bio: ${result.profile.bio}`);
    console.log(`  Created post: ${result.post.title}\n`);

    // Clean up the test user
    await prisma.user.delete({
      where: { id: result.user.id },
    });
    console.log("🧹 Cleaned up test user\n");

  } catch (error) {
    console.error("❌ Transaction failed:", error);
  }
}

async function testPerformance() {
  console.log("⚡ Testing performance...\n");

  // Test concurrent queries
  const start = performance.now();
  
  const promises = Array.from({ length: 10 }, (_, i) => 
    prisma.user.findMany({
      include: {
        posts: {
          include: {
            tags: true,
          },
        },
        profile: true,
      },
    })
  );

  await Promise.all(promises);
  
  const end = performance.now();
  console.log(`✅ Executed 10 concurrent complex queries in ${(end - start).toFixed(2)}ms\n`);
}

async function main() {
  console.log("🚀 Starting Prisma Bun PostgreSQL Adapter Test\n");
  console.log("=" .repeat(50));

  try {
    await testBasicOperations();
    await testTransactions();
    await testPerformance();

    console.log("🎉 All tests completed successfully!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the tests
main();