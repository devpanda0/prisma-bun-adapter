import { prisma } from "./lib/db";

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up existing data
  await prisma.tag.deleteMany();
  await prisma.post.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();

  // Create users with profiles
  const alice = await prisma.user.create({
    data: {
      email: "alice@example.com",
      name: "Alice Johnson",
      profile: {
        create: {
          bio: "Software engineer passionate about TypeScript and databases",
          avatar: "https://example.com/alice.jpg",
        },
      },
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: "bob@example.com",
      name: "Bob Smith",
      profile: {
        create: {
          bio: "Full-stack developer and open source contributor",
          avatar: "https://example.com/bob.jpg",
        },
      },
    },
  });

  // Create tags
  const tags = await Promise.all([
    prisma.tag.create({ data: { name: "typescript" } }),
    prisma.tag.create({ data: { name: "bun" } }),
    prisma.tag.create({ data: { name: "prisma" } }),
    prisma.tag.create({ data: { name: "postgresql" } }),
    prisma.tag.create({ data: { name: "performance" } }),
  ]);

  // Create posts with tags
  await prisma.post.create({
    data: {
      title: "Getting Started with Bun and Prisma",
      content: "Bun is a fast JavaScript runtime that can significantly improve your development experience...",
      published: true,
      authorId: alice.id,
      tags: {
        connect: [
          { id: tags[1].id }, // bun
          { id: tags[2].id }, // prisma
          { id: tags[4].id }, // performance
        ],
      },
    },
  });

  await prisma.post.create({
    data: {
      title: "TypeScript Best Practices in 2024",
      content: "TypeScript continues to evolve with new features and improvements...",
      published: true,
      authorId: alice.id,
      tags: {
        connect: [
          { id: tags[0].id }, // typescript
        ],
      },
    },
  });

  await prisma.post.create({
    data: {
      title: "PostgreSQL Performance Optimization",
      content: "Learn how to optimize your PostgreSQL queries for better performance...",
      published: false,
      authorId: bob.id,
      tags: {
        connect: [
          { id: tags[3].id }, // postgresql
          { id: tags[4].id }, // performance
        ],
      },
    },
  });

  console.log("✅ Database seeded successfully!");
  console.log(`Created ${await prisma.user.count()} users`);
  console.log(`Created ${await prisma.post.count()} posts`);
  console.log(`Created ${await prisma.tag.count()} tags`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });