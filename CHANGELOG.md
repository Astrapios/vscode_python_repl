# Change Log

All notable changes to the "pythonREPL" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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