# Changelog

All notable changes to Jupiter CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-01-08

### Added
- DigiSquares provider with multi-model support (O4-mini, O3-mini, 4.1, Opus-4, Sonnet-4)
- Provider configuration dialog with interactive selection
- Clear provider command (`/provider clear` and `/clear-provider`)
- Additional slash commands:
  - `/docs` - Open documentation in browser
  - `/editor` - Configure code editor
  - `/privacy` - View privacy policy
  - `/stats` - Session statistics
  - `/memory` commands for context management
  - `/chat` commands for conversation management
  - `/compress` - Compress chat history
- Consistent theme colors across all platforms
- Fixed input box at bottom (Gemini CLI style)
- User feedback when attempting to chat without provider configured

### Changed
- Improved provider configuration UI with step-by-step wizard
- Enhanced error messages with consistent formatting
- Removed all confirmation prompts - actions execute immediately with status messages
- Updated theme system with fixed hex colors instead of system-dependent colors
- Banner now displays only once at the top
- Application continues running after clearing provider (no automatic exit)

### Fixed
- Theme color consistency across Windows and macOS
- Provider clear logic now checks if provider exists before clearing
- Fixed "No provider configured" vs "Provider cleared successfully" inconsistency
- Fixed application exit issue after clearing provider
- Fixed banner re-rendering issue
- Fixed initialization error box display
- Improved provider existence validation

### Improved
- User experience with immediate action execution
- Error handling and user feedback
- Provider configuration workflow
- Documentation updated with all new features
- Added clear feedback when user tries to chat without provider configured
- Fixed "This is the Gemini CLI" reference to "This is the Jupiter CLI"

## [0.1.0] - 2025-01-06

### Added
- Initial alpha release of Jupiter CLI
- Multi-provider AI support:
  - Azure OpenAI (GPT-4, O-series models)
  - OpenAI (GPT-4, GPT-3.5 Turbo)
  - Anthropic (Claude 3 Opus, Sonnet)
  - Google Gemini (Pro, Pro Vision)
  - Databricks (Claude Sonnet 4)
- Gemini CLI integration via adapter pattern
- File context support with @filename syntax
- Memory persistence with JUPITER.md files
- Theme system (Dark, Light, Neo, Classic)
- Security features:
  - Input sanitization
  - XSS protection
  - Command injection prevention
  - Path traversal prevention
- Interactive and non-interactive modes
- Streaming response support
- Comprehensive error handling
- TypeScript support with tsx
- Provider registry with fallback support
- Configuration via environment variables

### Changed
- Version reset from 1.1.52 to 0.1.0 for alpha release
- Updated documentation to reflect all features
- Enhanced README with provider details and examples

### Fixed
- TelemetryEvent export type issue
- Azure OpenAI max_completion_tokens parameter handling
- Missing git-commit.js file
- TypeScript module resolution errors
- Provider configuration issues

### Known Issues
- Databricks endpoint may return "TEMPORARILY_UNAVAILABLE" until activated
- Some TypeScript compilation warnings remain
- Gemini provider requires additional testing

### Security
- All user inputs are sanitized before processing
- API keys are stored securely in environment variables
- No telemetry or usage data is collected

## [Future Releases]

### Planned for 0.2.0
- Global npm package installation
- Additional provider support (Cohere, Hugging Face)
- Plugin system for custom extensions
- Improved error recovery
- Performance optimizations
- Enhanced documentation

### Planned for 1.0.0
- Production-ready stability
- Enterprise features
- Team collaboration tools
- Advanced memory management
- Custom model fine-tuning support