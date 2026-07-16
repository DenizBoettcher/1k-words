// Augments the Wrangler-generated CloudflareBindings with vars that come from
// secrets / .dev.vars (which wrangler types only picks up once they are set).
// After adding ADMIN_EMAIL to .dev.vars and running `npm run cf-typegen`, this
// file is harmless (interface merging) but keeps the project compiling before then.
interface CloudflareBindings {
  JWT_SECRET: string;
  ADMIN_EMAIL?: string;
}
