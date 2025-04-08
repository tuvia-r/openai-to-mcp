import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { z } from 'zod';
import { openAPISchemaToZod } from '../../../src/utils/json-shchema-to-zod';
import { OpenAPIV3 } from 'openapi-client-axios';

describe('JSON Schema to Zod Converter', () => {
    describe('openAPISchemaToZod', () => {
        it('should convert string schema correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'string',
                description: 'A string field'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify schema properties
            assert.equal(zodSchema._def.typeName, z.ZodString.name);
            assert.equal(zodSchema.description, 'A string field');
            
            // Verify validation works
            assert.doesNotThrow(() => zodSchema.parse('test'));
            assert.throws(() => zodSchema.parse(123));
        });
        
        it('should convert number schema correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'number',
                minimum: 1,
                maximum: 10,
                description: 'A number field'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify schema properties
            assert.equal(zodSchema._def.typeName, z.ZodNumber.name);
            assert.equal(zodSchema.description, 'A number field');
            
            // Verify validation works with constraints
            assert.doesNotThrow(() => zodSchema.parse(5));
            assert.throws(() => zodSchema.parse(0)); // Below minimum
            assert.throws(() => zodSchema.parse(11)); // Above maximum
            assert.throws(() => zodSchema.parse('5')); // Wrong type
        });
        
        it('should convert integer schema correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'integer',
                minimum: 1,
                maximum: 10,
                description: 'An integer field'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify schema properties
            assert.equal(zodSchema._def.typeName, z.ZodNumber.name);
            assert.equal(zodSchema.description, 'An integer field');
            
            // Verify validation works with integer constraint
            assert.doesNotThrow(() => zodSchema.parse(5));
            assert.throws(() => zodSchema.parse(5.5)); // Not an integer
        });
        
        it('should convert boolean schema correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'boolean',
                description: 'A boolean field'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify schema properties
            assert.equal(zodSchema._def.typeName, z.ZodBoolean.name);
            assert.equal(zodSchema.description, 'A boolean field');
            
            // Verify validation works
            assert.doesNotThrow(() => zodSchema.parse(true));
            assert.doesNotThrow(() => zodSchema.parse(false));
            assert.throws(() => zodSchema.parse('true'));
        });
        
        it('should convert enum schema correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'string',
                enum: ['red', 'green', 'blue'],
                description: 'A color enum'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify schema properties
            assert.equal(zodSchema._def.typeName, z.ZodEnum.name);
            assert.equal(zodSchema.description, 'A color enum');
            
            // Verify validation works with enum values
            assert.doesNotThrow(() => zodSchema.parse('red'));
            assert.doesNotThrow(() => zodSchema.parse('green'));
            assert.doesNotThrow(() => zodSchema.parse('blue'));
            assert.throws(() => zodSchema.parse('yellow'));
        });
        
        it('should convert object schema correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'integer', minimum: 0 }
                },
                required: ['name'],
                description: 'A person object'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify schema properties
            assert.equal(zodSchema._def.typeName, z.ZodObject.name);
            assert.equal(zodSchema.description, 'A person object');
            
            // Verify validation works with required fields
            assert.doesNotThrow(() => zodSchema.parse({ name: 'John', age: 30 }));
            assert.doesNotThrow(() => zodSchema.parse({ name: 'Jane' })); // Age is optional
            assert.throws(() => zodSchema.parse({ age: 25 })); // Missing required name
            assert.throws(() => zodSchema.parse({ name: 'John', age: -5 })); // Invalid age
        });
        
        it('should convert array schema correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' }
                    }
                },
                description: 'An array of objects'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify schema properties
            assert.equal(zodSchema._def.typeName, z.ZodArray.name);
            assert.equal(zodSchema.description, 'An array of objects');
            
            // Verify validation works
            assert.doesNotThrow(() => zodSchema.parse([{ name: 'Item 1' }, { name: 'Item 2' }]));
            assert.throws(() => zodSchema.parse('not an array'));
        });
        
        it('should convert date-time format correctly', () => {
            const schema: OpenAPIV3.SchemaObject = {
                type: 'string',
                format: 'date-time',
                description: 'A date-time field'
            };
            
            const zodSchema = openAPISchemaToZod(schema);
            
            // Verify validation transforms string to Date
            const result = zodSchema.parse('2023-01-01T12:00:00Z');
            assert.ok(result instanceof Date);
            assert.equal(result.toISOString(), '2023-01-01T12:00:00.000Z');
        });
        
        it('should throw error for unsupported type', () => {
            const schema: OpenAPIV3.SchemaObject = {
                // @ts-ignore - Intentionally using invalid type
                type: 'unsupported',
                description: 'An unsupported type'
            };
            
            assert.throws(() => openAPISchemaToZod(schema), /Unsupported type/);
        });
    });
});