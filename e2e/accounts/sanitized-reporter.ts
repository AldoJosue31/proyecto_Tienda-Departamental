import { writeFileSync } from "node:fs";
import type { Reporter, TestCase, TestResult, FullResult, TestStep } from "@playwright/test/reporter";

export function authoredFailedStep(steps: readonly Pick<TestStep, "category" | "title" | "error">[]) {
  return steps.find(step => step.category === "test.step" && step.error)?.title;
}

export default class SanitizedReporter implements Reporter {
  constructor(private readonly options:{reportPath?:string;scope?:string;project?:string}={}) {}
  private checks: { name: string; status: string; passed: boolean; milliseconds: number; failedStep?: string }[] = [];
  onStepBegin(_test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category === "test.step") console.log("CHECK " + step.title);
  }
  onTestEnd(test: TestCase, result: TestResult) {
    // Playwright API step titles include fill values and full URLs. Only our
    // authored test.step names can be written to a user-visible report.
    const failedStep = authoredFailedStep(result.steps);
    const passed = result.status === "passed";
    this.checks.push({ name: test.title, status: result.status, passed, milliseconds: result.duration, ...(failedStep ? { failedStep } : {}) });
    const ambiguous = result.errors.some(error => error.message?.includes("strict mode violation"));
    const location = result.errors.map(error => error.stack?.match(/(?:onboarding|flows)\.spec\.ts:(\d+):\d+/)?.[1]).find(Boolean);
    const statusPair = result.errors.map(error => error.message?.replace(/\u001b\[[0-9;]*m/g, "").match(/Expected:\s*(\d+)\s+[\s\S]*?Received:\s*(\d+)/)).find(match => match && Number(match[1]) <= 599 && Number(match[2]) <= 599);
    // Only a numeric source location is exposed, never the error or stack text.
    console.log(`${passed ? "PASS" : result.status === "skipped" ? "SKIP" : "FAIL"} ${test.title}${ambiguous ? " (AMBIGUOUS_LOCATOR)" : ""}${location && !passed ? ` (SPEC_LINE_${location})` : ""}${statusPair ? ` (EXPECTED_${statusPair[1]}_RECEIVED_${statusPair[2]})` : ""}`);
  }
  onEnd(result: FullResult) {
    writeFileSync(this.options.reportPath ?? "docs/verification-accounts-browser.json", JSON.stringify({ completedAt: new Date().toISOString(), passed: result.status === "passed", project: this.options.project ?? "departamental-five-phases",...(this.options.scope ? {scope:this.options.scope}:{}), checks: this.checks, privacy: { tracesVideosPasswordsTokensExcluded: true } }, null, 2) + "\n");
    console.log(`Browser result: ${result.status}. Detailed errors are omitted to keep credentials and invitation links private.`);
  }
}
