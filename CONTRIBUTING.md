# Contributing to Claude Code Blog Generator

Thank you for your interest in contributing! This project is in active development.

## Getting Started

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/varadhjain/claude-code-blog-generator.git
   cd claude-code-blog-generator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Read the plan**
   - Review [PLAN.md](./PLAN.md) for architecture and implementation strategy
   - Check [open issues](https://github.com/varadhjain/claude-code-blog-generator/issues)

4. **Set up development environment**
   ```bash
   # Watch mode for development
   npm run dev

   # Run tests
   npm test

   # Run linter
   npm run lint
   ```

## Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Write tests for new functionality
4. Ensure tests pass: `npm test`
5. Lint your code: `npm run lint`
6. Commit with descriptive messages
7. Push to your fork
8. Open a pull request

## Areas We'd Love Help With

### High Priority
- [ ] **Session Parser** - Parse JSONL files and reconstruct conversation flow
- [ ] **Phase Detector** - Implement GPT-5-nano phase detection
- [ ] **Context Tracker** - Maintain persistent context across phases
- [ ] **PII Redactor** - Smart redaction with GPT-5-nano

### Medium Priority
- [ ] **Blog Generator** - Mitchell-style narrative generation
- [ ] **Thread Generator** - Interactive minimap view
- [ ] **Templates** - Additional templates (tutorial, postmortem, case study)
- [ ] **Documentation** - Usage examples, tutorials, guides

### Nice to Have
- [ ] **Web UI** - Browser-based interface for non-technical users
- [ ] **Custom Plugins** - Plugin system for custom templates
- [ ] **Multi-session** - Combine related sessions into one blog post
- [ ] **Analytics** - Token usage tracking and cost estimation

## Code Style

- Use TypeScript with strict mode
- Follow ESLint configuration
- Format code with Prettier
- Write descriptive variable names
- Add comments for complex logic
- Include JSDoc for public APIs

## Testing

- Write unit tests for new functionality
- Aim for >80% code coverage
- Test edge cases and error handling
- Use fixtures from `tests/fixtures/`

## Pull Request Guidelines

- Reference related issues
- Describe what your PR does and why
- Include screenshots for UI changes
- Ensure CI passes
- Request review from maintainers

## Questions?

- Open a [discussion](https://github.com/varadhjain/claude-code-blog-generator/discussions)
- Comment on related issues
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
