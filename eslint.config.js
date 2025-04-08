// @ts-check

import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import { globalIgnores } from "eslint/config";


export default tseslint.config(
    ...tseslint.configs.strict,
	...tseslint.configs.stylistic,
	prettierConfig,
    {
		rules: {
			// Add any additional rules or overrides here
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error"],
			"import/no-unresolved": "off",
			"@typescript-eslint/no-var-requires": "off",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-explicit-any": "off",
		}
	},
    globalIgnores(['*.js', 'dist/**']),
);
