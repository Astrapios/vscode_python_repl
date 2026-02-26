# Change Log

All notable changes to the "pythonREPL" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.5.2] - 2026-02-26

### Changed
- Improved README with better organization and clarity
- Added "Why Python REPL?" section explaining benefits over Jupyter kernels
- Added Requirements, Troubleshooting, and Contributing sections
- Updated navigation keybinding suggestions to use more reliable vim-compatible bindings:
  - `]]` and `[[` for next/previous cell (instead of `]c`/`[c`)
  - `]s` and `]e` for cell start/end (instead of `{{`/`}}` which don't work reliably)

## [0.5.1] - 2026-02-26

### Fixed
- Fixed `goToPreviousCell` command not working when cursor is positioned right below a cell delimiter
- Previous cell navigation now correctly uses current cell boundaries to find the actual previous cell

## [0.5.0] - 2026-02-26

### Added
- Cell navigation commands for moving through code blocks without executing them:
  - `pythonREPL.goToNextCell` - Navigate to the next cell
  - `pythonREPL.goToPreviousCell` - Navigate to the previous cell
  - `pythonREPL.goToCellStart` - Jump to the start of the current cell
  - `pythonREPL.goToCellEnd` - Jump to the end of the current cell
- Vim-compatible keybinding suggestions in README:
  - `]c` for next cell, `[c` for previous cell
  - `{{` for cell start, `}}` for cell end

## [0.4.5] - 2026-02-26

### Fixed
- Fixed pixi environment detection - pixi environments were incorrectly identified as conda environments because both use conda-meta directory
- Pixi environments now use the interpreter path directly instead of attempting conda activation

## [0.4.4] - 2026-02-26

### Fixed
- Updated development dependencies to resolve deprecation warnings and security vulnerabilities
- Updated glob from 8.x to 13.x (resolves security vulnerabilities)
- Updated @vscode/test-electron to 2.5.2 (resolves whatwg-encoding and prebuild-install deprecation warnings)
- Updated @types packages to latest compatible versions
- Fixed all npm audit security vulnerabilities

### Changed
- Updated mocha, eslint, typescript-eslint, and other dev dependencies to latest compatible versions

## [0.4.3] - 2026-02-26

### Fixed
- Reduced extension package size by excluding unnecessary files (source files, node_modules, tests, build artifacts) in .vscodeignore
- Removed unused "timers" dependency that was never imported in the code

### Changed
- Extension now packages only compiled JavaScript files from /out directory, significantly reducing file count from 1034 to minimal set

## [0.4.2] - 2026-02-26

### Fixed
- Improved environment detection to robustly identify conda environments by checking for `conda-meta` directory instead of fragile path string matching
- Fixed support for modern Python environment managers (pixi, poetry, uv, venv) by using interpreter path directly instead of requiring activation commands
- Fixed cross-platform compatibility by removing Unix-specific activation assumptions for non-conda environments

### Changed
- Environment auto-detection now only activates conda environments; all other environments use the interpreter path directly
- Increased default terminal initialization timeout from 100ms to 1000ms for more reliable environment activation

## [0.4.1]

- Initial release