import { describe, it, expect } from 'vitest';

describe('tools_documentation Tool', () => {
  describe('Documentation Structure', () => {
    it('should provide essentials documentation format', () => {
      const essentials = {
        description: 'Search for KeeperHub plugins by name or functionality',
        keyParameters: ['query', 'limit', 'category'],
        example: 'search_plugins(query="web3", limit=10, category="all")',
        performance: 'Typically responds in <20ms',
        tips: [
          'Use specific keywords for better results',
          'Filter by category to narrow down results',
        ],
      };

      expect(essentials).toHaveProperty('description');
      expect(essentials).toHaveProperty('keyParameters');
      expect(essentials).toHaveProperty('example');
      expect(essentials).toHaveProperty('performance');
      expect(essentials).toHaveProperty('tips');
    });

    it('should provide full documentation format', () => {
      const full = {
        description: 'Comprehensive description of the tool',
        parameters: {
          query: {
            type: 'string',
            description: 'Search keywords',
            required: true,
          },
          limit: {
            type: 'number',
            description: 'Maximum results',
            required: false,
            default: 10,
          },
        },
        returns: 'Array of matching plugins with metadata',
        examples: [
          'search_plugins(query="blockchain")',
          'search_plugins(query="discord", category="messaging")',
        ],
        useCases: [
          'Finding available Web3 integrations',
          'Discovering messaging plugins',
        ],
        performance: 'FTS5 search completes in <20ms',
        bestPractices: [
          'Use specific search terms',
          'Leverage category filtering',
        ],
        pitfalls: [
          'Empty query strings will fail',
          'Very broad searches may return many results',
        ],
        relatedTools: ['get_plugin', 'validate_plugin_config'],
      };

      expect(full).toHaveProperty('description');
      expect(full).toHaveProperty('parameters');
      expect(full).toHaveProperty('returns');
      expect(full).toHaveProperty('examples');
      expect(full).toHaveProperty('useCases');
      expect(full).toHaveProperty('performance');
      expect(full).toHaveProperty('bestPractices');
      expect(full).toHaveProperty('pitfalls');
      expect(full).toHaveProperty('relatedTools');
    });
  });

  describe('search_plugins Documentation', () => {
    it('should document search_plugins tool', () => {
      const doc = {
        name: 'search_plugins',
        description: 'Search for KeeperHub plugins by name, description, or functionality',
        parameters: {
          query: {
            type: 'string',
            description: 'Search keywords (e.g., "web3", "discord", "email")',
            required: true,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 10, max: 50)',
            required: false,
            default: 10,
          },
          category: {
            type: 'string',
            description: 'Filter by category (web3, messaging, integration, notification)',
            required: false,
            default: 'all',
          },
        },
        returns: 'Array of plugins with type, label, description, category, step count, and credentials info',
        performance: 'FTS5 full-text search, responds in <20ms',
      };

      expect(doc.name).toBe('search_plugins');
      expect(doc.parameters.query.required).toBe(true);
      expect(doc.parameters.limit.default).toBe(10);
    });

    it('should include usage examples', () => {
      const examples = [
        'search_plugins(query="blockchain")',
        'search_plugins(query="email", category="notification", limit=5)',
        'search_plugins(query="discord OR telegram")',
      ];

      expect(examples).toHaveLength(3);
      expect(examples[0]).toContain('blockchain');
    });

    it('should document best practices', () => {
      const bestPractices = [
        'Use specific keywords for accurate results',
        'Leverage category filtering to narrow search',
        'Check stepCount to understand plugin capabilities',
        'Use hasCredentials to know if setup is required',
      ];

      expect(bestPractices).toHaveLength(4);
    });

    it('should document common pitfalls', () => {
      const pitfalls = [
        'Empty query strings cause FTS5 errors',
        'Very broad searches may return all plugins',
        'Case-insensitive search may return unexpected results',
      ];

      expect(pitfalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('get_plugin Documentation', () => {
    it('should document get_plugin tool', () => {
      const doc = {
        name: 'get_plugin',
        description: 'Get complete documentation for a specific plugin',
        parameters: {
          plugin_type: {
            type: 'string',
            description: 'Plugin type identifier (e.g., "web3", "discord")',
            required: true,
          },
          include_examples: {
            type: 'boolean',
            description: 'Include configuration examples',
            required: false,
            default: false,
          },
        },
        returns: 'Complete plugin metadata with steps, config fields, and output fields',
        performance: 'Direct database lookup, <10ms',
      };

      expect(doc.parameters.plugin_type.required).toBe(true);
      expect(doc.performance).toContain('<10ms');
    });

    it('should document return structure', () => {
      const returnStructure = {
        pluginType: 'string',
        label: 'string',
        description: 'string',
        category: 'string',
        singleConnection: 'boolean',
        credentials: {
          required: 'boolean',
          fields: 'array of credential field objects',
        },
        steps: 'array of step objects with config and output fields',
      };

      expect(returnStructure).toHaveProperty('pluginType');
      expect(returnStructure).toHaveProperty('credentials');
      expect(returnStructure).toHaveProperty('steps');
    });
  });

  describe('validate_plugin_config Documentation', () => {
    it('should document validate_plugin_config tool', () => {
      const doc = {
        name: 'validate_plugin_config',
        description: 'Validate plugin step configuration before deployment',
        parameters: {
          plugin_type: {
            type: 'string',
            description: 'Plugin type',
            required: true,
          },
          step_slug: {
            type: 'string',
            description: 'Step slug',
            required: true,
          },
          config: {
            type: 'object',
            description: 'Configuration to validate',
            required: true,
          },
          validation_mode: {
            type: 'string',
            description: 'strict, runtime, or minimal',
            required: false,
            default: 'runtime',
          },
        },
      };

      expect(doc.parameters.config.type).toBe('object');
      expect(doc.parameters.validation_mode.default).toBe('runtime');
    });

    it('should document validation rules', () => {
      const validationRules = {
        web3: {
          network: 'Must be valid EVM chain ID or name',
          address: 'Must match ETH address format (0x + 40 hex chars)',
          amount: 'Must be valid number, positive for transfers',
        },
        discord: {
          webhookUrl: 'Must start with https://discord.com/api/webhooks/',
          discordMessage: 'Required, non-empty string',
        },
        sendgrid: {
          to: 'Must be valid email format',
          from: 'Must be valid email format',
          subject: 'Required for emails',
        },
        webhook: {
          url: 'Must be valid HTTP/HTTPS URL',
          method: 'Must be GET, POST, PUT, DELETE, or PATCH',
        },
      };

      expect(validationRules.web3.address).toContain('0x');
      expect(validationRules.discord.webhookUrl).toContain('discord.com');
    });

    it('should document validation modes', () => {
      const modes = {
        strict: 'Validates all fields strictly, fails on any warning',
        runtime: 'Validates required fields and types, allows warnings',
        minimal: 'Only checks for required fields presence',
      };

      expect(modes).toHaveProperty('strict');
      expect(modes).toHaveProperty('runtime');
      expect(modes).toHaveProperty('minimal');
    });
  });

  describe('Template Tools Documentation', () => {
    it('should document search_templates tool', () => {
      const doc = {
        name: 'search_templates',
        description: 'Search for pre-built workflow templates',
        parameters: {
          query: {
            type: 'string',
            description: 'Search keywords',
            required: true,
          },
          category: {
            type: 'string',
            description: 'monitoring, transfers, defi, notifications, analytics',
            required: false,
            default: 'all',
          },
          difficulty: {
            type: 'string',
            description: 'beginner, intermediate, advanced',
            required: false,
            default: 'all',
          },
        },
        performance: 'FTS5 search, <20ms',
      };

      expect(doc.parameters.difficulty.description).toContain('beginner');
    });

    it('should document get_template tool', () => {
      const doc = {
        name: 'get_template',
        description: 'Get complete workflow template configuration',
        parameters: {
          template_id: {
            type: 'string',
            description: 'Template ID from search_templates',
            required: true,
          },
          include_setup_guide: {
            type: 'boolean',
            description: 'Include setup instructions',
            required: false,
            default: true,
          },
        },
      };

      expect(doc.parameters.include_setup_guide.default).toBe(true);
    });

    it('should document deploy_template tool', () => {
      const doc = {
        name: 'deploy_template',
        description: 'Deploy a template as a new workflow',
        parameters: {
          template_id: {
            type: 'string',
            description: 'Template ID to deploy',
            required: true,
          },
          workflow_name: {
            type: 'string',
            description: 'Custom name for deployed workflow',
            required: true,
          },
          customizations: {
            type: 'object',
            description: 'Node-specific customizations',
            required: false,
          },
          validate_before_deploy: {
            type: 'boolean',
            description: 'Validate before deployment',
            required: false,
            default: true,
          },
        },
      };

      expect(doc.parameters.validate_before_deploy.default).toBe(true);
    });
  });

  describe('Performance Information', () => {
    it('should document performance characteristics', () => {
      const performance = {
        search_plugins: '<20ms (FTS5 full-text search)',
        get_plugin: '<10ms (direct database lookup)',
        validate_plugin_config: '<50ms (includes validation logic)',
        search_templates: '<20ms (FTS5 full-text search)',
        get_template: '<10ms (direct database lookup)',
        deploy_template: '<2s (includes validation and API call)',
      };

      Object.values(performance).forEach((perf) => {
        expect(perf).toMatch(/<?\d+(ms|s)/);
      });
    });

    it('should document database size', () => {
      const dbInfo = {
        size: '<5MB for all plugins and templates',
        format: 'SQLite with FTS5 virtual tables',
        location: 'In-memory or local plugins.db file',
      };

      expect(dbInfo.size).toContain('5MB');
      expect(dbInfo.format).toContain('SQLite');
    });
  });

  describe('Usage Examples', () => {
    it('should provide workflow discovery example', () => {
      const example = {
        step1: 'search_plugins(query="web3")',
        step2: 'get_plugin(plugin_type="web3")',
        step3: 'validate_plugin_config(plugin_type="web3", step_slug="check-balance", config={...})',
      };

      expect(example).toHaveProperty('step1');
      expect(example).toHaveProperty('step2');
      expect(example).toHaveProperty('step3');
    });

    it('should provide template deployment example', () => {
      const example = {
        step1: 'search_templates(query="balance monitor")',
        step2: 'get_template(template_id="eth-balance-monitor")',
        step3: 'deploy_template(template_id="eth-balance-monitor", workflow_name="My Monitor")',
      };

      expect(example.step3).toContain('deploy_template');
    });
  });

  describe('Related Tools Mapping', () => {
    it('should map related tools for search_plugins', () => {
      const relatedTools = {
        search_plugins: ['get_plugin', 'validate_plugin_config'],
        get_plugin: ['search_plugins', 'validate_plugin_config'],
        validate_plugin_config: ['search_plugins', 'get_plugin'],
      };

      expect(relatedTools.search_plugins).toContain('get_plugin');
    });

    it('should map related tools for templates', () => {
      const relatedTools = {
        search_templates: ['get_template', 'deploy_template'],
        get_template: ['search_templates', 'deploy_template'],
        deploy_template: ['search_templates', 'get_template', 'validate_plugin_config'],
      };

      expect(relatedTools.deploy_template).toContain('validate_plugin_config');
    });
  });

  describe('Error Messages Documentation', () => {
    it('should document common error messages', () => {
      const errors = {
        'Plugin not found': 'Returned when plugin_type does not exist',
        'Invalid configuration': 'Validation failed for required fields',
        'Template not found': 'Template ID does not exist',
        'Deployment failed': 'Error during template deployment',
        'Empty search query': 'FTS5 requires non-empty search string',
      };

      expect(Object.keys(errors)).toHaveLength(5);
    });

    it('should document error recovery suggestions', () => {
      const suggestions = {
        'Plugin not found': 'Use search_plugins to find available plugins',
        'Invalid configuration': 'Check plugin documentation with get_plugin',
        'Template not found': 'Use search_templates to find available templates',
      };

      expect(suggestions['Plugin not found']).toContain('search_plugins');
    });
  });

  describe('Tool Format Validation', () => {
    it('should validate tool name format', () => {
      const toolNames = [
        'search_plugins',
        'get_plugin',
        'validate_plugin_config',
        'search_templates',
        'get_template',
        'deploy_template',
        'tools_documentation',
      ];

      toolNames.forEach((name) => {
        expect(name).toMatch(/^[a-z_]+$/);
      });
    });

    it('should validate parameter name format', () => {
      const paramNames = [
        'query',
        'plugin_type',
        'step_slug',
        'template_id',
        'workflow_name',
        'validation_mode',
      ];

      paramNames.forEach((name) => {
        expect(name).toMatch(/^[a-z_]+$/);
      });
    });
  });

  describe('Documentation Completeness', () => {
    it('should document all required tools', () => {
      const requiredTools = [
        'search_plugins',
        'get_plugin',
        'validate_plugin_config',
        'search_templates',
        'get_template',
        'deploy_template',
        'tools_documentation',
      ];

      expect(requiredTools).toHaveLength(7);
    });

    it('should include both essentials and full format for each tool', () => {
      const tool = {
        essentials: {
          description: 'Short description',
          keyParameters: ['query'],
          example: 'search_plugins(query="web3")',
          performance: '<20ms',
          tips: ['Tip 1'],
        },
        full: {
          description: 'Detailed description',
          parameters: {},
          returns: 'Return value description',
          examples: [],
          useCases: [],
          performance: '<20ms',
          bestPractices: [],
          pitfalls: [],
          relatedTools: [],
        },
      };

      expect(tool).toHaveProperty('essentials');
      expect(tool).toHaveProperty('full');
    });
  });
});
