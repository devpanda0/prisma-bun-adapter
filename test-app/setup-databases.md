# Database Setup for Multi-Adapter Testing

This guide helps you set up PostgreSQL and MySQL databases for testing the multi-adapter functionality.

## Quick Setup with Docker

### PostgreSQL
```bash
# Start PostgreSQL container
docker run --name test-postgres \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test_db \
  -p 5432:5432 \
  -d postgres:15

# Set environment variable
export TEST_POSTGRES_URL="postgresql://test:test@localhost:5432/test_db"
```

### MySQL
```bash
# Start MySQL container
docker run --name test-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_USER=test \
  -e MYSQL_PASSWORD=test \
  -e MYSQL_DATABASE=test_db \
  -p 3306:3306 \
  -d mysql:8.0

# Set environment variable
export TEST_MYSQL_URL="mysql://test:test@localhost:3306/test_db"
```

### SQLite
SQLite works out of the box with in-memory databases - no setup required!

## Running Tests

Once you have the databases running:

```bash
# Run the multi-adapter comparison
bun run test-app/multi-adapter-comparison.ts

# Or run unit tests
bun test
```

## Environment Variables

Set these environment variables to enable testing:

- `TEST_POSTGRES_URL`: PostgreSQL connection string
- `TEST_MYSQL_URL`: MySQL connection string
- `TEST_SQLITE_FILE`: SQLite file path (optional, defaults to `:memory:`)

## Cleanup

```bash
# Stop and remove containers
docker stop test-postgres test-mysql
docker rm test-postgres test-mysql
```

## Alternative Setup Methods

### Using Homebrew (macOS)

#### PostgreSQL
```bash
brew install postgresql
brew services start postgresql
createdb test_db
export TEST_POSTGRES_URL="postgresql://$(whoami)@localhost:5432/test_db"
```

#### MySQL
```bash
brew install mysql
brew services start mysql
mysql -u root -e "CREATE DATABASE test_db; CREATE USER 'test'@'localhost' IDENTIFIED BY 'test'; GRANT ALL ON test_db.* TO 'test'@'localhost';"
export TEST_MYSQL_URL="mysql://test:test@localhost:3306/test_db"
```

### Using Package Managers (Linux)

#### Ubuntu/Debian
```bash
# PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo -u postgres createdb test_db
sudo -u postgres psql -c "CREATE USER test WITH PASSWORD 'test';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE test_db TO test;"

# MySQL
sudo apt install mysql-server
sudo mysql -e "CREATE DATABASE test_db; CREATE USER 'test'@'localhost' IDENTIFIED BY 'test'; GRANT ALL ON test_db.* TO 'test'@'localhost';"
```

## Troubleshooting

### Connection Issues
- Ensure databases are running: `docker ps` or check service status
- Verify ports are not in use: `lsof -i :5432` (PostgreSQL) or `lsof -i :3306` (MySQL)
- Check firewall settings if using remote databases

### Permission Issues
- Ensure the test user has proper permissions
- For PostgreSQL: `GRANT ALL PRIVILEGES ON DATABASE test_db TO test;`
- For MySQL: `GRANT ALL ON test_db.* TO 'test'@'localhost';`

### Docker Issues
- Ensure Docker is running: `docker info`
- Check container logs: `docker logs test-postgres` or `docker logs test-mysql`
- Try pulling latest images: `docker pull postgres:15` or `docker pull mysql:8.0`