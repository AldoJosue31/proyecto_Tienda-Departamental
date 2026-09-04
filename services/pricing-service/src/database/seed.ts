import "../config/load-env";

if (process.env.NODE_ENV === "production") {
  process.stderr.write("Pricing seed is disabled in production.\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Pricing has no automatic local promotions to seed.\n");
}
