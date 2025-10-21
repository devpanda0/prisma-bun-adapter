# Prisma Bun PostgreSQL Adapter Test App

This is a test application to demonstrate and verify the functionality of the Prisma Bun PostgreSQL adapter.

## Prerequisites

1. **Bun**: Install Bun runtime (https://bun.sh)
2. **PostgreSQL Database**: Either have PostgreSQL running locally or use Docker

## Quick Setup (Recommended)

### Option 1: Using Docker (Easiest)

1. **Start PostgreSQL with Docker**:
   ```bash
   cd test-app
   bun install
   bun run db:up
   ```

2. **Run the automated setup**:
   ```bash
   bun run setup
   ```

That's it! The setup script will handle everything else.

### Option 2: Manual Setup

1. **Install dependencies**:
   ```bash
   cd test-app
   bun install
   ```

2. **Configure database connection**:
   Update the `DATABASE_URL` in `.env` file with your PostgreSQL connection string:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
   ```

3. **Run database migrations**:
   ```bash
   bun run db:migrate
   ```

4. **Generate Prisma client**:
   ```bash
   bun run db:generate
   ```

5. **Seed the database**:
   ```bash
   bun run db:seed
   ```

## Running Tests

Run the test application:
```bash
bun run dev
```

This will execute various tests including:
- ✅ Basic CRUD operations
- ✅ Complex queries with relations
- ✅ Raw SQL queries
- ✅ Transaction support
- ✅ Performance testing with concurrent queries

## What the Tests Cover

### Basic Operations
- Record counting
- Finding users with profiles and post counts
- Querying published posts with authors and tags
- Raw SQL queries

### Transactions
- Atomic operations creating user, profile, and post
- Rollback on errors
- Cleanup operations

### Performance
- Concurrent query execution
- Complex nested queries with relations

## Database Schema

The test uses a simple blog-like schema:
- **Users**: Basic user information
- **Profiles**: Extended user profiles
- **Posts**: Blog posts with authors
- **Tags**: Post categorization with many-to-many relations

## Expected Output

When running successfully, you should see output similar to:
```
🚀 Starting Prisma Bun PostgreSQL Adapter Test

🧪 Testing basic CRUD operations...

📊 Record counts:
  Users: 2
  Posts: 3
  Tags: 5

👥 Users with profiles:
  Alice Johnson (alice@example.com)
    Bio: Software engineer passionate about TypeScript and databases
    Posts: 2
  Bob Smith (bob@example.com)
    Bio: Full-stack developer and open source contributor
    Posts: 1

📝 Published posts:
  "TypeScript Best Practices in 2024" by Alice Johnson
    Tags: typescript
  "Getting Started with Bun and Prisma" by Alice Johnson
    Tags: bun, prisma, performance

💳 Testing transactions...
✅ Transaction successful!

⚡ Testing performance...
✅ Executed 10 concurrent complex queries in XX.XXms

🎉 All tests completed successfully!
```

## Troubleshooting

1. **Connection Issues**: Verify your DATABASE_URL is correct
2. **Migration Errors**: Make sure PostgreSQL is running and accessible
3. **Permission Issues**: Ensure your database user has CREATE/DROP privileges

## Cleanup

To reset the database:
```bash
bun run db:reset
```