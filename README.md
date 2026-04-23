# lambda-api-plugin

A toolkit for building AWS API Gateway + Lambda server APIs. Provides end-to-end skill coverage from Lambda handler development and test writing to code quality enforcement.

## Installation

### Claude Code

Clone the repository and load it with `--plugin-dir`:

```bash
git clone https://github.com/hu-shukang/lambda-api-plugin
claude --plugin-dir ./lambda-api-plugin
```

To load it permanently across sessions, add it to your Claude Code settings:

```json
{
  "pluginDirectories": ["/path/to/lambda-api-plugin"]
}
```

### Cowork

Download the latest `.plugin` file from the [Releases](https://github.com/hu-shukang/lambda-api-plugin/releases) page and install it via the Cowork plugin settings.

## Commands

### /generate-lambda

Generates a new Lambda handler interactively. Run as `/generate-lambda [resource] [action]`.

Claude will ask for the HTTP method, path parameters, whether the handler needs DB access, and any other details needed before generating the files. Creates:

- `src/functions/<resource>/<action>/index.ts` — Middy handler with business logic
- `src/functions/<resource>/<action>/schema.ts` — Zod event schema + OpenAPI route registration
- Adds the schema import to `scripts/generate-openapi.ts`

**Usage**: `/generate-lambda`, `/generate-lambda user`, `/generate-lambda user get`

## Agents

Agents run as subagents and execute multi-step tasks autonomously.

### setup-project

Initializes a new project from scratch. Asks for the package manager, database type, and project name, then sets up the full project structure in one run: Lambda utilities, test infrastructure, and Biome config.

**Triggers**: "setup project", "initialize project", "init lambda project", "scaffold a new API".

### run-tests

Runs the Vitest test suite. Detects the package manager automatically and supports running unit tests only, integration tests only, the full suite, or with coverage reporting. Reports results with a concise pass/fail summary.

**Triggers**: "run tests", "run unit tests", "run integration tests", "check test coverage", "did the tests pass".

### write-tests

Reads a Lambda handler's source code, infers all testable branches, and writes both unit tests (DB mocked) and integration tests (real Testcontainers DB). Correctly orders table cleanup for FK constraints and generates seed data from the Drizzle schema.

**Triggers**: "write tests for `<handler>`", "add tests", "generate tests", "add test coverage for `<resource>`".

### biome-check

Lints and formats code using Biome. Supports check-only mode, applying safe fixes, format-only, and scoped runs against a specific file or directory. After fixing, runs a final check pass to confirm the codebase is clean.

**Triggers**: "run biome", "lint the code", "fix lint errors", "format the code", "biome check".

## Skills

Skills activate automatically based on task context. No manual invocation required.

### lambda-api-developer

Guides development of AWS Lambda API handlers. Use when you want to:

- Add a new API endpoint (create `index.ts` and `schema.ts`)
- Write Zod validation schemas
- Configure the Middy middleware chain
- Use AWS Lambda Powertools (Logger, Parser)
- Register OpenAPI routes

**Triggers**: "add an endpoint", "create a Lambda handler", "write a schema", "register an OpenAPI route", or any work under `src/functions/`.

### api-tester

Guides writing unit and integration tests for Lambda handlers using Vitest and Testcontainers. Use when you want to:

- Configure `vitest.config.ts`
- Set up database test containers (PostgreSQL / MySQL)
- Write unit tests with a mocked DB
- Write integration tests with a real DB container
- Set up coverage reporting

**Triggers**: "write tests", "unit test", "integration test", "configure vitest", or any work under `tests/`.

### drizzle-developer

Guides database access with Drizzle ORM and schema migrations with Drizzle Kit. Use when you want to:

- Define table schemas and relations (`src/db/schema.ts`)
- Set up the Drizzle database singleton (`src/db/index.ts`)
- Write queries — select, insert, update, delete, with filters, ordering, and pagination
- Use the relational query API (`db.query.*`)
- Configure `drizzle.config.ts` and run Kit commands (`generate`, `migrate`, `push`, `studio`)
- Integrate Drizzle with Lambda handlers and tests

**Triggers**: "define a schema", "write a query", "drizzle migration", "db.select", "drizzle-kit generate", or any work under `src/db/`.

### aws-cdk-development

Guides building AWS infrastructure with CDK in TypeScript. Use when you want to:

- Create or refactor CDK stacks and constructs
- Define Lambda functions, API Gateway, DynamoDB, S3, and other AWS resources as code
- Configure `NodejsFunction` for TypeScript Lambda bundling
- Validate stacks before deployment with `cdk-nag` and `cdk synth`
- Organize stacks — nested stacks, construct boundaries, cross-stack exports
- Write CDK unit tests and CloudFormation snapshot tests
- Deploy and verify infrastructure with `cdk deploy`

**Triggers**: "create a CDK stack", "define infrastructure", "cdk deploy", "cdk synth", "IaC", "CloudFormation", or any work on CDK constructs.

### typescript-expert

Advanced TypeScript expertise covering type-level programming, performance optimization, migration strategies, and modern tooling. Use when you want to:

- Design complex types — branded types, conditional types, template literal types, mapped types
- Diagnose and fix TypeScript errors — circular types, "inferred type cannot be named", excessive stack depth
- Optimize type checking performance — `incremental`, `skipLibCheck`, project references
- Migrate JavaScript to TypeScript or upgrade between TypeScript versions
- Choose and configure tooling — Biome vs ESLint, Turborepo vs Nx, ESM vs CJS
- Write type tests with Vitest `expectTypeOf`
- Configure monorepo TypeScript setups with project references

**Triggers**: "TypeScript error", "fix types", "type-level", "branded type", "tsconfig", "slow type checking", "migrate to TypeScript", or any deep TypeScript question.

### lint-rule-development

Guides creating custom lint rules in Biome's Analyzer. Use when you want to:

- Create a new lint rule or assist action
- Add automatic code-fix actions
- Implement semantic binding analysis
- Add configurable options to a rule

**Triggers**: "create a lint rule", "implement a Biome rule", "noVar", "useConst", or any work on Biome analyzer code.

## Tech Stack

- **Runtime**: AWS Lambda (Node.js / Bun)
- **API layer**: API Gateway HTTP API
- **Language**: TypeScript
- **Middleware**: Middy
- **Validation**: Zod v4
- **Observability**: AWS Lambda Powertools
- **Testing**: Vitest + Testcontainers
- **ORM**: Drizzle ORM
- **Migrations**: Drizzle Kit
- **Linting**: Biome

## Contributing

Issues and pull requests are welcome at [hu-shukang/lambda-api-plugin](https://github.com/hu-shukang/lambda-api-plugin).

## License

MIT

## Changelog

### 0.2.0

- Added `drizzle-developer` skill — Drizzle ORM queries, schema definition, Drizzle Kit migrations, Lambda integration
- Added `typescript-expert` skill — type-level programming, performance optimization, migration strategies
- Added `aws-cdk-development` skill — CDK stacks, constructs, NodejsFunction, cdk-nag validation
- Added `setup-project` agent — initializes full project structure in one run
- Added `run-tests` agent — runs Vitest suite with pass/fail summary
- Added `write-tests` agent — generates unit and integration tests from handler source
- Added `biome-check` agent — lints and formats code with Biome, applies safe fixes
- Added `/generate-lambda` command — interactive Lambda handler scaffolding
- Added `SubagentStart` / `SubagentStop` hooks for subagent lifecycle logging

### 0.1.0

- Initial release
- `lambda-api-developer` skill
- `api-tester` skill
- `lint-rule-development` skill

## Version

0.2.0
