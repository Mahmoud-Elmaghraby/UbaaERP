// Jest's "projects" mode doesn't accept a per-project `testTimeout` key
// (silently ignored with a "Unknown option" warning — verified against
// this Jest version) — jest.setTimeout() in a setupFilesAfterEnv hook is
// the supported way to raise it for just this project's real-DB round
// trips, without affecting the unit project's default (fast-fail) timeout.
jest.setTimeout(20000);
