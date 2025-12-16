# Rules Doctor

A simple TypeScript tool for checking GitHub repositories against configurable rules using regex patterns.

See a report of the latest nightly run at [![Run Rules Doctor](https://github.com/alexeagle/rules-doctor/actions/workflows/run-doctor.yaml/badge.svg)](https://github.com/alexeagle/rules-doctor/actions/workflows/run-doctor.yaml)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

## Usage

Run checks using the default config file:
```bash
npm start
```

Or specify a custom config file:
```bash
npm start path/to/your/config.json
```

For development (build and run in one command):
```bash
npm run dev
```

## Configuration

Create a `config.json` file with the following structure:

```json
{
  "repositories": [
    {
      "name": "my-repo",
      "url": "https://github.com/owner/repo",
      "checks": [
        {
          "name": "check-name",
          "file": "path/to/file.txt",
          "pattern": "regex-pattern",
          "description": "Optional description"
        }
      ]
    }
  ]
}
```

### Example Checks

- **File exists**: Use pattern `.*` to check if a file exists
- **Contains text**: Use pattern `some text` to check if file contains specific text
- **Release script check**: Use pattern `docs\\.tar\\.gz` to check if release_prep.sh includes docs.tar.gz
- **Package.json validation**: Use pattern `"name":` to check if package.json has a name field

## Output

The tool will:
- Report progress as it checks each repository
- Show ✅ if all checks pass
- Show ❌ with details for any failed checks
- Exit with code 1 if any checks fail (useful for CI/CD)

## Project Structure

```
├── src/
│   ├── types.ts      # TypeScript interfaces
│   ├── checker.ts    # Repository checking logic
│   └── index.ts      # Main entry point
├── config.json       # Example configuration
├── package.json      # Dependencies and scripts
└── tsconfig.json     # TypeScript configuration
```
