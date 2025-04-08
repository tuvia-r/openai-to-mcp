import { readFileSync } from "fs";
import { OpenAPIV3 } from "openapi-client-axios";
import {parse as parseYml} from "yaml";
import logger from "./logger";

export async function loadOpenApiSpec(specUrl: string): Promise<OpenAPIV3.Document | string> {
    logger.debug(`Loading OpenAPI spec from ${specUrl}`);
    try {
        const isRemote = specUrl.startsWith("http://") || specUrl.startsWith("https://");
        if (isRemote) {
            logger.debug("Detected remote URL for OpenAPI spec");
            // If the URL is remote, we can return it directly
            return specUrl;
        }
        let fileContent;

        logger.debug("Reading OpenAPI spec from local file");
        fileContent = readFileSync(specUrl, "utf8");
        
        const isJson = specUrl.endsWith(".json") || fileContent.trim().startsWith("{");
        
        if (isJson) {
            logger.debug("Parsing OpenAPI spec as JSON");
            return JSON.parse(fileContent);
        }

        logger.debug("Parsing OpenAPI spec as YAML");
        return parseYml(fileContent);
        
    } catch (error) {
        logger.error("Failed to load OpenAPI spec", {
            error: error instanceof Error ? error.message : String(error),
            specUrl
        });
        throw error;
    }
}
