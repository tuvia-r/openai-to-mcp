import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosError } from "openapi-client-axios";
import { parametersArrayToUnifiedSchema, unifiedArgumentsToParametersArray } from "../utils/tool-utils";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OperationEntry } from "./openapi-operations";
import logger from "../utils/logger";

interface ToolCallResult {
    statusCode: number;
    headers: Record<string, string>;
    data: any;
}

export function createMcpServer() {
    logger.debug('Creating new MCP server instance');
    return new McpServer({
        name: 'OpenAPI Client',
        description: 'OpenAPI Client for Model Context Protocol',
        version: '1.0.0',
    });
}

async function onToolCall(args: Record<string, any>, entry: OperationEntry): Promise<ToolCallResult> {
    const { operationId } = entry;
    logger.debug(`Executing tool call: ${operationId}`, { args });
    
    try {
        const { parameters: entryParameters, callback } = entry;
        const {params, body} = unifiedArgumentsToParametersArray(args, entryParameters);
        
        logger.debug(`Calling OpenAPI operation: ${operationId}`, { params, bodySize: body ? 'present' : 'none' });
        const response = await callback(params, body);
        
        logger.info(`OpenAPI operation completed: ${operationId}`, { 
            status: response.status, 
            hasData: !!response.data 
        });
        
        return {
            statusCode: response.status,
            headers: response.headers as Record<string, string>,
            data: response.data
        }
    }
    catch (error: any) {
        if (error?.response) {
            const axiosError = error as AxiosError;
            logger.warn(`API error in operation ${operationId}`, { 
                status: axiosError?.response?.status, 
                message: axiosError.message 
            });
            
            return {
                statusCode: axiosError?.response?.status ?? 500,
                headers: axiosError.response?.headers as Record<string, string>,
                data: axiosError.response?.data
            }
        }
        
        logger.error(`Unexpected error in operation ${operationId}`, { 
            error: error.message ?? error,
            stack: error.stack
        });
        
        return {
            statusCode: 500,
            headers: {},
            data: error.message ?? error
        }
    }
}

function getContentObject(result: ToolCallResult): CallToolResult['content'][number] {
    const { headers, data } = result;
    const contentType = headers['content-type'] || headers['Content-Type'] || 'application/json';
    
    logger.debug('Processing tool call result', { 
        statusCode: result.statusCode, 
        contentType 
    });

    if (contentType.startsWith('image/')) {
        logger.debug('Returning image content');
        return {
            type: 'image',
            data,
            mimeType: contentType,
        };
    }
    if (contentType.startsWith('audio/')) {
        logger.debug('Returning audio content');
        return {
            type: 'audio',
            data,
            mimeType: contentType,
        };
    }

    logger.debug('Returning text/JSON content');
    return {
        type: 'text',
        text: JSON.stringify(result, null, 2),
        mimeType: 'application/json',
    }
}

function createToolFromOperationEntry(server: McpServer, entry: OperationEntry) {
    const { parameters, description, operationId } = entry;
    logger.debug(`Creating MCP tool for operation: ${operationId}`);
    
    const tool = server.tool(
        operationId,
        description,
        parametersArrayToUnifiedSchema(parameters),
        async (args: Record<string, any>) => {
            logger.debug(`Tool ${operationId} called with args`, { argCount: Object.keys(args).length });
            const result = await onToolCall(args, entry);
            logger.debug(`Tool ${operationId} completed`, { statusCode: result.statusCode });
            return {
                content: [getContentObject(result)],
            } as CallToolResult
        }
    );
    return tool;
}

export function setupServerTools(server: McpServer, operations: OperationEntry[]) {
    logger.info(`Setting up ${operations.length} tools for MCP server`);
    operations.forEach((operation) => {
        createToolFromOperationEntry(server, operation);
    });
    logger.info('MCP server tools setup complete');
}

export async function configureStdioServer(server: McpServer) {
    logger.debug('Configuring stdio transport for MCP server');
    try {
        const transport = new StdioServerTransport(process.stdin, process.stdout);
        await server.connect(transport);
        logger.info('MCP server connected to stdio transport');
    } catch (error) {
        logger.error('Failed to configure stdio transport', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
}

