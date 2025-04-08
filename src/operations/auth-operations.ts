import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import logger from '../utils/logger';

/**
 * Authentication types enum
 * Defines all supported authentication methods
 */
export enum AuthType {
    NONE = 'none',
    API_KEY = 'api_key',
    BEARER_TOKEN = 'bearer_token',
    OAUTH2 = 'oauth2',
    CERTIFICATE = 'certificate',
    BASIC_AUTH = 'basic_auth'
}

/**
 * Environment variable requirements enum
 * Defines which environment variables are required for each auth type
 */
export enum EnvVarRequirement {
    REQUIRED = 'required',
    OPTIONAL = 'optional'
}

/**
 * Auth configuration interface
 */
export interface AuthConfig {
    type: AuthType;
    apiKey?: {
        key: string;
        headerName?: string;
        in?: 'header' | 'query';
    };
    bearerToken?: {
        token: string;
    };
    oauth2?: {
        clientId: string;
        clientSecret: string;
        tokenUrl: string;
        scopes?: string[];
        additionalParams?: Record<string, string>;
    };
    certificate?: {
        certPath: string;
        keyPath: string;
        passphrase?: string;
    };
    basicAuth?: {
        username: string;
        password: string;
    };
    refreshToken?: string;
    tokenExpiresAt?: number;
}

/**
 * Token response interface
 */
export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
}

/**
 * Auth state for OAuth tokens and HTTPS agent
 */
export interface AuthState {
    tokenData: TokenResponse | null;
    tokenExpiresAt: number;
    httpsAgent: https.Agent | null;
}

/**
 * Environment variables configuration with requirement levels
 */
export const AUTH_ENV_VARS = {
    // Required by all configurations
    OPENAPI_SPEC_URL: { requirement: EnvVarRequirement.REQUIRED, description: 'Path or URL to OpenAPI spec' },
    OPENAPI_SPEC_BASE_URL: { requirement: EnvVarRequirement.REQUIRED, description: 'Base URL for API requests' },
    
    // Optional for all configurations
    OPENAPI_SPEC_HEADERS: { requirement: EnvVarRequirement.OPTIONAL, description: 'Additional headers as JSON' },
    
    // Certificate auth
    OPENAPI_CERT_PATH: { requirement: EnvVarRequirement.OPTIONAL, description: 'Path to client certificate for mutual TLS' },
    OPENAPI_KEY_PATH: { requirement: EnvVarRequirement.OPTIONAL, description: 'Path to client key for mutual TLS' },
    OPENAPI_CERT_PASSPHRASE: { requirement: EnvVarRequirement.OPTIONAL, description: 'Passphrase for client key' },
    
    // OAuth2 auth
    OPENAPI_OAUTH_CLIENT_ID: { requirement: EnvVarRequirement.OPTIONAL, description: 'OAuth client ID' },
    OPENAPI_OAUTH_CLIENT_SECRET: { requirement: EnvVarRequirement.OPTIONAL, description: 'OAuth client secret' },
    OPENAPI_OAUTH_TOKEN_URL: { requirement: EnvVarRequirement.OPTIONAL, description: 'OAuth token URL' },
    OPENAPI_OAUTH_SCOPES: { requirement: EnvVarRequirement.OPTIONAL, description: 'OAuth scopes (comma-separated)' },
    
    // SSL/TLS options
    NODE_EXTRA_CA_CERTS: { requirement: EnvVarRequirement.OPTIONAL, description: 'Custom CA certificates path' },
    NODE_TLS_REJECT_UNAUTHORIZED: { requirement: EnvVarRequirement.OPTIONAL, description: 'Disable TLS validation (0 or 1)' },
};

/**
 * Initialize certificates for HTTPS requests
 */
export function initializeCertificates(certConfig: NonNullable<AuthConfig['certificate']>): https.Agent {
    try {
        logger.debug('Initializing certificates', { 
            certPath: certConfig.certPath, 
            keyPath: certConfig.keyPath 
        });
        
        const cert = fs.readFileSync(path.resolve(certConfig.certPath));
        const key = fs.readFileSync(path.resolve(certConfig.keyPath));
        
        const httpsAgentOptions: https.AgentOptions = {
            cert,
            key,
            passphrase: certConfig.passphrase
        };
        
        const agent = new https.Agent(httpsAgentOptions);
        logger.info('Certificate initialization successful');
        return agent;
    } catch (error) {
        logger.error('Failed to initialize certificates', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw new Error(`Failed to initialize certificates: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get OAuth token (with automatic refresh when needed)
 */
export async function getOAuthToken(
    authConfig: AuthConfig,
    state: AuthState
): Promise<string | null> {
    logger.debug('Getting OAuth token');
    
    if (!authConfig.oauth2) {
        logger.error('OAuth2 configuration not found');
        return null;
    }
    
    // Check if we have a valid token
    const now = Date.now();
    if (state.tokenData?.access_token && state.tokenExpiresAt > now) {
        logger.debug('Using existing valid OAuth token');
        return state.tokenData.access_token;
    }
    
    // Get a new token
    try {
        logger.debug('Requesting new OAuth token');
        
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        
        if (authConfig.oauth2.scopes?.length) {
            params.append('scope', authConfig.oauth2.scopes.join(' '));
        }
        
        // Add additional params if provided
        if (authConfig.oauth2.additionalParams) {
            Object.entries(authConfig.oauth2.additionalParams).forEach(([key, value]) => {
                params.append(key, value);
            });
        }
        
        // Try refresh token if available
        if (authConfig.refreshToken) {
            params.set('grant_type', 'refresh_token');
            params.append('refresh_token', authConfig.refreshToken);
        }
        
        const authHeader = Buffer.from(
            `${authConfig.oauth2.clientId}:${authConfig.oauth2.clientSecret}`
        ).toString('base64');
        
        const response = await axios.post<TokenResponse>(
            authConfig.oauth2.tokenUrl,
            params,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`
                }
            }
        );
        
        // Update state with new token data
        state.tokenData = response.data;
        
        // Calculate token expiration time (with 30-second safety margin)
        if (response.data.expires_in) {
            state.tokenExpiresAt = now + (response.data.expires_in * 1000) - 30000;
        }
        
        // Save refresh token if provided
        const newAuthConfig = { ...authConfig };
        if (response.data.refresh_token) {
            newAuthConfig.refreshToken = response.data.refresh_token;
        }
        
        logger.info('New OAuth token obtained successfully', {
            expiresIn: response.data.expires_in,
            hasRefreshToken: !!response.data.refresh_token
        });
        
        return state.tokenData.access_token;
    } catch (error) {
        logger.error('Failed to obtain OAuth token', {
            error: error instanceof Error ? error.message : String(error),
            url: authConfig.oauth2.tokenUrl
        });
        return null;
    }
}

/**
 * Get authorization headers based on auth config
 */
export async function getAuthHeaders(
    authConfig: AuthConfig,
    state: AuthState
): Promise<Record<string, string>> {
    logger.debug('Getting auth headers', { authType: authConfig.type });
    
    switch (authConfig.type) {
        case AuthType.API_KEY:
            if (authConfig.apiKey) {
                const headerName = authConfig.apiKey.headerName || 'X-API-Key';
                return { [headerName]: authConfig.apiKey.key };
            }
            break;
            
        case AuthType.BEARER_TOKEN:
            if (authConfig.bearerToken) {
                return { 'Authorization': `Bearer ${authConfig.bearerToken.token}` };
            }
            break;
            
        case AuthType.OAUTH2:
            // Check if we need to refresh the token
            const token = await getOAuthToken(authConfig, state);
            if (token) {
                return { 'Authorization': `Bearer ${token}` };
            }
            break;
            
        case AuthType.BASIC_AUTH:
            if (authConfig.basicAuth) {
                const credentials = Buffer.from(
                    `${authConfig.basicAuth.username}:${authConfig.basicAuth.password}`
                ).toString('base64');
                return { 'Authorization': `Basic ${credentials}` };
            }
            break;
            
        case AuthType.CERTIFICATE:
            // Certificates are handled at the HTTPS agent level, not in headers
            return {};
            
        case AuthType.NONE:
        default:
            return {};
    }
    
    return {};
}

/**
 * Create an auth state object with initial values
 */
export function createAuthState(authConfig: AuthConfig): AuthState {
    const state: AuthState = {
        tokenData: null,
        tokenExpiresAt: 0,
        httpsAgent: null
    };
    
    // Initialize HTTPS agent with certificates if needed
    if (authConfig.type === AuthType.CERTIFICATE && authConfig.certificate) {
        state.httpsAgent = initializeCertificates(authConfig.certificate);
    }
    
    logger.debug('Auth state initialized', { authType: authConfig.type });
    return state;
}

/**
 * Get an axios instance configured with authentication
 */
export async function getAuthenticatedClient(
    authConfig: AuthConfig,
    state: AuthState,
    baseURL?: string
): Promise<AxiosInstance> {
    logger.debug('Creating authenticated axios client', { baseURL });
    
    const config: AxiosRequestConfig = {};
    
    if (baseURL) {
        config.baseURL = baseURL;
    }
    
    // Add auth headers
    const headers = await getAuthHeaders(authConfig, state);
    if (Object.keys(headers).length > 0) {
        config.headers = headers;
    }
    
    // Add HTTPS agent for certificate-based auth
    if (state.httpsAgent) {
        config.httpsAgent = state.httpsAgent;
    }
    
    logger.debug('Axios client configured with auth', { 
        hasHeaders: Object.keys(headers).length > 0,
        hasCertificate: !!state.httpsAgent
    });
    
    return axios.create(config);
}

/**
 * Create an AuthConfig object from environment variables
 */
export function createAuthConfigFromEnv(): AuthConfig {
    logger.debug('Creating auth config from environment variables');
    
    // Check for certificates
    const certPath = process.env.OPENAPI_CERT_PATH;
    const keyPath = process.env.OPENAPI_KEY_PATH;
    
    if (certPath && keyPath) {
        logger.info('Using certificate-based authentication');
        return {
            type: AuthType.CERTIFICATE,
            certificate: {
                certPath,
                keyPath,
                passphrase: process.env.OPENAPI_CERT_PASSPHRASE
            }
        };
    }
    
    // Check for OAuth
    const clientId = process.env.OPENAPI_OAUTH_CLIENT_ID;
    const clientSecret = process.env.OPENAPI_OAUTH_CLIENT_SECRET;
    const tokenUrl = process.env.OPENAPI_OAUTH_TOKEN_URL;
    
    if (clientId && clientSecret && tokenUrl) {
        logger.info('Using OAuth2 authentication');
        return {
            type: AuthType.OAUTH2,
            oauth2: {
                clientId,
                clientSecret,
                tokenUrl,
                scopes: process.env.OPENAPI_OAUTH_SCOPES?.split(',')
            }
        };
    }
    
    // Check for headers that might contain auth info
    const headers = process.env.OPENAPI_SPEC_HEADERS;
    if (headers) {
        try {
            const parsedHeaders = JSON.parse(headers);
            
            // Check for Bearer token
            const authHeader = parsedHeaders.Authorization || parsedHeaders.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                logger.info('Using Bearer token authentication');
                return {
                    type: AuthType.BEARER_TOKEN,
                    bearerToken: {
                        token: authHeader.substring(7)
                    }
                };
            }
            
            // Check for API key
            const apiKeyHeader = Object.entries(parsedHeaders).find(([key]) => 
                key.toLowerCase().includes('api-key') || key.toLowerCase().includes('apikey')
            );
            
            if (apiKeyHeader) {
                logger.info('Using API key authentication');
                return {
                    type: AuthType.API_KEY,
                    apiKey: {
                        headerName: apiKeyHeader[0],
                        key: apiKeyHeader[1] as string
                    }
                };
            }
            
            // Check for Basic auth
            if (authHeader && authHeader.startsWith('Basic ')) {
                logger.info('Using Basic authentication');
                const decoded = Buffer.from(authHeader.substring(6), 'base64').toString();
                const [username, password] = decoded.split(':');
                
                return {
                    type: AuthType.BASIC_AUTH,
                    basicAuth: {
                        username,
                        password
                    }
                };
            }
        } catch (error) {
            logger.warn('Failed to parse OPENAPI_SPEC_HEADERS', {
                error: error instanceof Error ? error.message : String(error),
                headers
            });
        }
    }
    
    // Default to no auth
    logger.info('No authentication configured, using none');
    return {
        type: AuthType.NONE
    };
}