import OpenAPIClientAxios, { AxiosResponse, HttpMethod, OpenAPIClient, OpenAPIV3 } from "openapi-client-axios";
import { loadOpenApiSpec } from "../utils/load-openapi-definition";
import logger from "../utils/logger";
import {
    AuthType, 
    createAuthConfigFromEnv, 
    createAuthState, 
    getAuthHeaders, 
    getAuthenticatedClient
} from "./auth-operations";

export interface OperationEntry {
    parameters: OpenAPIV3.ParameterObject[];
    description: string;
    operationId: string;
    callback: (params?: any, data?: any, config?: any) => Promise<AxiosResponse>;
}

export async function getOpenApiClient(specUrl: string, baseURL: string, headers: any = {}) {
    logger.debug('Creating OpenAPI client instance', { specUrl });
    try {
        const definition = await loadOpenApiSpec(specUrl);
        logger.debug('OpenAPI specification loaded successfully', { definition});
        
        const openApi = new OpenAPIClientAxios({ definition });
        
        // Initialize authentication using functional approach
        const authConfig = createAuthConfigFromEnv();
        const authState = createAuthState(authConfig);
        
        // Get headers from auth configuration
        const authHeaders = await getAuthHeaders(authConfig, authState);
        
        // Merge provided headers with auth headers (auth headers take precedence)
        const mergedHeaders = { ...headers, ...authHeaders };
        
        openApi.axiosConfigDefaults = {
            baseURL,
            headers: mergedHeaders
        };
        
        // If using certificate auth, add the HTTPS agent
        if (authConfig.type === AuthType.CERTIFICATE) {
            const client = await getAuthenticatedClient(authConfig, authState, baseURL);
            if (client.defaults.httpsAgent) {
                openApi.axiosConfigDefaults.httpsAgent = client.defaults.httpsAgent;
            }
        }
        
        logger.debug('Initializing OpenAPI client', { 
            baseURL, 
            authType: authConfig.type,
            headerCount: Object.keys(mergedHeaders).length
        });
        
        const client = await openApi.init();
        logger.debug('Returning OpenAPI client instance');
        return client;
    } catch (error) {
        logger.error('Failed to initialize OpenAPI client', { 
            error: error instanceof Error ? error.message : String(error),
            specUrl,
            baseURL
        });
        throw error;
    }
}

function getClientFunction(client: OpenAPIClient, path: string, method: HttpMethod) {
    logger.debug('Getting client function', { path, method });
    return client.paths?.[path]?.[method] ?? (() => {
        const errorMsg = `No operation found for ${method} ${path}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
    });
}

export function getOperations(client: OpenAPIClient) {
    logger.debug('Extracting operations from OpenAPI client');
    
    try {
        const operations = client.api.getOperations().map((operation) => {
            const { path, method, parameters, description } = operation;

            // if the operationId is not set:
            // 1. use the description (replace all non-alphanumeric characters with _)
            // 2. use the method and path (replace all non-alphanumeric characters with _)
            const operationId = operation.operationId || 
                description?.replaceAll(/[^a-zA-Z0-9_-]/g, "_")?.slice(0, 64) || 
                `${method}_${path.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(-55)}`;
            
            logger.debug('Mapped operation', { operationId, path, method });
            
            return {
                parameters,
                description,
                operationId,
                callback: getClientFunction(client, path, method),
            } as OperationEntry;
        });
        
        logger.info(`Extracted ${operations.length} operations from OpenAPI specification`);
        return operations;
    } catch (error) {
        logger.error('Failed to extract operations from OpenAPI client', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}