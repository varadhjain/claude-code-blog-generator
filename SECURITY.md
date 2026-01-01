# Security Policy

## API Key Protection

### ✅ Built-in Safeguards

This project is designed with security in mind:

1. **No Hardcoded Keys**: API keys are NEVER hardcoded in source code
2. **Environment Variables Only**: Keys are read from `.env` file or `process.env`
3. **Gitignore Protection**: `.env` files are always gitignored
4. **No Logging**: API keys are never logged or displayed in console output
5. **No Gist Upload**: API keys are never included in generated Gists

### ⚠️ Your Responsibilities

**DO:**
- ✅ Store your `OPENAI_API_KEY` in `.env` file only
- ✅ Keep your `.env` file private (never commit or share)
- ✅ Regenerate your key immediately if accidentally exposed
- ✅ Use environment variables in production/CI: `export OPENAI_API_KEY=...`
- ✅ Review generated output before uploading to Gist

**DON'T:**
- ❌ Commit `.env` to git
- ❌ Share your `.env` file
- ❌ Hardcode API keys in code
- ❌ Upload `.env` to Gist/GitHub
- ❌ Use API keys in file names

### 🔒 Session Data Privacy

Claude Code session files (`.jsonl`) may contain:
- Private source code
- API keys or credentials (if discussed in chat)
- Personal information
- Proprietary business logic

**Protections:**
- `.jsonl` files are gitignored by default
- You control whether to upload to Gist (opt-in)
- You can save locally instead of uploading

**Best Practices:**
1. Review generated `SUMMARY.md` before uploading
2. Use private Gists for sensitive sessions
3. Redact sensitive info from session files before analysis
4. Consider local-only mode for proprietary work

## Private Gist Mode

To make Gists private by default:

1. Open `src/gist-uploader.ts`
2. Find line ~200: `const createCmd = \`gh gist create --public ...\`;`
3. Change to: `const createCmd = \`gh gist create ...\`;` (remove `--public`)
4. Rebuild: `npm run build`

Private Gists are only visible to you (unless you share the URL).

## Token Usage & Costs

The tool uses OpenAI's gpt-5-nano model:
- ~$0.001 per typical session
- Token usage is logged (but not API key)
- You control when analysis runs (manual opt-in)

## Reporting Security Issues

Found a security vulnerability? Please report it privately:

**Email**: [Your contact email] or open a GitHub Security Advisory

**DO NOT** open public issues for security vulnerabilities.

## OpenAI API Key Management

### Getting a Key

1. Visit https://platform.openai.com/api-keys
2. Create new secret key
3. Save it immediately (shown only once)
4. Add to `.env`: `OPENAI_API_KEY=sk-proj-...`

### Rotating Keys

If compromised:
1. Visit https://platform.openai.com/api-keys
2. Delete old key
3. Create new key
4. Update `.env` with new key

### Best Practices

- Use separate keys for dev/prod
- Set usage limits in OpenAI dashboard
- Monitor usage regularly
- Rotate keys periodically (every 90 days)

## Dependency Security

Run security audits regularly:

```bash
npm audit
npm audit fix
```

Keep dependencies updated:

```bash
npm update
```

## License

This security policy is part of the claude-code-blog-generator project (MIT License).
