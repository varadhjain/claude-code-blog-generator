/**
 * Setup Wizard - Interactive setup for first-time users
 * Makes it easy for Claude Code to guide users through installation
 */

import { input, confirm, select } from '@inquirer/prompts';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SetupResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// SETUP STEPS
// ============================================================================

/**
 * Step 1: Check Node.js version
 */
async function checkNodeVersion(): Promise<{ ok: boolean; message: string }> {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);

  if (major >= 18) {
    return {
      ok: true,
      message: `✅ Node.js ${version} (meets requirement: >=18)`
    };
  } else {
    return {
      ok: false,
      message: `❌ Node.js ${version} is too old. Please upgrade to Node.js 18 or higher.`
    };
  }
}

/**
 * Step 2: Check/Setup API Key (Anthropic or OpenAI)
 */
async function setupAPIKey(): Promise<{ ok: boolean; message: string }> {
  console.log('\n📝 API Key Setup\n');

  // Check if already exists in environment
  const existingAnthropic = process.env.ANTHROPIC_API_KEY;
  const existingOpenAI = process.env.OPENAI_API_KEY;

  if (existingAnthropic || existingOpenAI) {
    const key = existingAnthropic || existingOpenAI!;
    const provider = existingAnthropic ? 'Anthropic' : 'OpenAI';
    const masked = key.substring(0, 8) + '...' + key.slice(-4);
    console.log(`Found existing ${provider} key: ${masked}`);

    const keepExisting = await confirm({
      message: 'Use this existing key?',
      default: true
    });

    if (keepExisting) {
      return { ok: true, message: `✅ Using existing ${provider} API key` };
    }
  }

  // Choose provider
  const provider = await select({
    message: 'Which AI provider do you want to use?',
    choices: [
      {
        name: 'Anthropic (recommended for Claude Code users)',
        value: 'anthropic',
        description: 'Uses Claude Haiku 4.5 — fast and affordable'
      },
      {
        name: 'OpenAI',
        value: 'openai',
        description: 'Uses gpt-5-nano — ultra-low cost'
      }
    ]
  });

  const isAnthropic = provider === 'anthropic';
  const envVar = isAnthropic ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const keyPrefix = isAnthropic ? 'sk-ant-' : 'sk-';
  const keysUrl = isAnthropic
    ? 'https://console.anthropic.com/settings/keys'
    : 'https://platform.openai.com/api-keys';

  console.log(`\n📋 You need an API key from ${isAnthropic ? 'Anthropic' : 'OpenAI'}.\n`);
  console.log('Steps:');
  console.log(`  1. Visit ${keysUrl}`);
  console.log('  2. Sign in or create an account');
  console.log('  3. Create a new API key');
  console.log(`  4. Copy the key (starts with ${keyPrefix}...)\n`);

  const hasKey = await confirm({
    message: 'Do you have an API key?',
    default: false
  });

  if (!hasKey) {
    console.log('\n⏸️  Setup paused. Please get an API key first, then run setup again.');
    return { ok: false, message: 'No API key provided' };
  }

  const apiKey = await input({
    message: `Paste your ${isAnthropic ? 'Anthropic' : 'OpenAI'} API key:`,
    validate: (value) => {
      if (value.length < 20) return 'API key seems too short';
      return true;
    }
  });

  // Choose where to save
  const saveLocation = await select({
    message: 'Where should we save your API key?',
    choices: [
      {
        name: '.env file (recommended)',
        value: 'env',
        description: 'Saves to .env in current directory'
      },
      {
        name: 'Environment variable (manual)',
        value: 'manual',
        description: 'You\'ll add it to your shell config manually'
      }
    ]
  });

  if (saveLocation === 'env') {
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';

      try {
        envContent = await fs.readFile(envPath, 'utf-8');
      } catch (e) {
        // File doesn't exist, that's fine
      }

      if (envContent.includes(`${envVar}=`)) {
        envContent = envContent.replace(new RegExp(`${envVar}=.*`), `${envVar}=${apiKey}`);
      } else {
        envContent += `\n${envVar}=${apiKey}\n`;
      }

      await fs.writeFile(envPath, envContent, 'utf-8');
      process.env[envVar] = apiKey;

      return { ok: true, message: `✅ ${isAnthropic ? 'Anthropic' : 'OpenAI'} API key saved to .env file` };
    } catch (error) {
      return { ok: false, message: `❌ Failed to save .env file: ${(error as Error).message}` };
    }
  } else {
    console.log('\n📝 Add this to your shell config (~/.zshrc or ~/.bashrc):\n');
    console.log(`  export ${envVar}="${apiKey}"\n`);
    console.log('Then run: source ~/.zshrc\n');

    process.env[envVar] = apiKey;
    return { ok: true, message: '✅ API key ready (remember to add to shell config)' };
  }
}

/**
 * Step 3: Test API Connection
 */
async function testAPIConnection(): Promise<{ ok: boolean; message: string }> {
  console.log('\n🔌 Testing API connection...\n');

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return { ok: false, message: '❌ No API key found' };
  }

  try {
    const { OpenAIClient } = await import('../ai/client');
    const client = new OpenAIClient();

    await client.callText(
      'test-connection',
      'You are a helpful assistant.',
      'Say "hello" in one word.',
      { maxTokens: 500 }  // gpt-5-nano needs headroom for reasoning tokens
    );

    return {
      ok: true,
      message: `✅ ${client.getProvider() === 'anthropic' ? 'Anthropic' : 'OpenAI'} API connection successful (using ${client.getModel()})`
    };
  } catch (error) {
    const errMsg = (error as Error).message;
    return {
      ok: false,
      message: `❌ API connection failed: ${errMsg}`
    };
  }
}

/**
 * Step 4: Check GitHub CLI (optional for Gist upload)
 */
async function checkGitHubCLI(): Promise<{ ok: boolean; message: string; optional: true }> {
  console.log('\n🔍 Checking GitHub CLI (optional, for Gist upload)...\n');

  try {
    const { stdout } = await execAsync('gh --version');
    const version = stdout.split('\n')[0];

    // Check if authenticated
    try {
      await execAsync('gh auth status');
      return {
        ok: true,
        message: `✅ GitHub CLI ${version} (authenticated)`,
        optional: true
      };
    } catch {
      console.log('⚠️  GitHub CLI is installed but not authenticated.\n');
      const shouldAuth = await confirm({
        message: 'Authenticate now? (required for Gist upload)',
        default: false
      });

      if (shouldAuth) {
        console.log('\n📝 Running: gh auth login\n');
        console.log('Please follow the prompts...\n');

        try {
          // Run interactively
          const { exec } = require('child_process');
          await new Promise((resolve, reject) => {
            const proc = exec('gh auth login', { stdio: 'inherit' });
            proc.on('exit', (code: number) => {
              if (code === 0) resolve(true);
              else reject(new Error('Authentication failed'));
            });
          });

          return {
            ok: true,
            message: '✅ GitHub CLI authenticated',
            optional: true
          };
        } catch {
          return {
            ok: false,
            message: '⚠️  GitHub CLI authentication failed (you can skip Gist upload)',
            optional: true
          };
        }
      }

      return {
        ok: false,
        message: '⚠️  GitHub CLI not authenticated (you can still save locally)',
        optional: true
      };
    }
  } catch {
    console.log('ℹ️  GitHub CLI is not installed.\n');
    console.log('To enable Gist upload, install it:');
    console.log('  macOS: brew install gh');
    console.log('  Linux: https://cli.github.com/');
    console.log('  Windows: https://cli.github.com/\n');

    return {
      ok: false,
      message: '⚠️  GitHub CLI not installed (you can still save locally)',
      optional: true
    };
  }
}

/**
 * Step 5: Check Claude Code sessions
 */
async function checkClaudeSessions(): Promise<{ ok: boolean; message: string }> {
  console.log('\n📂 Checking for Claude Code sessions...\n');

  const claudeDir = path.join(process.env.HOME!, '.claude', 'projects');

  try {
    await fs.access(claudeDir);

    // Count sessions
    const projects = await fs.readdir(claudeDir);
    let sessionCount = 0;

    for (const project of projects) {
      const projectPath = path.join(claudeDir, project);
      const stat = await fs.stat(projectPath);
      if (stat.isDirectory()) {
        const files = await fs.readdir(projectPath);
        sessionCount += files.filter(f => f.endsWith('.jsonl')).length;
      }
    }

    if (sessionCount === 0) {
      return {
        ok: false,
        message: '⚠️  No Claude Code sessions found (run Claude Code first to create sessions)'
      };
    }

    return {
      ok: true,
      message: `✅ Found ${sessionCount} Claude Code session(s)`
    };
  } catch {
    return {
      ok: false,
      message: '⚠️  Claude Code directory not found (run Claude Code first)'
    };
  }
}

// ============================================================================
// MAIN SETUP WIZARD
// ============================================================================

export async function runSetupWizard(): Promise<SetupResult> {
  console.clear();
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║    🛠️  Setup Wizard - Claude Code Blog Generator         ║');
  console.log('║                                                           ║');
  console.log('║    Let\'s get everything configured!                       ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Node.js version
  console.log('1️⃣  Checking Node.js version...');
  const nodeCheck = await checkNodeVersion();
  console.log(`   ${nodeCheck.message}\n`);
  if (!nodeCheck.ok) {
    errors.push(nodeCheck.message);
    return { success: false, errors, warnings };
  }

  // Step 2: API Key (Anthropic or OpenAI)
  console.log('2️⃣  Setting up API key...');
  const apiKeyResult = await setupAPIKey();
  console.log(`   ${apiKeyResult.message}\n`);
  if (!apiKeyResult.ok) {
    errors.push(apiKeyResult.message);
  }

  // Step 3: Test API Connection
  if (apiKeyResult.ok) {
    console.log('3️⃣  Testing API connection...');
    const connectionTest = await testAPIConnection();
    console.log(`   ${connectionTest.message}\n`);
    if (!connectionTest.ok) {
      errors.push(connectionTest.message);
    }
  }

  // Step 4: GitHub CLI (optional)
  console.log('4️⃣  Checking GitHub CLI...');
  const ghCheck = await checkGitHubCLI();
  console.log(`   ${ghCheck.message}\n`);
  if (!ghCheck.ok) {
    warnings.push(ghCheck.message);
  }

  // Step 5: Claude sessions
  console.log('5️⃣  Looking for Claude Code sessions...');
  const sessionsCheck = await checkClaudeSessions();
  console.log(`   ${sessionsCheck.message}\n`);
  if (!sessionsCheck.ok) {
    warnings.push(sessionsCheck.message);
  }

  // Summary
  console.log('\n' + '═'.repeat(60) + '\n');
  console.log('📊 Setup Summary\n');

  if (errors.length === 0) {
    console.log('✅ All critical checks passed!\n');

    if (warnings.length > 0) {
      console.log('⚠️  Warnings (optional):');
      warnings.forEach(w => console.log(`   ${w}`));
      console.log('');
    }

    console.log('🎉 You\'re all set! Run `ccblog` to start analyzing sessions.\n');

    return {
      success: true,
      errors: [],
      warnings,
    };
  } else {
    console.log('❌ Setup incomplete. Please fix these issues:\n');
    errors.forEach(e => console.log(`   ${e}`));
    console.log('\nRun `ccblog --setup` again after fixing.\n');

    return { success: false, errors, warnings };
  }
}

/**
 * Quick setup check (non-interactive)
 */
export async function quickSetupCheck(): Promise<{ ready: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    issues.push('No API key set. Set ANTHROPIC_API_KEY or OPENAI_API_KEY (run: ccblog --setup)');
  }

  // Check Node version
  const major = parseInt(process.version.slice(1).split('.')[0]);
  if (major < 18) {
    issues.push(`Node.js ${process.version} is too old (need >=18)`);
  }

  return { ready: issues.length === 0, issues };
}
