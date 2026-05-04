# KeeperHub MCP Tests

Comprehensive test suite for the Plugin Indexing and Templates features added to KeeperHub MCP.

## Test Structure

```
tests/
├── database/           # Database repository tests
│   ├── plugin-repository.test.ts
│   └── template-repository.test.ts
├── indexer/            # Plugin loading and parsing tests
│   ├── plugin-loader.test.ts
│   └── plugin-parser.test.ts
├── tools/              # MCP tool handler tests
│   ├── plugins.test.ts
│   ├── templates.test.ts
│   └── documentation.test.ts
├── integration/        # End-to-end integration tests
│   ├── plugin-workflow.test.ts
│   └── template-deployment.test.ts
├── fixtures/           # Test data fixtures
│   ├── sample-plugin.json
│   └── eth-balance-monitor-template.json
└── README.md
```

## Test Categories

### 1. Database Tests (`database/`)

Tests for SQLite database operations including:
- Plugin CRUD operations
- Template CRUD operations
- Full-text search (FTS5) functionality
- Database triggers and constraints
- Performance benchmarks

**Coverage:**
- Plugin repository operations
- Template repository operations
- Search indexing
- Data integrity and constraints

### 2. Indexer Tests (`indexer/`)

Tests for plugin discovery and parsing:
- File system plugin discovery
- Plugin metadata extraction
- Step configuration parsing
- Error handling for malformed plugins

**Coverage:**
- Plugin loading from filesystem
- Plugin schema parsing
- Field type validation
- Edge case handling

### 3. Tool Handler Tests (`tools/`)

Tests for MCP tool implementations:
- `search_plugins` tool
- `get_plugin` tool
- `validate_plugin_config` tool
- `search_templates` tool
- `get_template` tool
- `deploy_template` tool
- `tools_documentation` tool

**Coverage:**
- Plugin discovery and retrieval
- Template search and deployment
- Configuration validation
- Error handling and edge cases

### 4. Integration Tests (`integration/`)

End-to-end workflow tests:
- Complete plugin discovery to validation flow
- Template deployment workflow
- Multi-plugin workflows
- Data flow validation

**Coverage:**
- Plugin discovery → validation → workflow creation
- Template search → customization → deployment
- Cross-plugin interactions
- Performance benchmarks

### 5. Test Fixtures (`fixtures/`)

Sample data for testing:
- `sample-plugin.json` - Web3 plugin structure
- `eth-balance-monitor-template.json` - Complete workflow template

## Running Tests

### All Tests
```bash
pnpm test
```

### Watch Mode
```bash
pnpm test:watch
```

### Coverage Report
```bash
pnpm test:coverage
```

### UI Mode
```bash
pnpm test:ui
```

### Specific Test File
```bash
pnpm test tests/database/plugin-repository.test.ts
```

### Specific Test Suite
```bash
pnpm test --grep "Plugin Repository"
```

## Test Framework

- **Framework:** Vitest
- **Database:** better-sqlite3 (in-memory for tests)
- **Assertions:** Vitest expect API
- **Coverage:** v8 provider

## Writing New Tests

### Test File Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Specific Functionality', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = someFunction(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Best Practices

1. **Use descriptive test names** - Test names should clearly describe what is being tested
2. **Follow AAA pattern** - Arrange, Act, Assert
3. **Test edge cases** - Include tests for error conditions, empty inputs, and boundary values
4. **Keep tests isolated** - Each test should be independent and not rely on other tests
5. **Use in-memory database** - All database tests use `:memory:` for speed and isolation
6. **Mock external dependencies** - Use Vitest's `vi.mock()` for external services
7. **Test performance** - Include performance expectations where relevant

### Database Test Pattern

```typescript
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Database Feature', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create schema
    db.exec(`CREATE TABLE ...`);
  });

  afterEach(() => {
    db.close();
  });

  it('should perform operation', () => {
    // Test logic
  });
});
```

## Coverage Goals

Target coverage levels:
- **Overall:** >80%
- **Database operations:** >90%
- **Tool handlers:** >85%
- **Integration flows:** >75%

Current coverage can be viewed by running `pnpm test:coverage`.

## Test Data

### Fixture Files

Fixtures provide realistic test data:
- **sample-plugin.json** - Complete Web3 plugin with credentials and steps
- **eth-balance-monitor-template.json** - Full workflow template with setup guide

Load fixtures in tests:
```typescript
import samplePlugin from '../fixtures/sample-plugin.json';

it('should parse plugin', () => {
  expect(samplePlugin.plugin.type).toBe('web3');
});
```

## Debugging Tests

### Run Single Test
```bash
pnpm test -t "should validate ETH address"
```

### Enable Debug Logging
```bash
DEBUG=* pnpm test
```

### Use Vitest UI
```bash
pnpm test:ui
# Opens browser interface at http://localhost:51204/__vitest__/
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-push hooks (if configured)

Test failures block merges to ensure code quality.

## Performance Benchmarks

Key performance expectations:
- **FTS5 search:** <20ms
- **Database lookup:** <10ms
- **Validation:** <50ms
- **Template deployment:** <2s
- **Full workflow:** <100ms

Performance tests are included in integration test suites.

## Contributing

When adding new features:
1. Write tests first (TDD approach recommended)
2. Ensure all tests pass
3. Maintain or improve coverage
4. Add integration tests for user-facing features
5. Update this README if adding new test categories

## Troubleshooting

### "better-sqlite3 not found"
```bash
pnpm install better-sqlite3 --save-dev
```

### "Database is locked"
Ensure `db.close()` is called in `afterEach()` blocks.

### "FTS5 not available"
better-sqlite3 includes FTS5 by default. Verify installation:
```bash
pnpm rebuild better-sqlite3
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [KeeperHub MCP Specification](/specs/mcp-server/plugin-indexing-templates.md)
