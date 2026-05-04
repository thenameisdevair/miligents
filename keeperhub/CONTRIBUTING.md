# Contributing to KeeperHub MCP Server

Thank you for your interest in contributing to the KeeperHub MCP Server!

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/KeeperHub/keeperhub-mcp.git
cd keeperhub-mcp
```

2. Install dependencies:
```bash
pnpm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
# Edit .env and add your KEEPERHUB_API_KEY
```

4. Run in development mode:
```bash
pnpm dev
```

## Project Structure

```
keeperhub-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/                # MCP tool implementations
│   │   ├── workflows.ts      # Workflow CRUD operations
│   │   ├── executions.ts     # Execution management
│   │   └── generate.ts       # AI workflow generation
│   ├── resources/            # MCP resource handlers
│   │   └── workflows.ts      # Workflow resources
│   ├── client/               # API client
│   │   └── keeperhub.ts      # KeeperHub HTTP client
│   └── types/                # TypeScript types
│       └── index.ts          # Shared type definitions
```

## Coding Standards

### TypeScript

- Use strict TypeScript mode
- Define proper types for all function parameters and return values
- Use `const` for immutable values, `let` for mutable
- Prefer interfaces for object shapes, types for unions/intersections

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add semicolons at the end of statements
- Use trailing commas in multi-line objects/arrays

### Naming Conventions

- Files: kebab-case (e.g., `keeperhub-client.ts`)
- Classes: PascalCase (e.g., `KeeperHubClient`)
- Functions: camelCase (e.g., `handleListWorkflows`)
- Constants: UPPER_SNAKE_CASE (e.g., `API_KEY`)
- Types/Interfaces: PascalCase (e.g., `Workflow`, `WorkflowExecution`)

## Adding New Tools

To add a new MCP tool:

1. Define the Zod schema in the appropriate file in `src/tools/`
2. Implement the handler function
3. Export the schema and handler
4. Register the tool in `src/index.ts`:
   - Add to `ListToolsRequestSchema` handler
   - Add case in `CallToolRequestSchema` handler

Example:

```typescript
// src/tools/my-feature.ts
import { z } from 'zod';
import type { KeeperHubClient } from '../client/keeperhub.js';

export const myToolSchema = z.object({
  param: z.string().describe('Description of parameter'),
});

export async function handleMyTool(
  client: KeeperHubClient,
  args: z.infer<typeof myToolSchema>
) {
  const result = await client.myMethod(args.param);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
```

## Adding New Resources

To add a new MCP resource:

1. Create handler in `src/resources/`
2. Export from `src/resources/index.ts`
3. Register in `src/index.ts`:
   - Add to `ListResourcesRequestSchema` handler
   - Add URI pattern match in `ReadResourceRequestSchema` handler

## Testing

Run type checking before committing:

```bash
pnpm type-check
```

Build to ensure compilation:

```bash
pnpm build
```

Test with a local MCP client:

```bash
# In terminal 1
pnpm dev

# In terminal 2, use an MCP client to connect
```

## Building Docker Image

```bash
docker build -t keeperhub-mcp .
docker run -i --rm -e KEEPERHUB_API_KEY=your_key keeperhub-mcp
```

## Commit Messages

Follow conventional commits format:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Maintenance tasks

Example:
```
feat: add workflow template listing tool

Adds list_workflow_templates tool to retrieve available workflow
templates from the KeeperHub API.
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run type checking and build
5. Commit with a descriptive message
6. Push to your fork
7. Open a Pull Request

## API Client Updates

When updating the KeeperHub API client:

1. Update types in `src/types/index.ts`
2. Add methods to `src/client/keeperhub.ts`
3. Follow the existing pattern for error handling
4. Use proper TypeScript types for all parameters and return values

## Questions?

For questions or discussions:
- Open an issue on GitHub
- Join the KeeperHub Discord
- Email: support@keeperhub.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
