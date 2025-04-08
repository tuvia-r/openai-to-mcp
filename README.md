# OpenAPI to MCP Server

A Model Context Protocol (MCP) server that converts any OpenAPI/Swagger specification into an MCP server, allowing Large Language Models (LLMs) to interact with REST APIs through a standardized interface.

## Why Use OpenAPI to MCP?

The OpenAPI to MCP server bridges the gap between REST APIs and LLM agents by:
- Automatically converting API specifications into MCP-compatible tools
- Providing type-safe interactions with any REST API
- Eliminating the need for manual tool creation and maintenance

## Client Configuration

Add the OpenAPI to MCP server to your MCP client's configuration file:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": [
        "-y",
        "openapi-to-mcp"
      ],
      "env": {
        "OPENAPI_SPEC_URL": "path/to/your/swagger.yml",
        "OPENAPI_SPEC_BASE_URL": "http://api.example.com"
      }
    }
  }
}
```

Configuration file locations for supported clients:

- **Claude Desktop**
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

- **Cursor**: `~/.cursor/mcp.json`

- **Windsurf**: `~/.codeium/windsurf/mcp_config.json`

- **VS Code**:
  - Workspace configuration: `.vscode/mcp.json`
  - Command line: 
    ```bash
    code --add-mcp "{\"name\":\"openapi-mcp\",\"command\":\"npx\",\"args\":[\"-y\",\"openapi-to-mcp\"],\"env\":{\"OPENAPI_SPEC_URL\":\"path/to/your/swagger.yml\",\"OPENAPI_SPEC_BASE_URL\":\"http://api.example.com\"}}"
    ```

  Example `.vscode/mcp.json`:
  ```json
  {
    "servers": {
      "openapi-mcp": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "openapi-to-mcp"],
        "env": {
          "OPENAPI_SPEC_URL": "path/to/your/swagger.yml",
          "OPENAPI_SPEC_BASE_URL": "http://api.example.com"
        }
      }
    }
  }
  ```

## Example Usage

Here's an example of how the server converts OpenAPI operations into MCP tools:

### OpenAPI Specification
```yaml
paths:
  /pets:
    get:
      operationId: getPets
      summary: List all pets
      parameters:
        - name: limit
          in: query
          type: integer
```

### Generated MCP Tool
```typescript
{
  name: "getPets",
  description: "List all pets",
  parameters: {
    limit: z.number().int().optional()
  }
}
```

## Features in Detail

### 1. API Specification Support

- OpenAPI 2.0 (Swagger)
- OpenAPI 3.0
- Local file paths
- Remote HTTP URLs
- YAML and JSON formats

### 2. Authentication

The server supports various authentication methods:

#### API Key Authentication
```json
{
  "env": {
    "OPENAPI_SPEC_HEADERS": "{\"X-API-Key\": \"your-api-key\"}"
  }
}
```

#### Bearer Token
```json
{
  "env": {
    "OPENAPI_SPEC_HEADERS": "{\"Authorization\": \"Bearer your-token\"}"
  }
}
```

#### Certificate-Based Authentication
```json
{
  "env": {
    "OPENAPI_CERT_PATH": "/path/to/client.crt",
    "OPENAPI_KEY_PATH": "/path/to/client.key",
    "OPENAPI_CERT_PASSPHRASE": "optional-passphrase"
  }
}
```

#### OAuth2 Authentication
```json
{
  "env": {
    "OPENAPI_OAUTH_CLIENT_ID": "your-client-id",
    "OPENAPI_OAUTH_CLIENT_SECRET": "your-client-secret",
    "OPENAPI_OAUTH_TOKEN_URL": "https://auth.example.com/oauth/token",
    "OPENAPI_OAUTH_SCOPES": "read:data,write:data"
  }
}
```

### 3. Request/Response Handling

- Automatic parameter validation
- JSON Schema to Zod conversion
- Content type negotiation
- File uploads
- Binary responses
- Error mapping

### 4. Type Safety

- Full TypeScript support
- Automatic type generation
- Runtime type validation
- Type-safe API calls

## Command Line Flags

- `--spec <path>`: Path to OpenAPI specification file
- `--base-url <url>`: Base URL for API requests
- `--headers <json>`: Additional headers as JSON string
- `--verbose`: Enable detailed logging
- `--log-level <level>`: Set log level (error, warn, info, debug)
- `--cert-path <path>`: Path to client certificate file
- `--key-path <path>`: Path to client key file
- `--cert-passphrase <string>`: Passphrase for certificate
- `--oauth-client-id <id>`: OAuth client ID
- `--oauth-client-secret <secret>`: OAuth client secret
- `--oauth-token-url <url>`: OAuth token endpoint URL
- `--oauth-scopes <scopes>`: Comma-separated list of OAuth scopes
- `--version`: Display version information
- `--help`: Show help information

## Docker Support

### Building the Docker Image

To build the Docker image:

```bash
# Clone the repository
git clone https://github.com/your-username/openapi-to-mcp
cd openapi-to-mcp

# Build the Docker image
docker build -t openapi-to-mcp .
```

### Running the Container

You can run the server using Docker:

```bash
docker run \
  -e OPENAPI_SPEC_URL="https://petstore.swagger.io/v2/swagger.json" \
  -e OPENAPI_SPEC_BASE_URL="https://petstore.swagger.io/v2" \
  openapi-to-mcp
```

## Environment Variables

The server uses the following environment variables:

| Variable | Description | Requirement | Notes |
|----------|-------------|------------|-------|
| OPENAPI_SPEC_URL | Path or URL to OpenAPI spec | **Required** | Local file path or HTTP(S) URL |
| OPENAPI_SPEC_BASE_URL | Base URL for API requests | **Required** | API server base URL |
| OPENAPI_SPEC_HEADERS | Additional headers as JSON | Optional | Used for API key and token auth |
| OPENAPI_CERT_PATH | Path to client certificate | Optional* | Required for certificate auth |
| OPENAPI_KEY_PATH | Path to client key | Optional* | Required for certificate auth |
| OPENAPI_CERT_PASSPHRASE | Passphrase for client key | Optional | Only needed if key is encrypted |
| OPENAPI_OAUTH_CLIENT_ID | OAuth client ID | Optional* | Required for OAuth2 auth |
| OPENAPI_OAUTH_CLIENT_SECRET | OAuth client secret | Optional* | Required for OAuth2 auth |
| OPENAPI_OAUTH_TOKEN_URL | OAuth token URL | Optional* | Required for OAuth2 auth |
| OPENAPI_OAUTH_SCOPES | OAuth scopes (comma-separated) | Optional | Used for OAuth2 scope requests |
| NODE_EXTRA_CA_CERTS | Custom CA certificates path | Optional | For self-signed certificates |
| NODE_TLS_REJECT_UNAUTHORIZED | Disable TLS validation (0 or 1) | Optional | Use with caution for testing |
| LOG_LEVEL | Log level (error, warn, info, debug) | Optional | Defaults to "info" |

> *These variables are conditionally required depending on the authentication method you're using.

## Troubleshooting

### Enable Debug Logs
```bash
npx openapi-to-mcp --debug
```

### Common Issues

3. **Version Conflicts**
   - Ensure Node.js version ≥ 18
   - Check package.json for compatibility

### Logs Location

- MacOS / Linux:
  ```bash
  tail -f ~/.openapi-mcp/logs/server.log
  ```
- Windows:
  ```powershell
  Get-Content "$env:USERPROFILE\.openapi-mcp\logs\server.log" -Wait
  ```

1. **Spec Parser**: Loads and validates the OpenAPI specification
2. **Operation Generator**: Converts API operations to MCP tools
3. **MCP Tools**: Exposes operations as standardized tools
4. **API Calls**: Makes actual HTTP requests to the API

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

### Development Setup

```bash
git clone https://github.com/your-username/openapi-to-mcp
cd openapi-to-mcp
npm install
npm run build
npm run start
```

## Testing

Run the test suite:
```bash
npm test
```

Start the test server:
```bash
npm run start:server
```

## License

MIT License - see LICENSE file for details

## Support

- [Open an issue](https://github.com/your-username/openapi-to-mcp/issues)
- [Documentation](https://your-username.github.io/openapi-to-mcp)
- [Discord Community](https://discord.gg/your-server)