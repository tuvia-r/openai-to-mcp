import { OpenAPIV3 } from "openapi-client-axios";
import { z } from "zod";

function convertPropertiesToZodShape(
    properties: Record<string, OpenAPIV3.SchemaObject>,
    required: string[]
): Record<string, z.ZodTypeAny> {
    return Object.entries(properties).reduce((acc, [key, value]) => {
        let field = openAPISchemaToZod(value);
        if (!required.includes(key)) {
            field = field.optional();
        }
        acc[key] = field;
        return acc;
    }, {} as Record<string, z.ZodTypeAny>);
}

export function openAPISchemaToZod(schemaObject: OpenAPIV3.SchemaObject): z.ZodTypeAny {
    const {
        description = "",
        title = "",
        type = "string",
        properties = {},
        required = [],
        minimum,
        maximum,
        enum: enumValues,
        format,
    } = schemaObject;
    const schemaDescription = description || title;

    switch (type) {
        case "object": {
            const shape = convertPropertiesToZodShape((properties ?? {}) as Record<string, OpenAPIV3.SchemaObject>, required);
            return z.object(shape).describe(schemaDescription);
        }
        case "array": {
            // Assuming arrays contain objects with properties.
            const shape = convertPropertiesToZodShape((properties ?? {}) as Record<string, OpenAPIV3.SchemaObject>, required);
            return z.array(z.object(shape)).describe(schemaDescription);
        }
        case "string": {
            const strSchema = enumValues
                ? z.enum(enumValues as unknown as readonly [string]).describe(schemaDescription)
                : z.string().describe(schemaDescription);
            if (format === "date-time") {
                return strSchema.transform((val) => new Date(val));
            }
            return strSchema;
        }
        case "number":
        case "integer": {
            let numSchema = z.number().describe(schemaDescription);
            if (minimum !== undefined) {
                numSchema = numSchema.min(minimum);
            }
            if (maximum !== undefined) {
                numSchema = numSchema.max(maximum);
            }
            if (type === "integer") {
                numSchema = numSchema.int();
            }
            return numSchema;
        }
        case "boolean":
            return z.boolean().describe(schemaDescription);
        default:
            throw new Error(`Unsupported type: ${type}`);
    }
}