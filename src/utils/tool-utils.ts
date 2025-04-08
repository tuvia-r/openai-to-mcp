
import { OpenAPIV3 } from "openapi-client-axios";
import logger from "./logger";
import { openAPISchemaToZod } from "./json-shchema-to-zod";

/**
 * params includes all parameters from the OpenAPI spec
 * like path, query, header and body
 * a param can either be a schema or have a schema property
 */
export function parametersArrayToUnifiedSchema(params: OpenAPIV3.ParameterObject[] = []) {
    logger.debug('Converting OpenAPI parameters to unified schema', { paramCount: params?.length });
    // schema used for too needs to not be an actuals schema but a map of zod schemas
    const schema: any = {};

    for (const param of params) {
        const zodSchema = openAPISchemaToZod(param.schema || param as any)
        schema[param.name] = param.schema;
        if (param.required) {
            schema[param.name] = zodSchema
        }
        else {
            schema[param.name] = zodSchema.optional();
        }
    }

    logger.debug('Converted parameters to schema', { 
        propertyCount: Object.keys(schema).length,
        requiredCount: Object.keys(schema).filter(key => schema[key].isRequired).length
    });
    return schema;
}

export function unifiedArgumentsToParametersArray(args: Record<string, any>, params: OpenAPIV3.ParameterObject[] = []) {
    logger.debug('Converting unified arguments to OpenAPI parameters', { 
        argCount: Object.keys(args).length, 
        paramCount: params.length 
    });
    
    // Separate arguments by 'in' property
    let bodyParam: any = undefined;
    const otherParams: any[] = []

    for (const param of params) {
        const { name, in: location, schema } = param;
        
        // Skip if the argument wasn't provided
        if (args[name] === undefined) {
            logger.debug(`Parameter ${name} not provided in arguments`);
            continue;
        }

        if (location === 'body') {
            logger.debug(`Setting body parameter ${name}`);
            bodyParam = args[name];
        } else {
            // Handle path, query, header parameters
            logger.debug(`Setting ${location} parameter ${name}`);
            otherParams.push({
                name,
                in: location,
                value: args[name],
            });
        }
    }

    logger.debug('Arguments converted', { 
        otherParamCount: Object.keys(otherParams).length,
        hasBodyParam: bodyParam !== undefined
    });
    logger.info('Returning unified parameters array');
    
    return {
        params: otherParams,
        body: bodyParam,
    };
}