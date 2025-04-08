import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import * as mcpModule from '@modelcontextprotocol/sdk/server/mcp.js';
import * as stdioModule from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMcpServer, setupServerTools, configureStdioServer } from '../../../src/operations/smp-operations';
import logger from '../../../src/utils/logger';

describe('SMP Operations', () => {
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
    
    describe('createMcpServer', () => {
        it('should create a new MCP server with default options', () => {
            // Mock McpServer constructor
            const mockServer = { name: 'server-instance' };
            const mockMcpConstructor = sandbox.stub().returns(mockServer);
            
            // Stub the imported module rather than the constructor directly
            sandbox.stub(mcpModule, 'McpServer').value(mockMcpConstructor);
            
            // Call function
            const server = createMcpServer();
            
            // Verify server was created
            assert.equal(server, mockServer);
            assert.equal(mockMcpConstructor.callCount, 1);
            assert.deepEqual(mockMcpConstructor.firstCall.args[0], {
                name: 'OpenAPI Client',
                description: 'OpenAPI Client for Model Context Protocol',
                version: '1.0.0',
            });
        });
    });
    
    describe('setupServerTools', () => {
        it('should register tools for each operation', () => {
            // Create mock server and operations
            const mockServer = {
                tool: sinon.stub().returns({ name: 'mock-tool' })
            };
            
            const operations = [
                {
                    operationId: 'op1',
                    description: 'Operation 1',
                    parameters: [],
                    callback: async () => ({ data: 'result1' })
                },
                {
                    operationId: 'op2',
                    description: 'Operation 2',
                    parameters: [],
                    callback: async () => ({ data: 'result2' })
                }
            ];
            
            // Call function
            setupServerTools(mockServer as any, operations as any);
            
            // Verify tools were created
            assert.equal(mockServer.tool.callCount, 2);
            assert.equal(mockServer.tool.getCall(0).args[0], 'op1');
            assert.equal(mockServer.tool.getCall(0).args[1], 'Operation 1');
            assert.equal(mockServer.tool.getCall(1).args[0], 'op2');
            assert.equal(mockServer.tool.getCall(1).args[1], 'Operation 2');
        });
        
        it('should create handler functions for each tool', () => {
            // Create mock server and single operation
            const toolHandlerStub = sinon.stub().returns({ name: 'handler' });
            const mockServer = {
                tool: sinon.stub().callsFake((id, description, schema, handler) => {
                    // Call the handler to test it
                    handler({ param: 'test-value' });
                    return { id, handler };
                })
            };
            
            const operations = [{
                operationId: 'test-op',
                description: 'Test operation',
                parameters: [],
                callback: sinon.stub().resolves({
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    data: { result: 'success' }
                })
            }];
            
            // Call function
            setupServerTools(mockServer as any, operations as any);
            
            // Verify handler was called with arguments
            assert.equal(operations[0].callback.callCount, 1);
        });
    });
    
    describe('configureStdioServer', () => {
        it('should configure server with stdio transport', async () => {
            // Mock dependencies
            const connectStub = sinon.stub().resolves();
            const mockServer = {
                connect: connectStub
            };
            
            // Create a mock StdioServerTransport instance
            const mockStdioTransport = { type: 'stdio-transport' };
            const mockStdioConstructor = sandbox.stub().returns(mockStdioTransport);
            
            // Stub the imported module
            sandbox.stub(stdioModule, 'StdioServerTransport').value(mockStdioConstructor);
            
            // Call function
            await configureStdioServer(mockServer as any);
            
            // Verify transport was created and server was connected
            assert.equal(connectStub.callCount, 1);
            assert.equal(connectStub.firstCall.args[0], mockStdioTransport);
        });
        
        it('should throw error when connect fails', async () => {
            // Mock server with failing connect
            const expectedError = new Error('Connection failed');
            const mockServer = {
                connect: sinon.stub().rejects(expectedError)
            };
            
            // Create a mock StdioServerTransport
            const mockStdioTransport = { type: 'stdio-transport' };
            const mockStdioConstructor = sandbox.stub().returns(mockStdioTransport);
            
            // Stub the imported module
            sandbox.stub(stdioModule, 'StdioServerTransport').value(mockStdioConstructor);
            
            // Call and verify error is thrown
            await assert.rejects(
                async () => configureStdioServer(mockServer as any),
                expectedError
            );
        });
    });
    
    describe('Tool call handling', () => {
        it('should transform API responses to the correct MCP format', async () => {
            // This test verifies the onToolCall function that's used internally
            // Create mock server that will execute the tool handler
            const mockServer = {
                tool: sinon.stub().callsFake((id, description, schema, handler) => {
                    return { id, handler };
                })
            };
            
            // Create a mock operation with a controlled response
            const operations = [{
                operationId: 'test-op',
                description: 'Test operation',
                parameters: [],
                callback: sinon.stub().resolves({
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    data: { key: 'value' }
                })
            }];
            
            // Set up test to capture the handler
            let capturedHandler: Function | undefined;
            mockServer.tool = sinon.stub().callsFake((id, description, schema, handler) => {
                capturedHandler = handler;
                return { id, handler };
            });
            
            // Register the tools
            setupServerTools(mockServer as any, operations as any);
            
            // Execute the handler
            assert.ok(capturedHandler, "Handler should be defined");
            const result = await capturedHandler({ param: 'test' });
            
            // Verify the result format
            assert.ok(result.content);
            assert.equal(result.content.length, 1);
            assert.equal(result.content[0].type, 'text');
            assert.equal(result.content[0].mimeType, 'application/json');
            
            // The text contains a full JSON result object, not just the data
            const resultObj = JSON.parse(result.content[0].text);
            assert.equal(resultObj.statusCode, 200);
            assert.ok(resultObj.data);
            assert.deepEqual(resultObj.data, { key: 'value' });
        });
        
        it('should handle API errors gracefully', async () => {
            // Create mock server
            const mockServer = {
                tool: sinon.stub().callsFake((id, description, schema, handler) => {
                    return { id, handler };
                })
            };
            
            // Create a mock operation with error response
            const apiError = new Error('API error');
            (apiError as any).response = {
                status: 400,
                headers: { 'content-type': 'application/json' },
                data: { error: 'Bad request' }
            };
            
            const operations = [{
                operationId: 'error-op',
                description: 'Error operation',
                parameters: [],
                callback: sinon.stub().rejects(apiError)
            }];
            
            // Set up test to capture the handler
            let capturedHandler: Function | undefined;
            mockServer.tool = sinon.stub().callsFake((id, description, schema, handler) => {
                capturedHandler = handler;
                return { id, handler };
            });
            
            // Register the tools
            setupServerTools(mockServer as any, operations as any);
            
            // Execute the handler
            assert.ok(capturedHandler, "Handler should be defined");
            const result = await capturedHandler({});
            
            // Verify the result format includes error details
            assert.ok(result.content);
            assert.equal(result.content[0].type, 'text');
            
            // Parse result text to check for proper error details
            const resultObj = JSON.parse(result.content[0].text);
            assert.equal(resultObj.statusCode, 400);
            assert.deepEqual(resultObj.data, { error: 'Bad request' });
        });
        
        it('should handle image content types correctly', async () => {
            // Create mock server
            const mockServer = {
                tool: sinon.stub().callsFake((id, description, schema, handler) => {
                    return { id, handler };
                })
            };
            
            // Create a mock operation that returns an image
            const operations = [{
                operationId: 'image-op',
                description: 'Image operation',
                parameters: [],
                callback: sinon.stub().resolves({
                    status: 200,
                    headers: { 'content-type': 'image/jpeg' },
                    data: Buffer.from('fake-image-data')
                })
            }];
            
            // Set up test to capture the handler
            let capturedHandler: Function | undefined;
            mockServer.tool = sinon.stub().callsFake((id, description, schema, handler) => {
                capturedHandler = handler;
                return { id, handler };
            });
            
            // Register the tools
            setupServerTools(mockServer as any, operations as any);
            
            // Execute the handler
            assert.ok(capturedHandler, "Handler should be defined");
            const result = await capturedHandler({});
            
            // Verify the result format for images
            assert.ok(result.content);
            assert.equal(result.content[0].type, 'image');
            assert.equal(result.content[0].mimeType, 'image/jpeg');
            assert.ok(Buffer.isBuffer(result.content[0].data));
        });
    });
});