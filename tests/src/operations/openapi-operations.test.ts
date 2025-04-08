import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';

import { getOperations } from '../../../src/operations/openapi-operations';
import logger from '../../../src/utils/logger';

describe('OpenAPI Operations', () => {
    let sandbox: sinon.SinonSandbox;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        // Silence logger during tests
        sandbox.stub(logger, 'debug');
        sandbox.stub(logger, 'info');
        sandbox.stub(logger, 'warn');
        sandbox.stub(logger, 'error');
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    describe('getOperations', () => {
        it('should extract operations from client', () => {
            // Prepare mock operations
            const mockOperations = [
                { operationId: 'op1', path: '/path1', method: 'get', parameters: [], description: 'Test op 1' }
            ];
            
            // Prepare mock client with minimal required properties
            const mockClient = {
                api: { getOperations: sinon.stub().returns(mockOperations) },
                paths: {
                    '/path1': { get: sinon.stub() }
                }
            };
            
            // Call function
            const operations = getOperations(mockClient as any);
            
            // Verify results
            assert.strictEqual(operations.length, 1);
            assert.strictEqual(operations[0].operationId, 'op1');
            assert.strictEqual(typeof operations[0].callback, 'function');
        });
        
        it('should generate operationId from description if not provided', () => {
            // Prepare mock operations with missing operationId
            const mockOperations = [
                { path: '/path1', method: 'get', parameters: [], description: 'Test operation with spaces & symbols!' }
            ];
            
            // Prepare mock client
            const mockClient = {
                api: { getOperations: sinon.stub().returns(mockOperations) },
                paths: { '/path1': { get: sinon.stub() } }
            };
            
            // Call function
            const operations = getOperations(mockClient as any);
            
            // Verify results
            assert.strictEqual(operations.length, 1);
            assert.strictEqual(operations[0].operationId, 'Test_operation_with_spaces___symbols_');
            assert.strictEqual(typeof operations[0].callback, 'function');
        });

        it('should generate operationId from method and path if neither id nor description provided', () => {
            // Prepare mock operations with missing operationId and description
            const mockOperations = [
                { path: '/test/resource/123', method: 'post', parameters: [] }
            ];
            
            // Prepare mock client
            const mockClient = {
                api: { getOperations: sinon.stub().returns(mockOperations) },
                paths: { '/test/resource/123': { post: sinon.stub() } }
            };
            
            // Call function
            const operations = getOperations(mockClient as any);
            
            // Verify results
            assert.strictEqual(operations.length, 1);
            assert.strictEqual(operations[0].operationId, 'post__test_resource_123');
            assert.strictEqual(typeof operations[0].callback, 'function');
        });

        it('should handle errors from OpenAPI client', () => {
            // Setup error case
            const mockClient = {
                api: { getOperations: sinon.stub().throws(new Error('Failed to get operations')) }
            };
            
            // Call and verify error is thrown
            assert.throws(
                () => getOperations(mockClient as any),
                /Failed to get operations/
            );
        });
    });
    
    describe('getOpenApiClient', () => {
        it('should throw error when OpenAPI spec loading fails', async () => {
            // Import the function we need to test
            const { getOpenApiClient } = await import('../../../src/operations/openapi-operations');
            
            // Import the module we need to mock
            const loadOpenApiDefinition = await import('../../../src/utils/load-openapi-definition');
            
            // Setup error case
            const expectedError = new Error('Failed to load spec');
            sandbox.stub(loadOpenApiDefinition, 'loadOpenApiSpec').rejects(expectedError);
            
            // Call and verify error is thrown
            await assert.rejects(
                async () => getOpenApiClient('invalid.json', 'https://api.com'),
                expectedError
            );
        });

    });
});