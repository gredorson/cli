import { simpleGraphTemplate } from "./simple-graph";
import { advancedGraphTemplate } from "./advanced-graph";

export interface GraphTemplate {
  module: string;
  builder: string;
  packageJson: string;
  tsConfig?: string;
  dockerfile?: string;
  readme?: string;
  manifest: string;
}

export const templates: Record<string, GraphTemplate> = {
  simple: simpleGraphTemplate,
  advanced: advancedGraphTemplate,
};

export function getTemplate(templateName: string): GraphTemplate {
  const template = templates[templateName];
  if (!template) {
    throw new Error(
      `Template "${templateName}" not found. Available templates: ${Object.keys(templates).join(", ")}`
    );
  }
  return template;
}

export function listTemplates(): string[] {
  return Object.keys(templates);
}

export function renderTemplate(
  templateString: string,
  variables: Record<string, string>
): string {
  let rendered = templateString;

  // Replace all {{variable}} placeholders with actual values
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    rendered = rendered.replace(regex, value);
  }

  return rendered;
}

export function validateTemplateVariables(
  template: GraphTemplate,
  variables: Record<string, string>
): string[] {
  const missingVariables: string[] = [];

  // Extract all variables from all template strings
  const allTemplateStrings = [
    template.module,
    template.builder,
    template.packageJson,
    template.manifest,
    ...(template.tsConfig ? [template.tsConfig] : []),
    ...(template.dockerfile ? [template.dockerfile] : []),
    ...(template.readme ? [template.readme] : []),
  ];

  const allVariables = new Set<string>();

  allTemplateStrings.forEach(templateString => {
    const matches = templateString.match(/{{(\w+)}}/g);
    if (matches) {
      matches.forEach(match => {
        const variable = match.replace(/[{}]/g, "");
        allVariables.add(variable);
      });
    }
  });

  // Check which variables are missing
  allVariables.forEach(variable => {
    if (!(variable in variables)) {
      missingVariables.push(variable);
    }
  });

  return missingVariables;
}

export { simpleGraphTemplate, advancedGraphTemplate };
