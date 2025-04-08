import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { loadOpenApiSpec } from '../../../src/utils/load-openapi-definition';
import logger from '../../../src/utils/logger';

describe('Load OpenAPI Definition', () => {
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
    
    describe('loadOpenApiSpec', () => {
        it('should return URL directly for remote HTTP/HTTPS URLs', async () => {
            // HTTP URL
            const httpUrl = 'http://example.com/api-spec.json';
            const result1 = await loadOpenApiSpec(httpUrl);
            assert.equal(result1, httpUrl);
            
            // HTTPS URL
            const httpsUrl = 'https://example.com/api-spec.json';
            const result2 = await loadOpenApiSpec(httpsUrl);
            assert.equal(result2, httpsUrl);
        });
        
        it('should throw error when file reading fails', async () => {
            // Setup a file path that doesn't exist
            const nonExistentPath = '/non/existent/path.json';
            
            // Assert that the function throws an error
            await assert.rejects(
                () => loadOpenApiSpec(nonExistentPath),
                (err: Error) => {
                    // We only care that some error was thrown
                    return true;
                }
            );
        });
        
        it('should properly detect and parse YAML content', async () => {
            // Create a sample YAML file path
            const tempFilePath = path.join(__dirname, 'temp-test-openapi.yml');
            
            try {
                // Create test YAML content
                const yamlContent = `
openapi: 3.0.0
info:
  title: Test YAML API
  version: 1.0.0
paths: {}
`;
                
                // Write the file
                fs.writeFileSync(tempFilePath, yamlContent);
                
                // Execute
                const result = await loadOpenApiSpec(tempFilePath);
                
                // Verify the parsed result
                assert.deepEqual(result, {
                    openapi: '3.0.0',
                    info: {
                        title: 'Test YAML API',
                        version: '1.0.0'
                    },
                    paths: {}
                });
            } finally {
                // Clean up: remove temp file
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }
        });
        
        it('should properly detect and parse JSON content', async () => {
            // Create a sample JSON file path
            const tempFilePath = path.join(__dirname, 'temp-test-openapi.json');
            
            try {
                // Create test JSON content
                const jsonContent = {
                    openapi: '3.0.0',
                    info: {
                        title: 'Test JSON API',
                        version: '1.0.0'
                    },
                    paths: {}
                };
                
                // Write the file
                fs.writeFileSync(tempFilePath, JSON.stringify(jsonContent));
                
                // Execute
                const result = await loadOpenApiSpec(tempFilePath);
                
                // Verify the parsed result
                assert.deepEqual(result, jsonContent);
            } finally {
                // Clean up: remove temp file
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }
        });
        
        it('should detect JSON content based on file content even without .json extension', async () => {
            // Create a sample file with JSON content but no .json extension
            const tempFilePath = path.join(__dirname, 'temp-test-openapi-no-ext');
            
            try {
                // Create test JSON content
                const jsonContent = {
                    openapi: '3.0.0',
                    info: {
                        title: 'Test JSON API (No Extension)',
                        version: '1.0.0'
                    },
                    paths: {}
                };
                
                // Write the file with JSON content
                fs.writeFileSync(tempFilePath, JSON.stringify(jsonContent));
                
                // Execute
                const result = await loadOpenApiSpec(tempFilePath);
                
                // Verify the parsed result
                assert.deepEqual(result, jsonContent);
            } finally {
                // Clean up: remove temp file
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }
        });

        it('should throw error when parsing invalid content', async () => {
            // Create a sample file with invalid content
            const tempFilePath = path.join(__dirname, 'temp-test-openapi-invalid');
            
            try {
                // Create invalid content (neither valid JSON nor YAML)
                const invalidContent = '{ This is not valid JSON or YAML }';
                
                // Write the invalid content to a file
                fs.writeFileSync(tempFilePath, invalidContent);
                
                // Assert that the function throws an error when parsing invalid content
                await assert.rejects(
                    () => loadOpenApiSpec(tempFilePath),
                    (err: Error) => {
                        // We expect a parsing error
                        return true;
                    }
                );
            } finally {
                // Clean up: remove temp file
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }
        });
    });
});