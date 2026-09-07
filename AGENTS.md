# Project instructions

## Verification

Never perform in-browser checks or browser automation to verify changes. The user handles browser verification; these checks are too slow and token expensive. Use appropriate non-browser checks, such as type checking and production builds, and report their results. Do not open a browser or start a browser verification workflow unless the user explicitly overrides this instruction.
