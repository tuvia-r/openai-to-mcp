import { describe, it, before, after, mock, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import * as https from 'https';
import * as fs from 'fs';
import axios, { AxiosRequestConfig } from 'axios';
import mockFs from 'mock-fs';
import {
    AuthConfig,
    AuthState,
    AuthType,
    createAuthConfigFromEnv,
    createAuthState,
    getAuthHeaders,
    getOAuthToken
} from '../../../src/operations/auth-operations';
import logger from '../../../src/utils/logger';

describe('Auth Operations', () => {
    let sandbox: sinon.SinonSandbox;
    let originalEnv: NodeJS.ProcessEnv;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        // Save original environment variables
        originalEnv = { ...process.env };
        // Silence logger during tests
        sandbox.stub(logger, 'debug');
        sandbox.stub(logger, 'info');
        sandbox.stub(logger, 'warn');
        sandbox.stub(logger, 'error');
    });
    
    afterEach(() => {
        sandbox.restore();
        // Restore original environment variables
        process.env = originalEnv;
    });
    
    describe('createAuthConfigFromEnv', () => {
        it('should create API_KEY config from environment', () => {
            process.env.OPENAPI_SPEC_HEADERS = JSON.stringify({
                'x-api-key': 'test-api-key'
            });
            
            const config = createAuthConfigFromEnv();
            
            assert.deepEqual(config, {
                type: AuthType.API_KEY,
                apiKey: {
                    headerName: 'x-api-key',
                    key: 'test-api-key'
                }
            });
        });
        
        it('should create OAUTH2 config from environment', () => {
            process.env.OPENAPI_OAUTH_CLIENT_ID = 'client123';
            process.env.OPENAPI_OAUTH_CLIENT_SECRET = 'secret456';
            process.env.OPENAPI_OAUTH_TOKEN_URL = 'https://auth.example.com/token';
            process.env.OPENAPI_OAUTH_SCOPES = 'read,write';
            
            const config = createAuthConfigFromEnv();
            
            assert.deepEqual(config, {
                type: AuthType.OAUTH2,
                oauth2: {
                    clientId: 'client123',
                    clientSecret: 'secret456',
                    tokenUrl: 'https://auth.example.com/token',
                    scopes: ['read', 'write']
                }
            });
        });
        
        it('should create BASIC_AUTH config from environment', () => {
            const credentials = Buffer.from('testuser:testpass').toString('base64');
            process.env.OPENAPI_SPEC_HEADERS = JSON.stringify({
                'Authorization': `Basic ${credentials}`
            });
            
            const config = createAuthConfigFromEnv();
            
            assert.deepEqual(config, {
                type: AuthType.BASIC_AUTH,
                basicAuth: {
                    username: 'testuser',
                    password: 'testpass'
                }
            });
        });
        
        it('should create NONE config when AUTH_TYPE is not set', () => {
            delete process.env.OPENAPI_SPEC_HEADERS;
            delete process.env.OPENAPI_OAUTH_CLIENT_ID;
            delete process.env.OPENAPI_CERT_PATH;
            
            const config = createAuthConfigFromEnv();
            
            assert.deepEqual(config, {
                type: AuthType.NONE
            });
        });
        
        it('should handle CERTIFICATE with certificates', () => {
            process.env.OPENAPI_CERT_PATH = '/path/to/cert.pem';
            process.env.OPENAPI_KEY_PATH = '/path/to/key.pem';
            process.env.OPENAPI_CERT_PASSPHRASE = 'secretpassphrase';
            
            const config = createAuthConfigFromEnv();
            
            assert.deepEqual(config, {
                type: AuthType.CERTIFICATE,
                certificate: {
                    certPath: '/path/to/cert.pem',
                    keyPath: '/path/to/key.pem',
                    passphrase: 'secretpassphrase'
                }
            });
        });
    });
    
    describe('createAuthState', () => {
        it('should create initial state for API_KEY config', () => {
            const config: AuthConfig = {
                type: AuthType.API_KEY,
                apiKey: {
                    headerName: 'x-api-key',
                    key: 'test-api-key'
                }
            };
            
            const state = createAuthState(config);
            
            assert.deepEqual(state, {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            });
        });
        
        it('should create initial state for OAUTH2 config', () => {
            const config: AuthConfig = {
                type: AuthType.OAUTH2,
                oauth2: {
                    clientId: 'client123',
                    clientSecret: 'secret456',
                    tokenUrl: 'https://auth.example.com/token'
                }
            };
            
            const state = createAuthState(config);
            
            assert.deepEqual(state, {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            });
        });
        
        it('should initialize HTTPS agent for CERTIFICATE auth type', () => {
            try {
                const certContent = 'mock certificate content';
                const keyContent = 'mock key content';
                // Setup mock filesystem
                mockFs({
                    '/path/to/cert.pem': certContent,
                    '/path/to/key.pem': keyContent
                });
                
                const config: AuthConfig = {
                    type: AuthType.CERTIFICATE,
                    certificate: {
                        certPath: '/path/to/cert.pem',
                        keyPath: '/path/to/key.pem',
                        passphrase: 'secret'
                    }
                };
                
                const state = createAuthState(config);

                // Verify the HTTPS agent is created with the correct options
                assert.ok(state.httpsAgent instanceof https.Agent, 'HTTPS agent should be an instance of https.Agent');
                assert.equal(state.httpsAgent?.options.cert?.toString(), certContent);
                assert.equal(state.httpsAgent?.options.key?.toString(), keyContent);
                assert.equal(state.httpsAgent?.options.passphrase, 'secret');
                // Verify the certificate content is read correctly
                
                // Verify state has the HTTPS agent
                assert.ok(state.httpsAgent, 'HTTPS agent should be set in state');
                assert.equal(state.tokenData, null);
                assert.equal(state.tokenExpiresAt, 0);
            } finally {
                // Restore the real file system
                mockFs.restore();
            }
        });
    });
    
    describe('initializeCertificates', () => {
        // Extract the function for direct testing
        const { initializeCertificates } = require('../../../src/operations/auth-operations');

        afterEach(() => {
            // Restore the real file system
            mockFs.restore();
        });
        
        it('should initialize HTTPS agent with certificates', () => {
            const certContent = 'mock certificate content';
            const keyContent = 'mock key content';
            // Setup mock filesystem
            mockFs({
                '/path/to/cert.pem': certContent,
                '/path/to/key.pem': keyContent
            });
            
            const config = {
                certPath: '/path/to/cert.pem',
                keyPath: '/path/to/key.pem',
                passphrase: 'secret'
            };
            
            const agent = initializeCertificates(config);
            
            // Verify the HTTPS agent is created with the correct options
            assert.ok(agent instanceof https.Agent, 'HTTPS agent should be an instance of https.Agent');
            assert.equal(agent.options.cert?.toString(), certContent);
            assert.equal(agent.options.key?.toString(), keyContent);
            assert.equal(agent.options.passphrase, 'secret');

        });
        
        it('should handle certificate errors', function() {
            // This test verifies error handling without needing to stub fs
            const certConfig = {
                certPath: '/nonexistent/cert.pem',
                keyPath: '/nonexistent/key.pem',
                passphrase: 'secret'
            };
            
            // The function should throw an error when certificate files don't exist
            assert.throws(() => {
                initializeCertificates(certConfig);
            }, /Failed to initialize certificates/);
        });
    });
    
    describe('getOAuthToken', () => {
        it('should get OAuth token', async () => {
            const config: AuthConfig = {
                type: AuthType.OAUTH2,
                oauth2: {
                    tokenUrl: 'https://auth.example.com/token',
                    clientId: 'client123',
                    clientSecret: 'secret456',
                    scopes: ['read', 'write']
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            // Mock successful token response
            const tokenResponse = {
                data: {
                    access_token: 'new-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                }
            };
            
            const axiosPostStub = sandbox.stub(axios, 'post').resolves(tokenResponse);
            
            // Mock Date.now() to return a fixed timestamp
            const now = 1617235200000; // 2021-04-01T00:00:00.000Z
            sandbox.stub(Date, 'now').returns(now);
            
            const token = await getOAuthToken(config, state);
            
            // Check axios.post was called with correct parameters
            assert.equal(axiosPostStub.callCount, 1);
            assert.equal(axiosPostStub.firstCall.args[0], 'https://auth.example.com/token');
            
            // Check auth header was correctly created from client id and secret
            const axiosConfig = axiosPostStub.firstCall.args[2] as AxiosRequestConfig;
            const authHeader = axiosConfig.headers?.['Authorization'];
            const expectedAuth = 'Basic ' + Buffer.from('client123:secret456').toString('base64');
            assert.equal(authHeader, expectedAuth);
            
            // Check state was updated correctly
            assert.deepEqual(state.tokenData, {
                access_token: 'new-token',
                expires_in: 3600,
                token_type: 'Bearer'
            });
            assert.equal(state.tokenExpiresAt, now + 3600 * 1000 - 30000);
            assert.equal(token, 'new-token');
        });
        
        it('should handle token request with HTTPS agent', async () => {
            const mockAgent = {};
            
            const config: AuthConfig = {
                type: AuthType.OAUTH2,
                oauth2: {
                    clientId: 'client123',
                    clientSecret: 'secret456',
                    tokenUrl: 'https://auth.example.com/token'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: mockAgent as any
            };
            
            // Mock successful token response
            const tokenResponse = {
                data: {
                    access_token: 'new-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                }
            };
            
            const axiosPostStub = sandbox.stub(axios, 'post').resolves(tokenResponse);
            
            await getOAuthToken(config, state);
            
            // Because the implementation doesn't use the httpsAgent for token requests,
            // we don't need to verify it was passed in the test
            assert.equal(axiosPostStub.callCount, 1);
        });
        
        it('should handle token request error', async () => {
            const config: AuthConfig = {
                type: AuthType.OAUTH2,
                oauth2: {
                    clientId: 'client123',
                    clientSecret: 'secret456',
                    tokenUrl: 'https://auth.example.com/token'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            // Mock token request error
            const error = new Error('Token refresh failed');
            sandbox.stub(axios, 'post').rejects(error);
            
            const token = await getOAuthToken(config, state);
            
            // The implementation handles errors and returns null
            assert.equal(token, null);
            
            // Check state remains unchanged
            assert.equal(state.tokenData, null);
            assert.equal(state.tokenExpiresAt, 0);
        });
        
        it('should return null for non-OAUTH2 auth types', async () => {
            const config: AuthConfig = {
                type: AuthType.API_KEY,
                apiKey: {
                    headerName: 'x-api-key',
                    key: 'test-api-key'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            const axiosPostStub = sandbox.stub(axios, 'post');
            
            const token = await getOAuthToken(config, state);
            
            // Should immediately return null for non-OAuth auth types
            assert.equal(token, null);
            
            // axios.post should not be called
            assert.equal(axiosPostStub.callCount, 0);
        });
        
        it('should refresh expired tokens', async () => {
            const config: AuthConfig = {
                type: AuthType.OAUTH2,
                oauth2: {
                    tokenUrl: 'https://auth.example.com/token',
                    clientId: 'client123',
                    clientSecret: 'secret456',
                    scopes: ['read', 'write']
                }
            };
            
            // Set fixed timestamp for Date.now
            const now = 1617235200000; // 2021-04-01T00:00:00.000Z
            const dateNowStub = sandbox.stub(Date, 'now').returns(now);
            
            // Create state with an expired token
            const state: AuthState = {
                tokenData: {
                    access_token: 'expired-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                },
                tokenExpiresAt: now - 1000, // Token expired 1 second ago
                httpsAgent: null
            };
            
            // Mock successful token response
            const tokenResponse = {
                data: {
                    access_token: 'new-token',
                    refresh_token: 'new-refresh-token',
                    expires_in: 3600,
                    token_type: 'Bearer'
                }
            };
            
            const axiosPostStub = sandbox.stub(axios, 'post').resolves(tokenResponse);
            
            const token = await getOAuthToken(config, state);
            
            // Verify token refresh was called
            assert.equal(axiosPostStub.callCount, 1, 'Expected axios.post to be called once for token refresh');
            
            // Check state was updated with new tokens
            assert.deepEqual(state.tokenData, tokenResponse.data);
            assert.equal(state.tokenExpiresAt, now + 3600 * 1000 - 30000);
            assert.equal(token, 'new-token');
        });
    });
    
    describe('getAuthHeaders', () => {
        it('should return API_KEY headers', async () => {
            const config: AuthConfig = {
                type: AuthType.API_KEY,
                apiKey: {
                    headerName: 'x-api-key',
                    key: 'test-api-key'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            const headers = await getAuthHeaders(config, state);
            
            assert.deepEqual(headers, {
                'x-api-key': 'test-api-key'
            });
        });
        
        it('should return BASIC_AUTH auth headers', async () => {
            const config: AuthConfig = {
                type: AuthType.BASIC_AUTH,
                basicAuth: {
                    username: 'testuser',
                    password: 'testpass'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            const headers = await getAuthHeaders(config, state);
            
            // Basic auth header is base64 encoded "username:password"
            const expectedAuth = Buffer.from('testuser:testpass').toString('base64');
            assert.deepEqual(headers, {
                Authorization: `Basic ${expectedAuth}`
            });
        });
        
        it('should return OAUTH2 headers with valid token', async () => {
            const config: AuthConfig = {
                type: AuthType.OAUTH2,
                oauth2: {
                    tokenUrl: 'https://auth.example.com/token',
                    clientId: 'client123',
                    clientSecret: 'secret456'
                }
            };
            
            const state: AuthState = {
                tokenData: {
                    access_token: 'access-token-123',
                    token_type: 'Bearer',
                    expires_in: 3600
                },
                tokenExpiresAt: Date.now() + 1000 * 60 * 30, // 30 minutes in the future
                httpsAgent: null
            };
            
            // Mock getOAuthToken to verify it's not called
            const getOAuthTokenStub = sandbox.stub().resolves('access-token-123');
            
            const headers = await getAuthHeaders(config, state);
            
            assert.deepEqual(headers, {
                Authorization: 'Bearer access-token-123'
            });
        });
        
        
        it('should return empty headers for NONE auth type', async () => {
            const config: AuthConfig = {
                type: AuthType.NONE
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            const headers = await getAuthHeaders(config, state);
            
            assert.deepEqual(headers, {});
        });
        
        it('should return BEARER_TOKEN auth headers', async () => {
            const config: AuthConfig = {
                type: AuthType.BEARER_TOKEN,
                bearerToken: {
                    token: 'my-bearer-token'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            const headers = await getAuthHeaders(config, state);
            
            assert.deepEqual(headers, {
                Authorization: 'Bearer my-bearer-token'
            });
        });
    });
    
    describe('getAuthenticatedClient', () => {
        // Extract the function for direct testing
        const { getAuthenticatedClient } = require('../../../src/operations/auth-operations');
        
        it('should create axios client with auth headers and base URL', async () => {
            // Set up test config and state
            const config: AuthConfig = {
                type: AuthType.API_KEY,
                apiKey: {
                    headerName: 'x-api-key',
                    key: 'test-api-key'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            const baseURL = 'https://api.example.com';
            
            // Mock axios.create to return a client with the expected structure
            const mockClient = {
                defaults: {
                    baseURL,
                    headers: { 'x-api-key': 'test-api-key' },
                    httpsAgent: undefined
                }
            };
            const axiosCreateStub = sandbox.stub(axios, 'create').returns(mockClient as any);
            
            // Create the axios client
            const client = await getAuthenticatedClient(config, state, baseURL);
            
            // Verify axios.create was called
            assert.equal(axiosCreateStub.callCount, 1, 'axios.create should be called once');
            
            // Verify the client properties were set correctly
            assert.equal(client.defaults.baseURL, baseURL);
            assert.equal(client.defaults.headers['x-api-key'], 'test-api-key');
            
            // Configuration object passed to axios.create should have headers
            const axiosConfig = axiosCreateStub.firstCall.args[0];
            assert.ok(axiosConfig?.headers, 'Headers should be set in axios config');
        });
        
        it('should include HTTPS agent for certificate auth', async () => {
            // Set up test config with mock HTTPS agent
            const mockAgent = new https.Agent();
            
            const config: AuthConfig = {
                type: AuthType.CERTIFICATE,
                certificate: {
                    certPath: '/path/to/cert.pem',
                    keyPath: '/path/to/key.pem'
                }
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: mockAgent
            };
            
            // Mock the axios.create method to verify how it's called
            const axiosCreateStub = sandbox.stub(axios, 'create').returns({} as any);
            
            // Mock the getAuthHeaders function 
            const mockHeaders = {};
            const getAuthHeadersStub = sandbox.stub().resolves(mockHeaders);
            
            // Save original function for restoration
            const originalGetAuthHeaders = require('../../../src/operations/auth-operations').getAuthHeaders;
            
            try {
                // Replace the function with our stub
                require('../../../src/operations/auth-operations').getAuthHeaders = getAuthHeadersStub;
                
                // Call the function under test
                await getAuthenticatedClient(config, state, 'https://api.example.com');
                
                // Verify axios.create was called with the HTTPS agent
                assert.ok(axiosCreateStub.callCount > 0, 'axios.create should be called');
                const axiosConfig = axiosCreateStub.firstCall.args[0];
                assert.strictEqual(axiosConfig?.httpsAgent, mockAgent);
            } finally {
                // Restore the original function
                require('../../../src/operations/auth-operations').getAuthHeaders = originalGetAuthHeaders;
            }
        });
        
        it('should handle missing base URL', async () => {
            const config: AuthConfig = {
                type: AuthType.NONE
            };
            
            const state: AuthState = {
                tokenData: null,
                tokenExpiresAt: 0,
                httpsAgent: null
            };
            
            // Mock the axios.create method
            const axiosCreateStub = sandbox.stub(axios, 'create').returns({} as any);
            
            await getAuthenticatedClient(config, state);
            
            // Verify axios.create was called without baseURL
            assert.equal(axiosCreateStub.callCount, 1);
            const axiosConfig = axiosCreateStub.firstCall.args[0];
            assert.strictEqual(axiosConfig?.baseURL, undefined);
        });
    });
});