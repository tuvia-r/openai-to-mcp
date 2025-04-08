import { getOpenApiClient, getOperations } from "./operations/openapi-operations";
import { configureStdioServer, createMcpServer, setupServerTools } from "./operations/smp-operations";
import logger from "./utils/logger";
import { AuthType } from "./operations/auth-operations";
import { Command } from 'commander';

// Simple interface for configuration
interface ServerConfig {
  spec?: string;
  baseUrl?: string;
  headers?: string;
  verbose?: boolean;
  logLevel?: string;
  certPath?: string;
  keyPath?: string;
  certPassphrase?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthTokenUrl?: string;
  oauthScopes?: string;
}

/**
 * Parse command line arguments using Commander
 */
function parseArgs(): ServerConfig {
  const program = new Command();
  
  program
    .name('openapi-to-mcp')
    .description('OpenAPI to MCP Server - Convert OpenAPI specs to MCP tools')
    .version('1.0.0');
  
  // Core options
  program
    .option('--spec <path>', 'Path to OpenAPI specification file')
    .option('--base-url <url>', 'Base URL for API requests')
    .option('--headers <json>', 'Additional headers as JSON string', '{}')
    .option('--verbose', 'Enable detailed logging')
    .option('--log-level <level>', 'Set log level (error, warn, info, debug)', 'info');
  
  // Auth options
  program
    .option('--cert-path <path>', 'Path to client certificate file')
    .option('--key-path <path>', 'Path to client key file')
    .option('--cert-passphrase <string>', 'Passphrase for certificate')
    .option('--oauth-client-id <id>', 'OAuth client ID')
    .option('--oauth-client-secret <secret>', 'OAuth client secret')
    .option('--oauth-token-url <url>', 'OAuth token endpoint URL')
    .option('--oauth-scopes <scopes>', 'Comma-separated list of OAuth scopes');
  
  program.addHelpText('after', `
Environment Variables:
  OPENAPI_SPEC_URL              Path or URL to OpenAPI spec (required if --spec not set)
  OPENAPI_SPEC_BASE_URL         Base URL for API requests (required if --base-url not set)
  OPENAPI_SPEC_HEADERS          Additional headers as JSON
  OPENAPI_CERT_PATH             Path to client certificate file
  OPENAPI_KEY_PATH              Path to client key file
  OPENAPI_CERT_PASSPHRASE       Passphrase for certificate
  OPENAPI_OAUTH_CLIENT_ID       OAuth client ID
  OPENAPI_OAUTH_CLIENT_SECRET   OAuth client secret
  OPENAPI_OAUTH_TOKEN_URL       OAuth token endpoint URL
  OPENAPI_OAUTH_SCOPES          OAuth scopes (comma-separated)
  LOG_LEVEL                     Log level (error, warn, info, debug)
  `);
  
  program.parse();
  
  // Just return options directly - simpler and cleaner
  return program.opts();
}

/**
 * Start the OpenAPI to MCP server
 */
async function startServer(config: ServerConfig): Promise<void> {
  // Command line args take precedence over env vars
  const specUrl = config.spec || process.env.OPENAPI_SPEC_URL;
  const baseUrl = config.baseUrl || process.env.OPENAPI_SPEC_BASE_URL;
  const headers = config.headers || process.env.OPENAPI_SPEC_HEADERS || '{}';
  
  // Validate required parameters
  if (!specUrl) {
    throw new Error("OpenAPI spec URL/path is required. Provide it via --spec flag or OPENAPI_SPEC_URL env var");
  }
  if (!baseUrl) {
    throw new Error("Base URL is required. Provide it via --base-url flag or OPENAPI_SPEC_BASE_URL env var");
  }
  
  // Validate certificate auth (both cert and key required)
  if ((config.certPath && !config.keyPath) || (!config.certPath && config.keyPath)) {
    throw new Error("Certificate-based authentication requires both --cert-path and --key-path");
  }
  
  // Validate OAuth2 auth (all three params required)
  const hasPartialOAuth = Boolean(config.oauthClientId || config.oauthClientSecret || config.oauthTokenUrl);
  const hasCompleteOAuth = Boolean(config.oauthClientId && config.oauthClientSecret && config.oauthTokenUrl);
  if (hasPartialOAuth && !hasCompleteOAuth) {
    throw new Error("OAuth2 authentication requires --oauth-client-id, --oauth-client-secret, and --oauth-token-url");
  }
  
  // Set authentication environment variables from config
  if (config.certPath) process.env.OPENAPI_CERT_PATH = config.certPath;
  if (config.keyPath) process.env.OPENAPI_KEY_PATH = config.keyPath;
  if (config.certPassphrase) process.env.OPENAPI_CERT_PASSPHRASE = config.certPassphrase;
  if (config.oauthClientId) process.env.OPENAPI_OAUTH_CLIENT_ID = config.oauthClientId;
  if (config.oauthClientSecret) process.env.OPENAPI_OAUTH_CLIENT_SECRET = config.oauthClientSecret;
  if (config.oauthTokenUrl) process.env.OPENAPI_OAUTH_TOKEN_URL = config.oauthTokenUrl;
  if (config.oauthScopes) process.env.OPENAPI_OAUTH_SCOPES = config.oauthScopes;
  
  // Set log level
  if (config.logLevel) {
    logger.level = config.logLevel;
    logger.info(`Log level set to ${config.logLevel}`);
  }
  
  if (config.verbose) {
    logger.info('Starting server with config', { 
      specUrl, 
      baseUrl, 
      headers: JSON.parse(headers),
      authType: determineAuthType(config)
    });
  }
  
  logger.debug('Initializing OpenAPI client', { specUrl, baseUrl });
  try {
    const openApiClient = await getOpenApiClient(specUrl, baseUrl, JSON.parse(headers));
    logger.debug('OpenAPI client initialized successfully');
    
    logger.debug('Getting operations from OpenAPI client');
    const operations = getOperations(openApiClient);
    logger.info(`Found ${operations} operations in OpenAPI specification`);
    
    logger.debug('Creating MCP server');
    const mcpServer = createMcpServer();
    logger.debug('Setting up server tools');
    setupServerTools(mcpServer, operations);
    logger.info('MCP server initialized with operations');

    logger.debug('Configuring stdio server');
    await configureStdioServer(mcpServer);
    logger.info('Server started successfully');
  } catch (error) {
    logger.error('Failed to initialize server', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * Helper function to determine auth type for logging
 */
function determineAuthType(config: ServerConfig): AuthType {
  if (config.certPath && config.keyPath) {
    return AuthType.CERTIFICATE;
  } else if (config.oauthClientId && config.oauthClientSecret && config.oauthTokenUrl) {
    return AuthType.OAUTH2;
  } else if (process.env.OPENAPI_CERT_PATH && process.env.OPENAPI_KEY_PATH) {
    return AuthType.CERTIFICATE;
  } else if (process.env.OPENAPI_OAUTH_CLIENT_ID && 
             process.env.OPENAPI_OAUTH_CLIENT_SECRET && 
             process.env.OPENAPI_OAUTH_TOKEN_URL) {
    return AuthType.OAUTH2;
  } else if (config.headers || process.env.OPENAPI_SPEC_HEADERS) {
    return AuthType.API_KEY; // Default assumption for header-based auth
  }
  return AuthType.NONE;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  logger.info('Starting OpenAPI to MCP Server');
  try {
    const config = parseArgs();
    await startServer(config);
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('Fatal error during server startup', { 
        message: error.message, 
        stack: error.stack 
      });
      console.error('Error:', error.message);
    } else {
      logger.error('Unknown fatal error during server startup', { error });
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

main();
