type TestCase = {
  name: string;
  fn: () => void | Promise<void>;
};

const testCases: TestCase[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  testCases.push({ name, fn });
}

export async function run(): Promise<void> {
  let failed = 0;

  for (const testCase of testCases) {
    try {
      await testCase.fn();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
    }
  }

  const passed = testCases.length - failed;
  console.log(`\nTest results: ${passed} passed, ${failed} failed, ${testCases.length} total`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}
